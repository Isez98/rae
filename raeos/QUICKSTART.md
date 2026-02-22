# Memory Daemon Quick Start Checklist

## ✅ Setup Complete!

Your memory daemon integration is ready. Follow these steps to start using it:

## Prerequisites (Already Done ✓)

- [x] Memory daemon installed with all dependencies
- [x] BGE-small-en-v1.5 model downloaded
- [x] Database initialized
- [x] Tauri commands implemented
- [x] React hooks created
- [x] Example component ready

## Getting Started (3 Steps)

### Step 1: Start Memory Daemon

```bash
cd /storage/vs-code/Rae/memory-daemon
./run.sh
```

Expected output:
```
✓ Using CPUExecutionProvider for bge-small-en.onnx
Starting Memory Daemon...
  Database: memory.db
  Model: bge-small-en-v1.5
INFO:     Uvicorn running on http://0.0.0.0:8765
```

### Step 2: Start Your Tauri App

In a new terminal:
```bash
cd /storage/vs-code/Rae/raeos
npm run tauri dev
```

### Step 3: Test the Integration

#### Option A: Use the Example Component

Add to your `App.tsx`:
```tsx
import { MemoryExample } from './components/MemoryExample';

function App() {
  return (
    <div>
      <MemoryExample />
    </div>
  );
}
```

#### Option B: Quick Test in Console

Open DevTools (F12) and run:
```javascript
// Import invoke
const { invoke } = window.__TAURI__.core;

// Test ingest
await invoke('mem_ingest', {
  items: [
    { kind: 'note', text: 'Test note about AI and memory', ts: Date.now() }
  ]
});
// Should return: { inserted: 1, event_ids: [1] }

// Test search
await invoke('mem_search', {
  q: { query: 'artificial intelligence', top_k: 5 }
});
// Should return: Array of similar items
```

## Integration Patterns

### Pattern 1: Auto-Save Chat Messages

```tsx
import { useMemoryAutoSave } from './hooks/useMemory';

function Chat() {
  const { autoSaveMessage } = useMemoryAutoSave();

  const onUserMessage = (msg: string) => {
    autoSaveMessage('user', msg);
    // ... rest of your chat logic
  };

  const onAIResponse = (response: string) => {
    autoSaveMessage('assistant', response);
  };
}
```

### Pattern 2: Context-Enhanced Chat

```tsx
import { useMemory } from './hooks/useMemory';

function Chat() {
  const memory = useMemory();

  const sendMessage = async (userMsg: string) => {
    // 1. Search for relevant context
    const context = await memory.search({
      query: userMsg,
      top_k: 3
    });

    // 2. Build enriched prompt
    const contextText = context.results
      .map(r => r.text)
      .join('\n---\n');

    const enrichedPrompt = `
      Context from memory:
      ${contextText}

      User: ${userMsg}
    `;

    // 3. Send to AI
    await invoke('call_qwen', {
      input: { message: enrichedPrompt }
    });

    // 4. Save to memory
    await memory.saveChat('user', userMsg);
  };
}
```

### Pattern 3: Save Notes with Tags

```tsx
import { useMemory } from './hooks/useMemory';

function Notes() {
  const memory = useMemory();

  const saveNote = async (text: string, tags: string[]) => {
    await memory.ingest([{
      kind: 'note',
      text,
      meta: { tags, created: Date.now() },
      ts: Date.now()
    }]);
  };

  const searchByTag = async (tag: string) => {
    // Search will find notes with similar content
    // even if tag doesn't match exactly (semantic search!)
    await memory.search({ query: tag, filter_kind: 'note' });
  };
}
```

## Verification

Run these checks to ensure everything works:

### ✓ Memory Daemon Health Check
```bash
curl http://localhost:8765/docs
```
Should show FastAPI Swagger UI

### ✓ Test Ingest
```bash
curl -X POST http://localhost:8765/ingest \
  -H "Content-Type: application/json" \
  -d '{
    "items": [
      {"kind": "test", "text": "Hello from curl"}
    ],
    "model": "bge-small-en-v1.5"
  }'
```

### ✓ Test Search
```bash
curl -X POST http://localhost:8765/search \
  -H "Content-Type: application/json" \
  -d '{
    "query": "hello",
    "top_k": 5
  }'
```

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Connection refused | Start memory daemon: `cd memory-daemon && ./run.sh` |
| Import errors in React | Make sure files are in correct locations |
| Rust compile errors | Run `cargo clean` then `npm run tauri dev` |
| No search results | Ingest some data first |
| Slow embeddings | Normal on CPU, will be ~1-2s per batch |

## Environment Variables

Optional configuration in `.env`:

```bash
# Memory Daemon
MEMORY_DAEMON_URL=http://127.0.0.1:8765

# AI Server (existing)
AI_BASE_URL=http://127.0.0.1:5050/v1
AI_API_KEY=

# Logging
RUST_LOG=info
```

## File Structure

```
raeos/
├── src/
│   ├── services/
│   │   └── memoryDaemon.ts        # API functions
│   ├── hooks/
│   │   └── useMemory.ts           # React hooks
│   └── components/
│       └── MemoryExample.tsx      # Example component
├── src-tauri/
│   └── src/
│       └── main.rs                # Rust commands (mem_ingest, mem_search, etc.)
├── MEMORY_INTEGRATION.md          # Full documentation
├── TAURI_V2_CONFIG.md             # Tauri v2 guide
└── .env                           # Configuration

memory-daemon/
├── daemon.py                      # FastAPI server
├── memory.db                      # SQLite database
├── bge-small-en.onnx             # Embedding model
├── tokenizer.json                 # Tokenizer
├── run.sh                         # Startup script
└── test_setup.py                  # Validation script
```

## Next Steps

1. [ ] Start both services (daemon + tauri app)
2. [ ] Test with example component
3. [ ] Integrate into your chat UI
4. [ ] Add context enhancement
5. [ ] Customize for your use case

## Documentation

- **Full Integration Guide:** `MEMORY_INTEGRATION.md`
- **Tauri v2 Config:** `TAURI_V2_CONFIG.md`
- **Memory Daemon Setup:** `memory-daemon/SETUP_COMPLETE.md`

---

🎉 **You're all set!** Your app now has semantic memory powered by BGE embeddings.

Questions? Check the documentation files or the example component.
