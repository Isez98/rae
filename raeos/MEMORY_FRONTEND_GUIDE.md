# Memory Daemon - Frontend Integration Guide

This guide shows how to use the memory daemon in your Tauri React frontend.

## Overview

The memory daemon integration provides:
- **Auto-save**: Automatically save chat messages and notes to persistent memory
- **Semantic Search**: Search your memory using natural language
- **Daily Summaries**: Generate AI-powered summaries of your day
- **Buffered Ingestion**: Efficient batch processing for high-frequency events

## Quick Start

### 1. Import Hooks

```tsx
import { 
  useMemory, 
  useMemoryAutoSave, 
  useDailySummary 
} from './hooks/useMemory';
```

### 2. Basic Usage in App.tsx

The main `App.tsx` demonstrates:

```tsx
function App() {
  // Auto-save chat messages
  const { autoSaveMessage } = useMemoryAutoSave();
  
  // Search functionality
  const { quickSearch, results, loading, clearResults } = useMemorySearch();
  
  // Daily summaries
  const { generateSummary, summary, loading: summaryLoading } = useDailySummary();

  // When sending a message:
  async function send() {
    // ... send to AI
    
    // Save user message (buffered, non-blocking)
    autoSaveMessage('user', userText);
  }

  // After receiving AI response:
  useEffect(() => {
    if (aiResponseComplete) {
      autoSaveMessage('assistant', responseText);
    }
  }, [aiResponseComplete]);

  // Search memory:
  await quickSearch('meeting notes');

  // Generate daily summary:
  await generateSummary(); // today
  await generateSummary('2025-10-27'); // specific day
}
```

## Available Hooks

### 1. `useMemoryAutoSave()`

**Best for:** Chat applications, automatic background saving

```tsx
const { autoSaveMessage, autoSaveNote } = useMemoryAutoSave();

// Save chat messages (buffered, non-blocking)
await autoSaveMessage('user', 'Hello!');
await autoSaveMessage('assistant', 'Hi there!');

// Save notes with tags
await autoSaveNote('Important meeting', ['work', 'urgent']);
```

**Features:**
- Non-blocking (returns immediately)
- Batched automatically (up to 64 items or 5 seconds)
- Error-tolerant (logs warnings but doesn't throw)

### 2. `useMemorySearch()`

**Best for:** Finding information, contextual recall

```tsx
const { 
  quickSearch,     // Simple search function
  results,         // Array of SearchResult[]
  loading,         // Boolean loading state
  error,          // Error message if any
  clearResults    // Clear the results
} = useMemorySearch();

// Search with defaults (8 results)
await quickSearch('project deadlines');

// Advanced search
await search({
  query: 'meeting notes',
  top_k: 15,
  filter_kind: 'note',           // Only notes
  since_ms: Date.now() - 86400000 // Last 24 hours
});
```

**Result format:**
```typescript
interface SearchResult {
  id: number;
  ts: number;              // Unix timestamp (ms)
  kind: string;            // "chat:user", "note", etc.
  text: string;            // Content
  meta: Record<string, any>; // Metadata
  distance: number;        // Lower = more similar (0-2)
}
```

### 3. `useDailySummary()`

**Best for:** Daily review, insights generation

```tsx
const { 
  generateSummary, 
  summary,         // DailySummaryResponse | null
  loading, 
  error,
  clearSummary 
} = useDailySummary();

// Generate for today
const result = await generateSummary();

// Generate for specific day
const result = await generateSummary('2025-10-27');
```

**Response format:**
```typescript
interface DailySummaryResponse {
  day: string;              // "2025-10-28"
  status: string;           // "ok", "no-events", "fallback"
  tokens?: number;          // Token count
  summary?: string;         // AI-generated summary text
  events_processed?: number; // Number of events used
  error?: string;           // Error message if fallback
}
```

### 4. `useMemory()`

**Best for:** Combined operations (search + save)

```tsx
const memory = useMemory();

// All operations in one hook:
await memory.saveNote('Task completed');
await memory.saveChat('user', 'Hello');
await memory.quickSearch('recent tasks');

// Access results
console.log(memory.results);
console.log(memory.isLoading);
console.log(memory.errors);
```

### 5. `useMemoryIngest()`

**Best for:** Immediate saves (not buffered)

```tsx
const { ingest, loading, error } = useMemoryIngest();

// Save immediately (blocks until confirmed)
const result = await ingest([
  { kind: 'note', text: 'Critical data' }
]);

console.log(result.inserted); // Number of items saved
console.log(result.event_ids); // Array of IDs
```

## Event Types (kind)

Standard event types to use:

| Kind | Description | Use Case |
|------|-------------|----------|
| `chat:user` | User messages | Chat interactions |
| `chat:ai` | AI responses | Chat interactions |
| `note` | User notes | Manual note-taking |
| `task` | Task/TODO items | Task management |
| `event` | Calendar events | Scheduling |
| `web` | Web browsing | Browser history |
| `file` | File operations | File management |

You can create custom kinds as needed.

## Metadata Examples

Add structured data with `meta`:

```tsx
// Chat with context
await autoSaveMessage('user', 'Hello', {
  context: 'onboarding',
  session_id: 'abc123'
});

// Note with tags
await ingest([{
  kind: 'note',
  text: 'Project milestone reached',
  meta: {
    tags: ['work', 'project-x'],
    priority: 'high',
    related_to: ['task-1', 'task-2']
  }
}]);

// Task with due date
await ingest([{
  kind: 'task',
  text: 'Complete report',
  meta: {
    due_date: '2025-11-01',
    assigned_to: 'user@example.com',
    status: 'in-progress'
  }
}]);
```

## Performance Best Practices

### ✅ DO: Use Buffered Ingestion for High-Frequency Events

```tsx
// Good: Non-blocking, batched
const { autoSaveMessage } = useMemoryAutoSave();
await autoSaveMessage('user', text);
```

### ❌ DON'T: Use Immediate Ingestion in Loops

```tsx
// Bad: Blocks on each save
const { ingest } = useMemoryIngest();
for (const msg of messages) {
  await ingest([{ kind: 'chat:user', text: msg }]); // Slow!
}

// Good: Batch them
await ingest(messages.map(msg => ({
  kind: 'chat:user',
  text: msg
})));
```

### ✅ DO: Search with Filters

```tsx
// Good: Narrow results
await search({
  query: 'meeting',
  filter_kind: 'note',
  since_ms: Date.now() - 7*86400000 // Last week
});
```

### ✅ DO: Limit Search Results

```tsx
// Good: Only get what you need
await quickSearch('query', 5); // Just 5 results
```

## Error Handling

### Auto-save (Fire and Forget)

```tsx
// Auto-save doesn't throw errors
const { autoSaveMessage } = useMemoryAutoSave();
await autoSaveMessage('user', text); // Logs warning on error
```

### Search (Handle Errors)

```tsx
const { search, error } = useMemorySearch();
await search({ query: 'test' });

if (error) {
  console.error('Search failed:', error);
  // Show user-friendly message
}
```

### Direct Ingestion (Try-Catch)

```tsx
const { ingest } = useMemoryIngest();
try {
  await ingest([{ kind: 'note', text: 'Important' }]);
} catch (err) {
  console.error('Failed to save:', err);
  alert('Could not save to memory');
}
```

## UI Patterns

### Search Results Display

```tsx
{results.map((result) => (
  <div key={result.id}>
    <div style={{ fontSize: '0.85em', color: '#666' }}>
      {result.kind} • {new Date(result.ts).toLocaleString()}
      • Similarity: {(1 - result.distance).toFixed(3)}
    </div>
    <div>{result.text}</div>
  </div>
))}
```

### Loading States

```tsx
<button onClick={handleSearch} disabled={loading}>
  {loading ? 'Searching...' : 'Search'}
</button>
```

### Summary Display

```tsx
{summary && summary.status === 'ok' && (
  <div>
    <h3>Daily Summary - {summary.day}</h3>
    <div style={{ whiteSpace: 'pre-wrap' }}>
      {summary.summary}
    </div>
    <div style={{ fontSize: '0.85em', color: '#666' }}>
      {summary.tokens} tokens • {summary.events_processed} events
    </div>
  </div>
)}
```

## Example Components

See `/src/components/MemoryExamples.tsx` for complete working examples:

- **NoteTaker**: Simple note-taking with memory
- **MemorySearchPanel**: Full-featured search interface
- **ChatWithMemory**: Auto-save chat messages
- **DailySummaryViewer**: Summary generation UI
- **MemoryDashboard**: Combined example

## Integration Checklist

- [x] Import memory hooks in your components
- [x] Add auto-save to chat message handlers
- [x] Implement search UI with results display
- [x] Add daily summary button/scheduler
- [x] Handle loading states and errors
- [x] Test with memory daemon running
- [x] Configure environment variables

## Troubleshooting

### "Memory daemon connection failed"

1. **Check daemon is running:**
   ```bash
   # In /storage/vs-code/Rae/memory-daemon
   uvicorn daemon:app --host 127.0.0.1 --port 8765
   ```

2. **Verify URL in environment:**
   ```bash
   export MEMORY_DAEMON_URL=http://127.0.0.1:8765
   ```

### No search results

1. **Check events exist:**
   ```bash
   sqlite3 memory.db "SELECT COUNT(*) FROM events;"
   ```

2. **Verify embeddings:**
   ```bash
   sqlite3 memory.db "SELECT COUNT(*) FROM embeddings;"
   ```

### Daily summary fails

1. **Check Qwen server:**
   ```bash
   curl http://127.0.0.1:5050/health
   ```

2. **Check environment:**
   ```bash
   export QWEN_API_URL=http://127.0.0.1:5050/v1/chat/completions
   ```

## Next Steps

1. **Customize event types** for your domain
2. **Add context to chat saves** with metadata
3. **Build memory-aware features** using search
4. **Schedule daily summaries** in backend
5. **Export summaries** to markdown/PDF
6. **Visualize memory trends** over time

## Reference

- **Memory Daemon API**: `/storage/vs-code/Rae/memory-daemon/daemon.py`
- **Service Layer**: `/src/services/memoryDaemon.ts`
- **Hooks**: `/src/hooks/useMemory.ts`
- **Main App**: `/src/App.tsx`
- **Examples**: `/src/components/MemoryExamples.tsx`
