# Context-Aware Chat Architecture

## Overview

Rae now uses a **context service** to intelligently inject relevant memories into every conversation. This creates a seamless memory-aware chat experience.

## Architecture Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                        Tauri Chat UI                            │
│  • User types message                                           │
│  • Auto-saves to memory buffer                                  │
│  • Calls chat_with_context()                                    │
└───────────────────────┬─────────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────────┐
│                   Rust Backend (main.rs)                        │
│  chat_with_context() command:                                   │
│    1. Calls build_context(message, token_budget)                │
│    2. Receives assembled prompt with context                    │
│    3. Sends prompt to Qwen via call_qwen()                      │
│    4. Streams response back to UI                               │
└───────────────────────┬─────────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────────┐
│              Context Service (Python FastAPI)                   │
│  /context/build endpoint:                                       │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ 1. Load Persona                                          │  │
│  │    → Read from PERSONA_PATH                              │  │
│  │    → Default: "You are 'Rae'..."                         │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ 2. Recent Events (N_RECENT = 6)                          │  │
│  │    → last_messages(6)                                    │  │
│  │    → SQL: WHERE kind IN ('chat:user', 'chat:ai')         │  │
│  │    → ORDER BY ts DESC                                    │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ 3. Semantic Recall (K_RECALL = 8)                        │  │
│  │    → search_embeddings(query, 8)                         │  │
│  │    → Keyword-based fallback (TODO: use vector MATCH)     │  │
│  │    → Finds semantically similar past conversations       │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ 4. Fresh Events (FRESH_HOURS = 24)                       │  │
│  │    → last_hours(24)                                      │  │
│  │    → SQL: WHERE ts >= cutoff_ms                          │  │
│  │    → Captures recent activity context                    │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ 5. Merge + Deduplicate                                   │  │
│  │    → Combines: recent + recall + fresh                   │  │
│  │    → dedupe_by_id() removes duplicates                   │  │
│  │    → Maintains order: recent > recall > fresh            │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ 6. Token Budget Management (TOKEN_BUDGET = 2048)         │  │
│  │    → estimate_tokens(text) ≈ len(text) / 4              │  │
│  │    → Reserve space for: persona + user query             │  │
│  │    → Trim context to fit within budget                   │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ 7. Assemble Prompt                                       │  │
│  │    Format:                                               │  │
│  │    <persona>                                             │  │
│  │                                                          │  │
│  │    [Context]                                             │  │
│  │    chat:user: <message>                                  │  │
│  │    chat:ai: <response>                                   │  │
│  │    ...                                                   │  │
│  │                                                          │  │
│  │    [User]                                                │  │
│  │    <current user message>                                │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                  │
│  Returns:                                                        │
│    {                                                             │
│      "prompt": "<assembled prompt>",                             │
│      "chosen_ids": ["13", "14", ...],                            │
│      "stats": {                                                  │
│        "recent": 6,                                              │
│        "recall": 8,                                              │
│        "fresh": 18,                                              │
│        "used_tokens_est": 505,                                   │
│        "budget": 2048                                            │
│      }                                                            │
│    }                                                             │
└───────────────────────┬─────────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────────┐
│                   Qwen LLM Server (llama.cpp)                   │
│  • Receives assembled prompt with full context                  │
│  • Generates response using Qwen2.5-3b model                    │
│  • Streams response back via SSE                                │
│  • Endpoint: http://127.0.0.1:5050/v1/chat/completions          │
└───────────────────────┬─────────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Response Flow                              │
│  1. Stream chunks back through Rust → Tauri → UI                │
│  2. UI displays response in real-time                           │
│  3. Auto-save AI response to memory (buffered)                  │
│  4. Memory buffer flushes to daemon (batch or timeout)          │
└─────────────────────────────────────────────────────────────────┘
```

## Configuration

### Context Service (`memory-daemon/context_service/config.py`)

```python
DB_PATH = "memory.db"           # SQLite database with events
PERSONA_PATH = "persona.txt"    # Persona description file
TOKEN_BUDGET = 2048             # Max tokens for context
N_RECENT = 6                    # Recent chat turns to include
K_RECALL = 8                    # Semantic recall results
FRESH_HOURS = 24                # Include events from last N hours
```

### Environment Variables

```bash
# Memory Daemon
MEMORY_DAEMON_URL=http://127.0.0.1:8765
MEM_DB=memory.db

# Qwen Server
AI_BASE_URL=http://127.0.0.1:5050/v1
AI_API_KEY=                     # Optional, for secured llama.cpp

# Qwen API (for daily summaries)
QWEN_API_URL=http://127.0.0.1:5050/v1/chat/completions
QWEN_MODEL=qwen2.5-3b-gguf
```

## Key Features

### 1. **Automatic Context Injection**
Every user message automatically gets enriched with:
- Recent conversation history
- Semantically related past interactions
- Fresh activity from the last 24 hours
- Personality/system prompt

### 2. **Token Budget Management**
- Ensures context fits within model limits
- Prioritizes: recent > recalled > fresh
- Reserves space for user query and response

### 3. **Deduplication**
- Prevents duplicate events in context
- Maintains chronological ordering
- Tracks which events were included (chosen_ids)

### 4. **Buffered Memory Storage**
- User messages saved immediately (non-blocking)
- AI responses saved after streaming completes
- Batch flush to daemon (64 items or 5s timeout)
- Automatic embedding generation in background

## API Endpoints

### Context Service

#### `POST /context/build`
Build assembled prompt with context from memory.

**Request:**
```json
{
  "user_input": "What features does the memory system have?",
  "token_budget": 2048  // Optional, defaults to 2048
}
```

**Response:**
```json
{
  "prompt": "<persona>\n\n[Context]\n...\n\n[User]\n<query>",
  "chosen_ids": ["13", "14", "15", ...],
  "stats": {
    "recent": 6,
    "recall": 8, 
    "fresh": 18,
    "used_tokens_est": 505,
    "budget": 2048
  }
}
```

### Memory Daemon

#### `POST /ingest`
Ingest events for embedding and storage.

#### `POST /search`
Semantic search using embeddings.

#### `POST /summarize/daily`
Generate daily summary using Qwen.

## Tauri Commands

### `chat_with_context(message, model, token_budget, temperature)`
**Main chat command** - Uses context service flow
- Builds context from memory
- Calls Qwen with assembled prompt
- Streams response back to UI

### `build_context(user_input, token_budget)`
**Direct context building** - For custom integrations
- Returns assembled prompt without calling LLM
- Useful for debugging or custom flows

### `call_qwen(input)`
**Legacy direct LLM call** - No context injection
- Still available for simple queries
- Bypasses context service

## Usage Example

### Frontend (TypeScript)
```typescript
// Context-aware chat (recommended)
await invoke("chat_with_context", {
  message: "What did we discuss yesterday?",
  model: "qwen2.5-3b-gguf",
  tokenBudget: 2048
});

// Direct context building (advanced)
const context = await invoke("build_context", {
  userInput: "What did we discuss?",
  tokenBudget: 2048
});
console.log(context.prompt);
console.log(context.stats);
```

### Backend (Rust)
```rust
// Chat with context
#[tauri::command]
async fn chat_with_context(
    window: Window,
    state: State<'_, AppState>,
    message: String,
    token_budget: Option<i32>,
    model: Option<String>,
    temperature: Option<f32>,
) -> Result<(), String>

// Build context only
#[tauri::command]
async fn build_context(
    user_input: String,
    token_budget: Option<i32>
) -> Result<BuildContextResponse, String>
```

## Future Enhancements

### 1. **True Vector Search**
Replace keyword fallback in `search_embeddings()` with actual vector similarity:
- Embed user query using bge-small-en model
- Use sqlite-vec MATCH syntax for efficient search
- Return truly semantically similar events

### 2. **Recency Boost**
Weight recent events higher in recall:
```python
score = cosine_similarity * (1 + recency_weight * age_factor)
```

### 3. **Context Caching**
Cache assembled contexts for similar queries:
- LRU cache with query embedding as key
- Invalidate on new events
- Reduces latency for repeated patterns

### 4. **Adaptive Token Budget**
Dynamically adjust based on:
- Model's actual context window
- Query complexity
- Available memory content

### 5. **Multi-turn Context Windows**
Track conversation threads:
- Group related messages by session
- Preserve multi-turn context across days
- Better handling of topic switches

## Testing

### Test Context Building
```bash
curl -X POST http://127.0.0.1:8765/context/build \
  -H "Content-Type: application/json" \
  -d '{"user_input": "What features does the memory system have?"}' \
  | jq
```

### Test Full Chat Flow
1. Start memory daemon: `uvicorn daemon:app --host 127.0.0.1 --port 8765`
2. Start Qwen server: `make serve MODEL=models/qwen2.5-3b-lora.Q4_K_M.gguf`
3. Launch Tauri app: `npm run tauri dev`
4. Type a message and observe:
   - Context assembly in daemon logs
   - Qwen receiving assembled prompt
   - Streaming response in UI
   - Memory auto-save after completion

## Troubleshooting

### Context service not loading
- Check `✓ Context service integrated at /context/build` in daemon startup
- Verify `context_service/` directory structure
- Check imports in `daemon.py`

### Empty context returned
- Verify memory.db has events with `chat:user`/`chat:ai` kinds
- Check timestamp format (unix milliseconds)
- Ensure embeddings exist for semantic recall

### Token budget exceeded
- Reduce TOKEN_BUDGET in config
- Lower N_RECENT, K_RECALL, or FRESH_HOURS
- Check persona.txt file size

### Streaming stops mid-response
- Check Qwen server logs for errors
- Verify model loaded successfully
- Check network connectivity between services

## Architecture Benefits

1. **Separation of Concerns**: Context building isolated from LLM inference
2. **Reusability**: Context service can be used by multiple frontends
3. **Testability**: Each component testable independently
4. **Scalability**: Easy to optimize context building without touching LLM
5. **Transparency**: Stats show exactly what context was used
6. **Memory-Aware**: Every conversation benefits from past interactions
