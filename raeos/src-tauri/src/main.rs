#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use serde_json::json;
use tauri::{Emitter, State, Window};
use tokio::sync::mpsc;
use tokio::time::{sleep, Duration};
use tracing::{debug, error, info, warn};

struct AppState {
    /// Base URL for the OpenAI-compatible server (llama.cpp server)
    base_url: String,
    /// API key required by llama-server (can be empty if you didn't launch with --api-key)
    api_key: String,
    /// Channel for buffering memory ingest items
    memory_tx: mpsc::UnboundedSender<IngestItem>,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
struct Message {
    role: String,
    content: String,
}

#[derive(Debug, Deserialize)]
struct ChatInput {
    /// User message; we'll wrap it into OpenAI-style messages
    message: String,
    /// Optional system prompt to prepend
    system: Option<String>,
    /// Optional model name (for multi-model setups)
    model: Option<String>,
    /// Temperature override
    temperature: Option<f32>,
}

/// Replacement for the previous `call_openai` — now speaks to your local Qwen server
/// running llama.cpp's OpenAI-compatible `/v1/chat/completions` on port 5050.
#[tauri::command]
async fn call_qwen(window: Window, state: State<'_, AppState>, input: ChatInput) -> Result<(), String> {
    let client = reqwest::Client::new();

    // Build messages array: optional system + user
    let mut messages: Vec<Message> = Vec::new();
    if let Some(sys) = &input.system {
        if !sys.trim().is_empty() {
            messages.push(Message { role: "system".into(), content: sys.clone() });
        }
    }
    messages.push(Message { role: "user".into(), content: input.message.clone() });

    // Compose request
    let url = format!("{}/chat/completions", state.base_url);
    let temperature = input.temperature.unwrap_or(0.7);
    let model = input.model.clone().unwrap_or_else(|| "qwen2.5-3b-gguf".to_string());

    let body = json!({
        "model": model,
        "messages": messages,
        "temperature": temperature,
        "stream": true
    });

    info!(target = "qwen", %url, temperature, model, "Sending chat request");
    info!(target = "qwen", "Request body: {}", serde_json::to_string_pretty(&body).unwrap_or_else(|_| body.to_string()));

    let mut req = client.post(&url)
        .header("Content-Type", "application/json")
        .json(&body);

    // Log request headers
    info!(target = "qwen", "Request headers: Content-Type: application/json");

    // Bearer token only if provided (matches llama-server --api-key)
    if !state.api_key.is_empty() {
        req = req.bearer_auth(&state.api_key);
        info!(target = "qwen", "Authorization header: Bearer [REDACTED]");
    } else {
        info!(target = "qwen", "No Authorization header (server started without --api-key)");
    }

    info!(target = "qwen", "Making HTTP POST request to: {}", url);

    let resp = req.send().await.map_err(|e| {
        error!(target = "qwen", error = %e, "Request error");
        e.to_string()
    })?;

    let status = resp.status();
    let headers = resp.headers().clone();
    
    // Log response information
    info!(target = "qwen", "Response status: {}", status);
    info!(target = "qwen", "Response headers: {:?}", headers);
    
    if !status.is_success() {
        let text = resp.text().await.unwrap_or_default();
        error!(target = "qwen", %status, "Server returned non-success response body: {}", text);
        return Err(format!("server responded {status}: {text}"));
    }

    info!(target = "qwen", "Streaming response started");

    // SSE stream from llama.cpp: lines prefixed with "data: {json}\n\n".
    let mut stream = resp.bytes_stream();
    let mut buffer = String::new();
    let mut total_content = String::new(); // Track complete response content for logging

    while let Some(chunk) = stream.next().await {
        let bytes = match chunk {
            Ok(b) => b,
            Err(e) => {
                error!(target = "qwen", error = %e, "Stream error");
                return Err(format!("stream error: {e}"));
            }
        };
        let piece = String::from_utf8_lossy(&bytes);
        buffer.push_str(&piece);

        // Process complete lines; keep a tail if partial
        let mut last_newline_idx = 0usize;
        for line in buffer.split('\n') {
            last_newline_idx += line.len() + 1; // +1 for the split newline char

            let trimmed = line.trim_start();
            if !trimmed.starts_with("data:") { continue; }
            let payload = trimmed.trim_start_matches("data:").trim();
            if payload == "[DONE]" { 
                info!(target = "qwen", "Stream finished - Complete response content: {}", total_content); 
                break; 
            }
            if payload.is_empty() { continue; }

            // Log raw stream payload
            debug!(target = "qwen", "Raw stream payload: {}", payload);

            // Try to parse the JSON line from the stream
            match serde_json::from_str::<serde_json::Value>(payload) {
                Ok(v) => {
                    let delta = v["choices"][0]["delta"]["content"].as_str().unwrap_or("");
                    if !delta.is_empty() {
                        debug!(target = "qwen", chunk_len = delta.len(), chunk_content = %delta, "Emitting delta chunk");
                        total_content.push_str(delta);
                        let _ = window.emit("chat:delta", delta);
                    }
                }
                Err(e) => {
                    debug!(target = "qwen", error = %e, "Failed to parse stream JSON; trying fallback");
                    if let Ok(v) = serde_json::from_str::<serde_json::Value>(payload) {
                        if let Some(s) = v.get("content").and_then(|c| c.as_str()) {
                            debug!(target = "qwen", chunk_len = s.len(), chunk_content = %s, "Emitting fallback delta chunk");
                            total_content.push_str(s);
                            let _ = window.emit("chat:delta", s);
                        }
                    }
                }
            }
        }

        // Retain only the incomplete tail (if any)
        if last_newline_idx < buffer.len() {
            let tail = buffer[last_newline_idx..].to_string();
            buffer.clear();
            buffer.push_str(&tail);
        } else {
            buffer.clear();
        }
    }

    Ok(())
}

/// Keep your existing helper (unchanged). Example placeholder that runs a local command
#[tauri::command]
fn run_command(cmd: String, args: Vec<String>) -> Result<String, String> {
    use std::process::Command;
    let out = Command::new(cmd)
        .args(args)
        .output()
        .map_err(|e| format!("Command failed: {e}"))?;
    Ok(String::from_utf8_lossy(&out.stdout).to_string())
}

// ============================================================================
// Memory Daemon Integration
// ============================================================================

#[derive(Debug, Serialize, Deserialize, Clone)]
struct IngestItem {
    #[serde(skip_serializing_if = "Option::is_none")]
    ts: Option<i64>,
    kind: String,
    text: String,
    #[serde(default)]
    meta: serde_json::Value,
    #[serde(default = "default_source")]
    source: String,
}

fn default_source() -> String {
    "tauri".to_string()
}

#[derive(Debug, Serialize, Deserialize)]
struct IngestBatch {
    items: Vec<IngestItem>,
    #[serde(skip_serializing_if = "Option::is_none")]
    debounce_ms: Option<u64>,
    model: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct SearchQuery {
    query: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    top_k: Option<usize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    filter_kind: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    since_ms: Option<i64>,
}

// ============================================================================
// Buffered Ingest System
// ============================================================================

const BATCH_SIZE: usize = 64;
const FLUSH_INTERVAL_SECS: u64 = 5;

/// Background task that buffers IngestItems and flushes them in batches
async fn memory_buffer_task(mut rx: mpsc::UnboundedReceiver<IngestItem>) {
    let mut buffer: Vec<IngestItem> = Vec::with_capacity(BATCH_SIZE);
    let mem_url = std::env::var("MEMORY_DAEMON_URL")
        .unwrap_or_else(|_| "http://127.0.0.1:8765".into());

    info!("Memory buffer task started (batch_size={}, flush_interval={}s)", BATCH_SIZE, FLUSH_INTERVAL_SECS);

    loop {
        tokio::select! {
            // Receive items from channel
            item = rx.recv() => {
                match item {
                    Some(item) => {
                        buffer.push(item);
                        debug!("Buffered item (buffer_size={})", buffer.len());

                        // Flush when batch size reached
                        if buffer.len() >= BATCH_SIZE {
                            flush_buffer(&mut buffer, &mem_url).await;
                        }
                    }
                    None => {
                        // Channel closed, flush remaining and exit
                        warn!("Memory buffer channel closed, flushing {} items", buffer.len());
                        if !buffer.is_empty() {
                            flush_buffer(&mut buffer, &mem_url).await;
                        }
                        break;
                    }
                }
            }
            // Periodic flush timeout
            _ = sleep(Duration::from_secs(FLUSH_INTERVAL_SECS)) => {
                if !buffer.is_empty() {
                    debug!("Flush timeout reached, flushing {} items", buffer.len());
                    flush_buffer(&mut buffer, &mem_url).await;
                }
            }
        }
    }

    info!("Memory buffer task stopped");
}

/// Flush buffered items to the memory daemon
async fn flush_buffer(buffer: &mut Vec<IngestItem>, mem_url: &str) {
    if buffer.is_empty() {
        return;
    }

    let count = buffer.len();
    let batch = IngestBatch {
        items: buffer.drain(..).collect(),
        debounce_ms: Some(300),
        model: "bge-small-en-v1.5".into(),
    };

    info!(url=%mem_url, item_count=count, "Flushing batch to memory daemon");

    match reqwest::Client::new()
        .post(format!("{}/ingest", mem_url))
        .json(&batch)
        .send()
        .await
    {
        Ok(resp) => {
            if resp.status().is_success() {
                match resp.json::<serde_json::Value>().await {
                    Ok(result) => {
                        info!(count=count, result=?result, "Batch ingested successfully");
                    }
                    Err(e) => {
                        error!(error=%e, "Failed to parse ingest response");
                    }
                }
            } else {
                let status = resp.status();
                let body = resp.text().await.unwrap_or_default();
                error!(status=%status, body=%body, "Memory daemon batch ingest failed");
            }
        }
        Err(e) => {
            error!(error=%e, count=count, "Failed to send batch to memory daemon");
        }
    }
}

/// Queue an item for buffered ingestion
#[tauri::command]
async fn mem_ingest_buffered(state: State<'_, AppState>, item: IngestItem) -> Result<(), String> {
    state.memory_tx.send(item)
        .map_err(|e| format!("Failed to queue item: {}", e))?;
    Ok(())
}

/// Queue multiple items for buffered ingestion
#[tauri::command]
async fn mem_ingest_buffered_batch(state: State<'_, AppState>, items: Vec<IngestItem>) -> Result<(), String> {
    for item in items {
        state.memory_tx.send(item)
            .map_err(|e| format!("Failed to queue item: {}", e))?;
    }
    Ok(())
}

// ============================================================================
// Direct Ingest (Unbuffered)
// ============================================================================

/// Ingest items into the memory daemon for embedding and storage (immediate, unbuffered)
#[tauri::command]
async fn mem_ingest(items: Vec<IngestItem>) -> Result<serde_json::Value, String> {
    let mem_url = std::env::var("MEMORY_DAEMON_URL")
        .unwrap_or_else(|_| "http://127.0.0.1:8765".into());
    
    let batch = IngestBatch {
        items,
        debounce_ms: Some(300),
        model: "bge-small-en-v1.5".into(),
    };
    
    info!(url=%mem_url, item_count=batch.items.len(), "Ingesting items to memory daemon");
    
    let resp = reqwest::Client::new()
        .post(format!("{}/ingest", mem_url))
        .json(&batch)
        .send()
        .await
        .map_err(|e| {
            error!(error=%e, "Failed to connect to memory daemon");
            format!("Memory daemon connection failed: {}", e)
        })?;
    
    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        error!(status=%status, body=%body, "Memory daemon ingest failed");
        return Err(format!("Memory daemon error {}: {}", status, body));
    }
    
    resp.json().await.map_err(|e| {
        error!(error=%e, "Failed to parse memory daemon response");
        format!("Failed to parse response: {}", e)
    })
}

/// Search the memory daemon using semantic similarity
#[tauri::command]
async fn mem_search(q: SearchQuery) -> Result<serde_json::Value, String> {
    let mem_url = std::env::var("MEMORY_DAEMON_URL")
        .unwrap_or_else(|_| "http://127.0.0.1:8765".into());
    
    info!(url=%mem_url, query=%q.query, top_k=?q.top_k, "Searching memory daemon");
    
    let resp = reqwest::Client::new()
        .post(format!("{}/search", mem_url))
        .json(&q)
        .send()
        .await
        .map_err(|e| {
            error!(error=%e, "Failed to connect to memory daemon");
            format!("Memory daemon connection failed: {}", e)
        })?;
    
    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        error!(status=%status, body=%body, "Memory daemon search failed");
        return Err(format!("Memory daemon error {}: {}", status, body));
    }
    
    resp.json().await.map_err(|e| {
        error!(error=%e, "Failed to parse memory daemon response");
        format!("Failed to parse response: {}", e)
    })
}

// ============================================================================
// Context Building
// ============================================================================

#[derive(Debug, Serialize, Deserialize)]
struct BuildContextRequest {
    user_input: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    token_budget: Option<i32>,
}

#[derive(Debug, Serialize, Deserialize)]
struct BuildContextResponse {
    prompt: String,
    #[serde(default)]
    chosen_ids: Vec<String>,
    #[serde(default)]
    stats: serde_json::Value,
}

/// Build context from memory for LLM prompts
/// Calls the context service which assembles: persona + recent messages + semantic recall + fresh events
#[tauri::command]
async fn build_context(user_input: String, token_budget: Option<i32>) -> Result<BuildContextResponse, String> {
    let mem_url = std::env::var("MEMORY_DAEMON_URL")
        .unwrap_or_else(|_| "http://127.0.0.1:8765".into());
    
    let req = BuildContextRequest {
        user_input: user_input.clone(),
        token_budget,
    };
    
    info!(url=%mem_url, user_input_len=user_input.len(), token_budget=?token_budget, "Building context from memory");
    
    let resp = reqwest::Client::new()
        .post(format!("{}/context/build", mem_url))
        .json(&req)
        .send()
        .await
        .map_err(|e| {
            error!(error=%e, "Failed to connect to memory daemon for context building");
            format!("Memory daemon connection failed: {}", e)
        })?;
    
    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        error!(status=%status, body=%body, "Context building failed");
        return Err(format!("Context building error {}: {}", status, body));
    }
    
    let context_resp: BuildContextResponse = resp.json().await.map_err(|e| {
        error!(error=%e, "Failed to parse context building response");
        format!("Failed to parse response: {}", e)
    })?;
    
    info!(
        prompt_len=context_resp.prompt.len(),
        chosen_count=context_resp.chosen_ids.len(),
        stats=?context_resp.stats,
        "Context built successfully"
    );
    
    Ok(context_resp)
}

/// Enhanced chat command that uses context service before calling Qwen
/// This implements the full architectural flow:
/// 1. Build context from memory (recent + recall + fresh events)
/// 2. Send assembled prompt to Qwen
/// 3. Stream response back to frontend
#[tauri::command]
async fn chat_with_context(
    window: Window,
    state: State<'_, AppState>,
    message: String,
    token_budget: Option<i32>,
    model: Option<String>,
    temperature: Option<f32>,
) -> Result<(), String> {
    info!(message_len=message.len(), "Starting chat with context");
    
    // Step 1: Build context from memory
    let context_resp = build_context(message.clone(), token_budget).await?;
    
    info!(
        prompt_len=context_resp.prompt.len(),
        chosen_ids_count=context_resp.chosen_ids.len(),
        "Context assembled, sending to Qwen"
    );
    
    // Debug: Log the first 500 chars of assembled prompt
    let preview = if context_resp.prompt.len() > 500 {
        format!("{}...", &context_resp.prompt[..500])
    } else {
        context_resp.prompt.clone()
    };
    info!("Assembled prompt preview: {}", preview);
    
    // Step 2: Call Qwen with the assembled prompt
    let client = reqwest::Client::new();
    
    let messages = vec![
        Message {
            role: "user".into(),
            content: context_resp.prompt,
        }
    ];
    
    let url = format!("{}/chat/completions", state.base_url);
    let temperature = temperature.unwrap_or(0.7);
    let model = model.unwrap_or_else(|| "qwen2.5-3b-gguf".to_string());
    
    let body = json!({
        "model": model,
        "messages": messages,
        "temperature": temperature,
        "stream": true
    });
    
    info!(target = "qwen", %url, temperature, model, "Sending contextual chat request");
    
    let mut req = client.post(&url)
        .header("Content-Type", "application/json")
        .json(&body);
    
    if !state.api_key.is_empty() {
        req = req.bearer_auth(&state.api_key);
    }
    
    let resp = req.send().await.map_err(|e| {
        error!(target = "qwen", error = %e, "Request error");
        e.to_string()
    })?;
    
    let status = resp.status();
    
    if !status.is_success() {
        let text = resp.text().await.unwrap_or_default();
        error!(target = "qwen", %status, "Server returned non-success response: {}", text);
        return Err(format!("server responded {status}: {text}"));
    }
    
    info!(target = "qwen", "Streaming contextual response started");
    
    // Step 3: Stream response
    let mut stream = resp.bytes_stream();
    let mut buffer = String::new();
    let mut total_content = String::new();
    
    while let Some(chunk) = stream.next().await {
        let bytes = match chunk {
            Ok(b) => b,
            Err(e) => {
                error!(target = "qwen", error = %e, "Stream error");
                return Err(format!("stream error: {e}"));
            }
        };
        let piece = String::from_utf8_lossy(&bytes);
        buffer.push_str(&piece);
        
        let mut last_newline_idx = 0usize;
        for line in buffer.split('\n') {
            last_newline_idx += line.len() + 1;
            
            let trimmed = line.trim_start();
            if !trimmed.starts_with("data:") { continue; }
            let payload = trimmed.trim_start_matches("data:").trim();
            if payload == "[DONE]" {
                info!(target = "qwen", "Stream finished - Complete response: {}", total_content);
                break;
            }
            if payload.is_empty() { continue; }
            
            match serde_json::from_str::<serde_json::Value>(payload) {
                Ok(v) => {
                    let delta = v["choices"][0]["delta"]["content"].as_str().unwrap_or("");
                    if !delta.is_empty() {
                        total_content.push_str(delta);
                        let _ = window.emit("chat:delta", delta);
                    }
                }
                Err(e) => {
                    debug!(target = "qwen", error = %e, "Failed to parse stream JSON");
                }
            }
        }
        
        if last_newline_idx < buffer.len() {
            let tail = buffer[last_newline_idx..].to_string();
            buffer.clear();
            buffer.push_str(&tail);
        } else {
            buffer.clear();
        }
    }
    
    Ok(())
}

/// Request a daily summary from the memory daemon
#[tauri::command]
async fn mem_summarize_daily(day: Option<String>) -> Result<serde_json::Value, String> {
    let mem_url = std::env::var("MEMORY_DAEMON_URL")
        .unwrap_or_else(|_| "http://127.0.0.1:8765".into());
    
    info!(url=%mem_url, day=?day, "Requesting daily summary from memory daemon");
    
    let mut body = serde_json::Map::new();
    if let Some(d) = day {
        body.insert("day".to_string(), json!(d));
    }
    
    let resp = reqwest::Client::new()
        .post(format!("{}/summarize/daily", mem_url))
        .json(&body)
        .send()
        .await
        .map_err(|e| {
            error!(error=%e, "Failed to connect to memory daemon");
            format!("Memory daemon connection failed: {}", e)
        })?;
    
    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        error!(status=%status, body=%body, "Memory daemon summarize failed");
        return Err(format!("Memory daemon error {}: {}", status, body));
    }
    
    resp.json().await.map_err(|e| {
        error!(error=%e, "Failed to parse memory daemon response");
        format!("Failed to parse response: {}", e)
    })
}

// ============================================================================

/// Background task to trigger daily summary at 23:55 local time
async fn daily_summary_scheduler() {
    use chrono::{Local, Timelike};
    
    info!("Daily summary scheduler started - will trigger at 23:55 local time");
    
    loop {
        let now = Local::now();
        let target_hour = 23;
        let target_minute = 55;
        
        // Calculate next trigger time
        let mut next_trigger = now
            .with_hour(target_hour).unwrap()
            .with_minute(target_minute).unwrap()
            .with_second(0).unwrap()
            .with_nanosecond(0).unwrap();
        
        // If we've passed today's trigger time, schedule for tomorrow
        if now >= next_trigger {
            next_trigger = next_trigger + chrono::Duration::days(1);
        }
        
        let duration_until_trigger = (next_trigger - now).to_std().unwrap_or(Duration::from_secs(60));
        
        info!(
            next_trigger=%next_trigger.format("%Y-%m-%d %H:%M:%S"),
            wait_seconds=duration_until_trigger.as_secs(),
            "Next daily summary scheduled"
        );
        
        // Wait until trigger time
        sleep(duration_until_trigger).await;
        
        // Trigger the daily summary
        info!("Triggering daily summary...");
        
        let mem_url = std::env::var("MEMORY_DAEMON_URL")
            .unwrap_or_else(|_| "http://127.0.0.1:8765".into());
        
        match reqwest::Client::new()
            .post(format!("{}/summarize/daily", mem_url))
            .json(&serde_json::json!({}))
            .send()
            .await
        {
            Ok(resp) => {
                if resp.status().is_success() {
                    match resp.json::<serde_json::Value>().await {
                        Ok(result) => {
                            info!(result=?result, "Daily summary completed successfully");
                        }
                        Err(e) => {
                            error!(error=%e, "Failed to parse daily summary response");
                        }
                    }
                } else {
                    let status = resp.status();
                    let body = resp.text().await.unwrap_or_default();
                    error!(status=%status, body=%body, "Daily summary request failed");
                }
            }
            Err(e) => {
                error!(error=%e, "Failed to send daily summary request");
            }
        }
        
        // Sleep a bit to avoid triggering multiple times in the same minute
        sleep(Duration::from_secs(70)).await;
    }
}

fn main() {
    // Load environment variables from .env file
    dotenv::dotenv().ok();
    
    // Initialize structured logging (RUST_LOG controls level, e.g., RUST_LOG=debug)
    let _ = tracing_subscriber::fmt()
        .with_target(false)
        .compact()
        .try_init();

    // Read envs; fall back to local llama.cpp defaults
    let base_url = std::env::var("AI_BASE_URL").unwrap_or_else(|_| "http://127.0.0.1:5050/v1".into());
    let api_key  = std::env::var("AI_API_KEY").unwrap_or_default();

    info!(base_url=%base_url, api_key_set=!api_key.is_empty(), "Starting Tauri backend with OpenAI-compatible Qwen server");

    // Create channel for buffered memory ingestion
    let (memory_tx, memory_rx) = mpsc::unbounded_channel::<IngestItem>();

    tauri::Builder::default()
        .manage(AppState { 
            base_url, 
            api_key,
            memory_tx
        })
        .setup(|app| {
            // Spawn background tasks using Tauri's async runtime
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                tokio::spawn(memory_buffer_task(memory_rx));
                tokio::spawn(daily_summary_scheduler());
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            call_qwen,
            run_command,
            mem_ingest,
            mem_ingest_buffered,
            mem_ingest_buffered_batch,
            mem_search,
            build_context,
            chat_with_context,
            mem_summarize_daily
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri app");
}
