# Memory Daemon Frontend - Visual Guide

## Main App Interface

The updated `App.tsx` now includes three main sections:

### 1. Header with Memory Controls

```
┌─────────────────────────────────────────────────────────┐
│  Rae (local desktop)     [Search Memory] [Daily Summary]│
└─────────────────────────────────────────────────────────┘
```

**Buttons:**
- **Search Memory**: Toggle memory search panel
- **Daily Summary**: Generate today's AI summary

### 2. Memory Search Panel (Expandable)

When "Search Memory" is clicked:

```
┌─────────────────────────────────────────────────────────┐
│ Memory Search                                            │
├─────────────────────────────────────────────────────────┤
│ [Search your memory...          ] [Search] [Clear]      │
├─────────────────────────────────────────────────────────┤
│ Found 3 results:                                         │
│                                                          │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ [chat:user] 10/28/2025, 2:30 PM (similarity: 0.923) │ │
│ │ What's the weather like today?                       │ │
│ └─────────────────────────────────────────────────────┘ │
│                                                          │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ [note] 10/28/2025, 1:15 PM (similarity: 0.887)      │ │
│ │ Remember to check the forecast for tomorrow         │ │
│ └─────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

**Features:**
- Real-time semantic search across all saved events
- Shows event type, timestamp, and similarity score
- Scrollable results (max 200px height)
- Clear button to reset results

### 3. Daily Summary Panel (Expandable)

When "Daily Summary" is clicked and generated:

```
┌─────────────────────────────────────────────────────────┐
│ Daily Summary - 2025-10-28                      [Close] │
├─────────────────────────────────────────────────────────┤
│ ┌─────────────────────────────────────────────────────┐ │
│ │ ## Key Events                                        │ │
│ │ - Had 5 conversations about weather and climate     │ │
│ │ - Completed research on AI memory systems           │ │
│ │ - Created 3 notes about project planning            │ │
│ │                                                      │ │
│ │ ## Important Decisions                              │ │
│ │ - Decided to implement buffered memory ingestion    │ │
│ │ - Chose Qwen2.5 for summary generation              │ │
│ │                                                      │ │
│ │ ## Action Items                                      │ │
│ │ - Test memory search functionality                  │ │
│ │ - Document the API endpoints                        │ │
│ │                                                      │ │
│ │ (245 tokens, 87 events)                             │ │
│ └─────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

**Features:**
- AI-generated structured summary
- Shows token count and number of events processed
- Close button to hide panel
- Blue background for visual distinction

### 4. Chat Log (Always Visible)

```
┌─────────────────────────────────────────────────────────┐
│                                                          │
│ You: Hello Rae!                                          │
│                                                          │
│ Rae: Hi! How can I help you today?                      │
│                                                          │
│ You: What's the weather like?                           │
│                                                          │
│ Rae: I don't have access to weather data, but...       │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

**Features:**
- Scrollable chat history (380px height)
- Real-time streaming updates from Qwen
- **Auto-saves all messages to memory** (invisible to user)

### 5. Input Area (Always Visible)

```
┌─────────────────────────────────────────────────────────┐
│ [Tell Rae something...                    ] [Send]      │
└─────────────────────────────────────────────────────────┘
```

**Features:**
- Enter key to send
- Disabled during AI response
- Button shows "Thinking..." when busy

## User Flow Examples

### Example 1: Chat with Auto-Save

1. User types: "Remind me about the meeting tomorrow"
2. User presses Enter
3. **Behind the scenes:** Message saved to memory (buffered)
4. Rae responds with AI answer
5. **Behind the scenes:** Response saved to memory (buffered)

### Example 2: Search Past Conversations

1. User clicks "Search Memory"
2. Search panel expands
3. User types: "meeting"
4. User presses Enter or clicks "Search"
5. Results appear with all matching events
6. User can see when they mentioned meetings before

### Example 3: Generate Daily Summary

1. User clicks "Daily Summary"
2. Button shows "Generating..."
3. Backend calls memory daemon → Qwen → summary generated
4. Summary panel appears with structured markdown
5. User reads key events, decisions, and todos
6. User clicks "Close" to hide panel

## Memory Features Integration

### Automatic (No User Action Required)

✅ **Chat Messages Auto-Saved**
- Every user message → saved as `chat:user`
- Every AI response → saved as `chat:ai`
- Buffered (batched every 5s or 64 items)
- Non-blocking (doesn't slow down UI)

✅ **Nightly Summaries**
- Runs automatically at 23:55 local time
- Triggered by Tauri background task
- Summarizes the entire day's events
- Stored in database for later viewing

### Manual (User-Initiated)

🔍 **Search**
- Semantic search (not just keywords)
- Finds similar meanings, not exact matches
- Searches across all event types
- Returns top 8 most relevant results

📊 **Summary Generation**
- On-demand daily summaries
- Can specify any past date
- Shows event count and token usage
- AI-powered insights and action items

## Data Flow

```
User types message
    ↓
App.tsx: autoSaveMessage('user', text)
    ↓
useMemoryAutoSave hook
    ↓
memoryIngestBuffered (service)
    ↓
Tauri backend: mem_ingest_buffered
    ↓
Buffered (queued, batched)
    ↓
Flushed to Memory Daemon (every 5s or 64 items)
    ↓
Memory Daemon: /ingest
    ↓
- Generate embeddings (ONNX)
- Store in SQLite
- Index in vector table
```

## Color Scheme

| Element | Color | Purpose |
|---------|-------|---------|
| Search panel | `#f9f9f9` | Subtle distinction |
| Summary panel | `#f0f8ff` | Light blue - special |
| Chat log | `#fafafa` | Light background |
| Buttons (normal) | `transparent` | Minimal |
| Buttons (active) | `#333` | Dark emphasis |
| Buttons (disabled) | `#ddd` | Clearly disabled |
| Result cards | `white` | Content containers |
| Timestamps | `#666` | De-emphasized text |

## Responsive Behavior

- **Search results**: Max 200px height, scrollable
- **Summary**: Max 200px height, scrollable
- **Chat log**: Fixed 380px height, scrollable
- **Input**: Flex-grows to fill available width
- **Mobile**: Single column layout (CSS can be adjusted)

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Enter` in chat input | Send message |
| `Enter` in search input | Execute search |
| `Escape` | (Can be added to close panels) |

## Next Steps for Enhancement

Suggested UI improvements:

1. **Search filters**: Add dropdown for event type
2. **Date range picker**: Filter by date in search
3. **Summary history**: View past summaries
4. **Export button**: Export summary as markdown
5. **Context menu**: Right-click to save selection as note
6. **Keyboard shortcuts**: Add hotkeys for search/summary
7. **Dark mode**: Toggle dark theme
8. **Memory stats**: Show dashboard with usage stats

## Testing the UI

Run the setup script:

```bash
cd /storage/vs-code/Rae/raeos
./setup-memory-frontend.sh
```

Then follow the instructions to start:
1. Memory daemon (port 8765)
2. Qwen server (port 5050)
3. Tauri app (npm run tauri dev)

Try these flows:
- ✅ Send several chat messages
- ✅ Search for keywords from your messages
- ✅ Generate a daily summary
- ✅ Clear search results
- ✅ Close and reopen panels
