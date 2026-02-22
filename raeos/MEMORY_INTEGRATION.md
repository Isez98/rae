# Memory Daemon Integration Guide

## Overview

Your Tauri app now has full integration with the Memory Daemon for semantic memory storage and retrieval using BGE embeddings.

## Architecture

```
┌─────────────────┐
│   React UI      │  (TypeScript)
│  Components     │
└────────┬────────┘
         │ invoke()
         ▼
┌─────────────────┐
│  Tauri Backend  │  (Rust)
│  Commands       │
│  - mem_ingest   │
│  - mem_search   │
│  - mem_summarize│
└────────┬────────┘
         │ HTTP POST
         ▼
┌─────────────────┐
│ Memory Daemon   │  (Python FastAPI)
│  Port 8765      │
│  - /ingest      │
│  - /search      │
│  - /summarize   │
└─────────────────┘
         │
         ▼
┌─────────────────┐
│  SQLite + Vec   │  (Database)
│  384-dim BGE    │
└─────────────────┘
```

## Quick Start

### 1. Start the Memory Daemon

```bash
cd memory-daemon
./run.sh
```

The daemon will start on `http://127.0.0.1:8765`

### 2. Configure Environment (Optional)

Create or update `.env` in `raeos/`:

```bash
# Memory Daemon URL (default: http://127.0.0.1:8765)
MEMORY_DAEMON_URL=http://127.0.0.1:8765

# AI Server (already configured)
AI_BASE_URL=http://127.0.0.1:5050/v1
AI_API_KEY=
```

### 3. Use in Your React Components

```tsx
import { useMemory } from './hooks/useMemory';

function MyComponent() {
  const memory = useMemory();

  // Save a note
  const saveNote = async () => {
    await memory.saveNote('Important project meeting notes');
  };

  // Search memory
  const search = async () => {
    await memory.search({ 
      query: 'project deadlines', 
      top_k: 5 
    });
    console.log(memory.results);
  };

  return (/* your UI */);
}
```

## API Reference

### Backend (Rust Commands)

#### `mem_ingest`
Ingest items into memory with embeddings.

```typescript
import { invoke } from '@tauri-apps/api/core';

await invoke('mem_ingest', {
  items: [
    {
      kind: 'note',
      text: 'Meeting notes about Q4 planning',
      meta: { tags: ['work', 'planning'] },
      ts: Date.now()
    }
  ]
});
```

**Item Types (kind):**
- `note` - General notes
- `chat:user` - User chat messages
- `chat:ai` - AI responses
- `document` - Document content
- Custom types as needed

#### `mem_search`
Search memory using semantic similarity.

```typescript
const results = await invoke('mem_search', {
  q: {
    query: 'What were the Q4 goals?',
    top_k: 8,              // Number of results
    filter_kind: 'note',   // Optional: filter by type
    since_ms: 1234567890   // Optional: only recent items
  }
});
```

**Returns:** Array of search results with similarity scores.

#### `mem_summarize_daily`
Request a daily summary.

```typescript
const summary = await invoke('mem_summarize_daily', {
  day: '2025-10-28'  // Optional: defaults to today
});
```

### Frontend Services

#### Simple API (`src/services/memoryDaemon.ts`)

```typescript
import { memoryIngest, memorySearch } from './services/memoryDaemon';

// Ingest
await memoryIngest([
  { kind: 'note', text: 'My note' }
]);

// Search
const results = await memorySearch({
  query: 'important tasks',
  top_k: 10
});
```

#### React Hooks (`src/hooks/useMemory.ts`)

##### `useMemory()` - Combined hook

```tsx
function MyComponent() {
  const memory = useMemory();

  // Save
  await memory.saveNote('My note', ['tag1', 'tag2']);
  await memory.saveChat('user', 'Hello!');

  // Search
  await memory.search({ query: 'hello', top_k: 5 });
  console.log(memory.results);

  // Status
  console.log(memory.isLoading);
  console.log(memory.hasError);
}
```

##### `useMemoryAutoSave()` - Auto-save in background

```tsx
function ChatComponent() {
  const { autoSaveMessage } = useMemoryAutoSave();

  const handleChat = async (userMsg: string) => {
    // Auto-save user message (non-blocking)
    autoSaveMessage('user', userMsg);

    // Get AI response
    const aiResponse = await callQwen(userMsg);

    // Auto-save AI response
    autoSaveMessage('assistant', aiResponse);
  };
}
```

## Example Component

See `src/components/MemoryExample.tsx` for a complete working example with:
- Note saving
- Semantic search
- Results display
- Error handling

## Integration with Your Chat

### Option 1: Auto-save (Recommended)

```tsx
import { useMemoryAutoSave } from './hooks/useMemory';

function ChatUI() {
  const { autoSaveMessage } = useMemoryAutoSave();

  const sendMessage = async (text: string) => {
    // Save user message
    autoSaveMessage('user', text);

    // Call your existing Qwen function
    // (assuming it emits 'chat:delta' events)
    await invoke('call_qwen', { 
      input: { message: text } 
    });

    // Listen for complete response and save
    listen('chat:complete', (event) => {
      autoSaveMessage('assistant', event.payload.content);
    });
  };
}
```

### Option 2: Manual with Context

```tsx
import { useMemory } from './hooks/useMemory';

function ChatUI() {
  const memory = useMemory();

  const sendMessage = async (text: string) => {
    // Search for relevant context first
    const context = await memory.search({
      query: text,
      top_k: 3,
      filter_kind: 'note'
    });

    // Include context in your prompt
    const enrichedPrompt = `
      Relevant context:
      ${context.results.map(r => r.text).join('\n')}

      User question: ${text}
    `;

    // Save user message
    await memory.saveChat('user', text);

    // Call Qwen with enriched prompt
    const response = await callQwen(enrichedPrompt);

    // Save AI response
    await memory.saveChat('assistant', response);
  };
}
```

## Configuration

### Memory Daemon Settings

Default port: `8765`

To change, set environment variable:
```bash
export MEMORY_DAEMON_URL=http://127.0.0.1:9999
```

Or in Rust code (src-tauri/src/main.rs):
```rust
let mem_url = std::env::var("MEMORY_DAEMON_URL")
    .unwrap_or_else(|_| "http://127.0.0.1:8765".into());
```

### Model Settings

The BGE-small-en-v1.5 model produces 384-dimensional embeddings.
- Model: BGE-small-en-v1.5
- Dimension: 384
- Distance: Cosine similarity (lower = more similar)

## Troubleshooting

### Memory Daemon Not Running

```bash
Error: Memory daemon connection failed: Connection refused
```

**Solution:** Start the daemon:
```bash
cd memory-daemon
./run.sh
```

### Port Already in Use

```bash
Error: Address already in use
```

**Solution:** Change port in `run.sh`:
```bash
uvicorn daemon:app --host 0.0.0.0 --port 8766
```

And update env var:
```bash
export MEMORY_DAEMON_URL=http://127.0.0.1:8766
```

### Database Locked

```bash
Error: database is locked
```

**Solution:** Only one process should access the database. Stop other instances.

### No Results from Search

- Make sure you've ingested some data first
- Try a broader query
- Check if `filter_kind` is too restrictive
- Verify embeddings are being generated (check daemon logs)

## Performance Tips

1. **Batch Ingests:** Save multiple items at once instead of one-by-one
2. **Background Saving:** Use `useMemoryAutoSave()` to not block UI
3. **Limit Results:** Use reasonable `top_k` values (8-10 is usually enough)
4. **Filter by Kind:** Use `filter_kind` to narrow searches
5. **Use Time Filters:** Add `since_ms` for recent-only searches

## Next Steps

1. ✅ Memory daemon running
2. ✅ Tauri commands integrated
3. ✅ React hooks available
4. ✅ Example component created
5. 🔲 Integrate with your chat UI
6. 🔲 Add memory search to context enhancement
7. 🔲 Implement daily summaries
8. 🔲 Add visualization of memory contents

## Files Modified/Created

### Backend
- `src-tauri/src/main.rs` - Added 3 Tauri commands

### Frontend
- `src/services/memoryDaemon.ts` - API functions
- `src/hooks/useMemory.ts` - React hooks
- `src/components/MemoryExample.tsx` - Example component

### Documentation
- `TAURI_V2_CONFIG.md` - Tauri v2 configuration
- `MEMORY_INTEGRATION.md` - This file

Enjoy your semantic memory! 🧠✨
