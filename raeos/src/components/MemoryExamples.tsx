/**
 * Example component demonstrating memory integration patterns
 * 
 * This shows various ways to use the memory daemon in your Tauri React app.
 */

import { useState } from 'react';
import { useMemory, useMemoryAutoSave, useDailySummary } from '../hooks/useMemory';

/**
 * Example 1: Simple note-taking with memory
 */
export function NoteTaker() {
  const [note, setNote] = useState('');
  const { saveNote } = useMemory();

  const handleSave = async () => {
    if (!note.trim()) return;
    await saveNote(note, ['manual']);
    setNote('');
    alert('Note saved to memory!');
  };

  return (
    <div>
      <h3>Quick Note</h3>
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Write a note..."
        rows={4}
        style={{ width: '100%', padding: 8 }}
      />
      <button onClick={handleSave}>Save to Memory</button>
    </div>
  );
}

/**
 * Example 2: Memory search with results display
 */
export function MemorySearchPanel() {
  const [query, setQuery] = useState('');
  const { search, results, searchLoading, searchError, clearResults } = useMemory();

  const handleSearch = async () => {
    if (!query.trim()) return;
    await search({ query, top_k: 10 });
  };

  return (
    <div>
      <h3>Search Your Memory</h3>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          placeholder="Search for anything..."
          style={{ flex: 1, padding: 8 }}
        />
        <button onClick={handleSearch} disabled={searchLoading}>
          {searchLoading ? 'Searching...' : 'Search'}
        </button>
        {results.length > 0 && (
          <button onClick={clearResults}>Clear</button>
        )}
      </div>

      {searchError && (
        <div style={{ color: 'red', marginBottom: 8 }}>
          Error: {searchError}
        </div>
      )}

      {results.length > 0 && (
        <div>
          <p>{results.length} results found:</p>
          {results.map((result) => (
            <div
              key={result.id}
              style={{
                padding: 12,
                marginBottom: 8,
                border: '1px solid #ccc',
                borderRadius: 6,
                background: '#f9f9f9'
              }}
            >
              <div style={{ fontSize: '0.85em', color: '#666', marginBottom: 4 }}>
                {result.kind} • {new Date(result.ts).toLocaleString()}
                • Similarity: {(1 - result.distance).toFixed(3)}
              </div>
              <div>{result.text}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Example 3: Auto-save chat messages
 */
export function ChatWithMemory() {
  const [messages, setMessages] = useState<Array<{ role: string; text: string }>>([]);
  const [input, setInput] = useState('');
  const { autoSaveMessage } = useMemoryAutoSave();

  const sendMessage = async () => {
    if (!input.trim()) return;

    const userMsg = input.trim();
    setInput('');

    // Add to UI
    setMessages((m) => [...m, { role: 'user', text: userMsg }]);

    // Auto-save to memory (buffered, non-blocking)
    await autoSaveMessage('user', userMsg);

    // Simulate AI response
    setTimeout(async () => {
      const aiMsg = `Echo: ${userMsg}`;
      setMessages((m) => [...m, { role: 'assistant', text: aiMsg }]);

      // Auto-save AI response
      await autoSaveMessage('assistant', aiMsg);
    }, 500);
  };

  return (
    <div>
      <h3>Chat (with auto-save)</h3>
      <div
        style={{
          height: 300,
          overflowY: 'auto',
          border: '1px solid #ccc',
          padding: 12,
          marginBottom: 8,
          background: '#fafafa'
        }}
      >
        {messages.map((msg, i) => (
          <div key={i} style={{ marginBottom: 8 }}>
            <strong>{msg.role}:</strong> {msg.text}
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
          placeholder="Type a message..."
          style={{ flex: 1, padding: 8 }}
        />
        <button onClick={sendMessage}>Send</button>
      </div>
    </div>
  );
}

/**
 * Example 4: Daily summary viewer
 */
export function DailySummaryViewer() {
  const [selectedDay, setSelectedDay] = useState('');
  const { generateSummary, summary, loading, error } = useDailySummary();

  const handleGenerate = async () => {
    await generateSummary(selectedDay || undefined);
  };

  return (
    <div>
      <h3>Daily Summary</h3>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <input
          type="date"
          value={selectedDay}
          onChange={(e) => setSelectedDay(e.target.value)}
          style={{ padding: 8 }}
        />
        <button onClick={handleGenerate} disabled={loading}>
          {loading ? 'Generating...' : 'Generate Summary'}
        </button>
      </div>

      {error && (
        <div style={{ color: 'red', marginBottom: 8 }}>
          Error: {error}
        </div>
      )}

      {summary && (
        <div
          style={{
            padding: 12,
            border: '1px solid #ccc',
            borderRadius: 8,
            background: '#f0f8ff'
          }}
        >
          <h4>Summary for {summary.day}</h4>
          <p>Status: {summary.status}</p>
          {summary.tokens && <p>Tokens: {summary.tokens}</p>}
          {(summary as any).summary && (
            <div
              style={{
                whiteSpace: 'pre-wrap',
                padding: 8,
                background: 'white',
                borderRadius: 6,
                marginTop: 8
              }}
            >
              {(summary as any).summary}
            </div>
          )}
          {(summary as any).events_processed && (
            <p style={{ fontSize: '0.9em', color: '#666' }}>
              Processed {(summary as any).events_processed} events
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Example 5: Combined memory dashboard
 */
export function MemoryDashboard() {
  return (
    <div style={{ padding: 16, maxWidth: 1200, margin: '0 auto' }}>
      <h2>Memory Dashboard</h2>
      
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div style={{ border: '1px solid #ccc', borderRadius: 8, padding: 16 }}>
          <NoteTaker />
        </div>
        
        <div style={{ border: '1px solid #ccc', borderRadius: 8, padding: 16 }}>
          <DailySummaryViewer />
        </div>
      </div>

      <div style={{ marginTop: 16, border: '1px solid #ccc', borderRadius: 8, padding: 16 }}>
        <MemorySearchPanel />
      </div>

      <div style={{ marginTop: 16, border: '1px solid #ccc', borderRadius: 8, padding: 16 }}>
        <ChatWithMemory />
      </div>
    </div>
  );
}
