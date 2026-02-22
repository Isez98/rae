import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useMemoryAutoSave, useMemorySearch, useDailySummary } from "./hooks/useMemory";
import "./App.css";

function App() {
  const [input, setInput] = useState("");
  const [log, setLog] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [currentResponse, setCurrentResponse] = useState("");
  
  // Memory hooks
  const { autoSaveMessage } = useMemoryAutoSave();
  const { quickSearch, results: searchResults, loading: searchLoading, clearResults } = useMemorySearch();
  const { generateSummary, summary, loading: summaryLoading } = useDailySummary();
  
  // UI state for memory features
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [showSummary, setShowSummary] = useState(false);

  useEffect(() => {
    // Listen for streaming chat delta events
    const unlisten = listen<string>("chat:delta", (event) => {
      setCurrentResponse((prev) => prev + event.payload);
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  async function send() {
    if (!input.trim() || busy) return;
    const userText = input.trim();
    setInput("");
    setLog((L) => [...L, `You: ${userText}`]);
    setBusy(true);
    setCurrentResponse(""); // Clear previous response

    // Save user message to memory (buffered, non-blocking)
    autoSaveMessage('user', userText);

    // Add placeholder for Rae's response
    setLog((L) => [...L, "Rae: "]);

    try {
      // Call the enhanced chat command that uses context service
      // Architecture: Tauri → Context Service (builds prompt) → Qwen → Stream back
      await invoke("chat_with_context", {
        message: userText,
        model: "qwen2.5-3b-gguf",
        tokenBudget: 2048, // Optional: customize context window
      });

      // Save AI response to memory after stream completes
      // (currentResponse will be updated via the effect below)
    } catch (e: any) {
      setLog((L) => [...L, `⚠️ Error: ${String(e)}`]);
    } finally {
      setBusy(false);
      // Keep the currentResponse so it shows the final result
    }
  }

  // Update the log entry for Rae's response when currentResponse changes
  useEffect(() => {
    if (currentResponse && busy) {
      setLog((L) => {
        const newLog = [...L];
        // Find the last "Rae: " entry and update it
        for (let i = newLog.length - 1; i >= 0; i--) {
          if (newLog[i].startsWith("Rae: ")) {
            newLog[i] = `Rae: ${currentResponse}`;
            break;
          }
        }
        return newLog;
      });
    }
  }, [currentResponse, busy]);

  // Save AI response to memory when streaming completes
  useEffect(() => {
    if (currentResponse && !busy && currentResponse.length > 0) {
      autoSaveMessage('assistant', currentResponse);
    }
  }, [busy, currentResponse, autoSaveMessage]);

  // Search memory function
  async function handleSearch() {
    if (!searchQuery.trim()) return;
    await quickSearch(searchQuery);
  }

  // Generate daily summary function
  async function handleGenerateSummary() {
    await generateSummary();
    setShowSummary(true);
  }

  return (
    <div style={{ padding: 16, fontFamily: "Inter, system-ui, sans-serif" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <h2>Rae (local desktop)</h2>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={() => setShowSearch(!showSearch)}
            style={{
              padding: "6px 12px",
              borderRadius: 6,
              border: "1px solid #666",
              background: showSearch ? "#333" : "transparent",
              color: showSearch ? "white" : "#333",
              cursor: "pointer",
              fontSize: "0.9em"
            }}
          >
            {showSearch ? "Hide Search" : "Search Memory"}
          </button>
          <button
            onClick={handleGenerateSummary}
            disabled={summaryLoading}
            style={{
              padding: "6px 12px",
              borderRadius: 6,
              border: "1px solid #666",
              background: summaryLoading ? "#ddd" : "transparent",
              color: summaryLoading ? "#999" : "#333",
              cursor: summaryLoading ? "not-allowed" : "pointer",
              fontSize: "0.9em"
            }}
          >
            {summaryLoading ? "Generating..." : "Daily Summary"}
          </button>
        </div>
      </div>

      {/* Memory Search Panel */}
      {showSearch && (
        <div style={{
          border: "1px solid #ccc",
          borderRadius: 8,
          padding: 12,
          marginBottom: 12,
          background: "#f9f9f9"
        }}>
          <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
            <input
              style={{
                flex: 1,
                padding: 8,
                borderRadius: 6,
                border: "1px solid #ccc"
              }}
              placeholder="Search your memory..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            />
            <button
              onClick={handleSearch}
              disabled={searchLoading}
              style={{
                padding: "8px 16px",
                borderRadius: 6,
                border: "1px solid #666",
                background: "#666",
                color: "white",
                cursor: searchLoading ? "not-allowed" : "pointer"
              }}
            >
              {searchLoading ? "..." : "Search"}
            </button>
            {searchResults.length > 0 && (
              <button
                onClick={clearResults}
                style={{
                  padding: "8px 12px",
                  borderRadius: 6,
                  border: "1px solid #999",
                  background: "transparent",
                  cursor: "pointer"
                }}
              >
                Clear
              </button>
            )}
          </div>

          {/* Search Results */}
          {searchResults.length > 0 && (
            <div style={{ maxHeight: 200, overflowY: "auto" }}>
              <div style={{ fontSize: "0.85em", color: "#666", marginBottom: 4 }}>
                Found {searchResults.length} results:
              </div>
              {searchResults.map((result) => (
                <div
                  key={result.id}
                  style={{
                    padding: 8,
                    marginBottom: 6,
                    background: "white",
                    borderRadius: 6,
                    border: "1px solid #e0e0e0",
                    fontSize: "0.9em"
                  }}
                >
                  <div style={{ color: "#666", fontSize: "0.85em", marginBottom: 2 }}>
                    [{result.kind}] {new Date(result.ts).toLocaleString()} (similarity: {(1 - result.distance).toFixed(3)})
                  </div>
                  <div>{result.text}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Daily Summary Panel */}
      {showSummary && summary && (
        <div style={{
          border: "1px solid #ccc",
          borderRadius: 8,
          padding: 12,
          marginBottom: 12,
          background: "#f0f8ff"
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <h3 style={{ margin: 0, fontSize: "1em" }}>Daily Summary - {summary.day}</h3>
            <button
              onClick={() => setShowSummary(false)}
              style={{
                padding: "4px 8px",
                borderRadius: 4,
                border: "1px solid #999",
                background: "transparent",
                cursor: "pointer",
                fontSize: "0.85em"
              }}
            >
              Close
            </button>
          </div>
          <div style={{
            whiteSpace: "pre-wrap",
            fontSize: "0.9em",
            maxHeight: 200,
            overflowY: "auto",
            background: "white",
            padding: 8,
            borderRadius: 6,
            border: "1px solid #ddd"
          }}>
            {(summary as any).summary || `Status: ${summary.status}`}
            {summary.tokens && (
              <div style={{ marginTop: 8, color: "#666", fontSize: "0.85em" }}>
                ({summary.tokens} tokens, {(summary as any).events_processed || 0} events)
              </div>
            )}
          </div>
        </div>
      )}

      {/* Chat Log */}
      <div
        style={{
          border: "1px solid #ccc",
          borderRadius: 8,
          padding: 12,
          height: 380,
          overflowY: "auto",
          whiteSpace: "pre-wrap",
          background: "#fafafa",
        }}
      >
        {log.map((line, i) => (
          <div key={i} style={{ marginBottom: 8 }}>
            {line}
          </div>
        ))}
      </div>

      {/* Input Area */}
      <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
        <input
          style={{
            flex: 1,
            padding: 8,
            borderRadius: 8,
            border: "1px solid #ccc",
          }}
          placeholder="Tell Rae something…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          disabled={busy}
        />
        <button
          onClick={send}
          disabled={busy}
          style={{
            padding: "8px 14px",
            borderRadius: 8,
            border: "1px solid #222",
            background: busy ? "#ddd" : "#222",
            color: busy ? "#666" : "white",
            cursor: busy ? "not-allowed" : "pointer",
          }}
        >
          {busy ? "Thinking…" : "Send"}
        </button>
      </div>
    </div>
  );
}

export default App;
