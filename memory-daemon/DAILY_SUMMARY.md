# Daily Summary Feature

## Overview

The daily summary feature automatically generates AI-powered summaries of your day's activities at 23:55 local time. These summaries are created by the Qwen2.5 3B model and stored in the memory daemon's SQLite database.

## Architecture

### Memory Daemon Endpoint: `/summarize/daily`

**Location:** `/storage/vs-code/Rae/memory-daemon/daemon.py`

The endpoint performs the following steps:

1. **Collect Events**: Retrieves all events from the specified day (defaults to current day UTC)
2. **Deduplicate**: Removes duplicate text entries
3. **Token Limiting**: Caps event highlights at ~6000 characters (~1500 tokens) to stay within model context
4. **Prompt Construction**:
   - **System prompt**: Instructs the AI to act as a personal memory summarizer
   - **User prompt**: Contains formatted, timestamped event highlights
5. **AI Generation**: Calls the Qwen2.5 chat server at `http://127.0.0.1:5050/v1/chat/completions`
6. **Storage**: Saves the summary to the `summaries` table with metadata

### Database Schema

```sql
CREATE TABLE summaries (
  day          TEXT PRIMARY KEY,     -- "2025-10-28" (UTC)
  text         TEXT NOT NULL,        -- AI-generated summary
  tokens       INTEGER NOT NULL,     -- Approximate token count
  from_ts      INTEGER NOT NULL,     -- Start timestamp (Unix ms)
  to_ts        INTEGER NOT NULL      -- End timestamp (Unix ms)
);
```

### Tauri Scheduler

**Location:** `/storage/vs-code/Rae/raeos/src-tauri/src/main.rs`

A background task `daily_summary_scheduler()` runs continuously:

- Uses `chrono` to calculate the next 23:55 local time trigger
- Sleeps until the trigger time
- Makes a POST request to `http://127.0.0.1:8765/summarize/daily`
- Logs the result and schedules the next day's summary

## Configuration

### Environment Variables

**Memory Daemon (daemon.py):**
```bash
QWEN_API_URL=http://127.0.0.1:5050/v1/chat/completions  # Default
QWEN_API_KEY=                                             # Optional, for secured servers
```

**Tauri Backend (main.rs):**
```bash
MEMORY_DAEMON_URL=http://127.0.0.1:8765  # Default
```

## Manual Triggering

You can manually trigger a summary via:

### From Tauri Frontend
```typescript
import { invoke } from '@tauri-apps/api/core';

// Summarize today
const result = await invoke('mem_summarize_daily');

// Summarize a specific day
const result = await invoke('mem_summarize_daily', { day: '2025-10-27' });
```

### Via HTTP
```bash
# Today's summary
curl -X POST http://127.0.0.1:8765/summarize/daily

# Specific day
curl -X POST http://127.0.0.1:8765/summarize/daily \
  -H "Content-Type: application/json" \
  -d '{"day": "2025-10-27"}'
```

## Response Format

```json
{
  "day": "2025-10-28",
  "status": "ok",
  "tokens": 245,
  "events_processed": 87,
  "summary": "# Daily Summary\n\n## Key Events\n- ..."
}
```

**Status values:**
- `ok`: Summary generated successfully
- `no-events`: No events found for the day
- `fallback`: Qwen server unavailable, used basic concatenation

## Fallback Behavior

If the Qwen2.5 server is unavailable:
- The endpoint logs the error
- Stores a basic concatenated list of events
- Returns `status: "fallback"` with error details

## Testing

### 1. Install Dependencies
```bash
cd /storage/vs-code/Rae/memory-daemon
pip install -r requirements.txt
```

### 2. Start Memory Daemon
```bash
# Start on port 8765 (or set MEMORY_DAEMON_URL)
uvicorn daemon:app --host 127.0.0.1 --port 8765
```

### 3. Start Qwen Server
```bash
# From raven-llm-lab directory
./llama.cpp/build/bin/llama-server \
  --model ./models/qwen2.5-3b-instruct.gguf \
  --port 5050 \
  --ctx-size 8192
```

### 4. Test the Endpoint
```bash
# Trigger summary for today
curl -X POST http://127.0.0.1:8765/summarize/daily

# View the summary
sqlite3 /storage/vs-code/Rae/memory-daemon/memory.db \
  "SELECT day, substr(text, 1, 200) as preview FROM summaries ORDER BY day DESC LIMIT 1;"
```

## Future Enhancements

- [ ] Add user-configurable summary templates
- [ ] Support weekly/monthly summaries
- [ ] Add sentiment analysis to summaries
- [ ] Allow custom scheduling times via config
- [ ] Implement summary versioning for regeneration
- [ ] Add export to markdown/PDF
- [ ] Integrate summary trends visualization

## Troubleshooting

### Summary Not Generated

1. **Check scheduler logs** in Tauri:
   ```
   grep "Daily summary" ~/.local/state/raven-app/logs/*
   ```

2. **Verify Qwen server is running**:
   ```bash
   curl http://127.0.0.1:5050/health
   ```

3. **Check memory daemon logs**:
   ```bash
   # If running with uvicorn
   # Check terminal output for errors
   ```

### Empty Summaries

- Ensure events exist for the day:
  ```sql
  SELECT COUNT(*) FROM events WHERE date(ts/1000, 'unixepoch') = date('now');
  ```

### Token Limit Exceeded

- The system caps at ~6000 chars before sending to Qwen
- Adjust `max_chars` in `daemon.py` if needed
- Consider implementing smarter event filtering

## Dependencies

**Python (memory-daemon):**
- `httpx>=0.25.0` - Async HTTP client for Qwen API calls

**Rust (src-tauri):**
- `chrono=0.4` - Date/time handling for scheduling
