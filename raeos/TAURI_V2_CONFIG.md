# Tauri v2 Configuration Guide

## Tauri v1 → v2 Migration

Your snippet was from **Tauri v1**. Here's the Tauri v2 equivalent:

### ❌ Tauri v1 (OLD - Don't use)
```json
{
  "tauri": {
    "bundle": { "active": true },
    "allowlist": { "http": { "request": true } },
    "updater": { "active": false },
    "systemTray": { "iconPath": "icons/icon.png" },
    "sidecar": { "active": false }
  }
}
```

### ✅ Tauri v2 (NEW - Current)
```json
{
  "bundle": { "active": true },
  "app": {
    "trayIcon": {
      "iconPath": "icons/icon.png",
      "iconAsTemplate": true
    }
  },
  "plugins": {
    "updater": { "active": false }
  }
}
```

## Key Changes in Tauri v2

### 1. **Bundle** ✅ 
- Stays at top level
- Already configured correctly

### 2. **HTTP Requests** ✅
In Tauri v2, there are **3 ways** to make HTTP requests:

#### Option A: Frontend fetch() - **RECOMMENDED for localhost**
```typescript
// No special permissions needed!
const response = await fetch('http://localhost:8765/ingest', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ items: [...] })
});
```

#### Option B: Rust reqwest (already in Cargo.toml)
```rust
// src-tauri/src/lib.rs
#[tauri::command]
async fn call_memory_daemon(endpoint: String, body: String) -> Result<String, String> {
    let client = reqwest::Client::new();
    let response = client
        .post(format!("http://localhost:8765/{}", endpoint))
        .header("Content-Type", "application/json")
        .body(body)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    
    response.text().await.map_err(|e| e.to_string())
}
```

Then call from frontend:
```typescript
import { invoke } from '@tauri-apps/api/core';
const result = await invoke('call_memory_daemon', {
  endpoint: 'ingest',
  body: JSON.stringify(data)
});
```

#### Option C: tauri-plugin-http (if needed for cross-origin)
Only needed for non-localhost external APIs. Add to Cargo.toml:
```toml
[dependencies]
tauri-plugin-http = "2"
```

### 3. **System Tray** ✅
Changed from `systemTray` to `trayIcon` (already added to your config)

### 4. **Updater** ✅
Moved to `plugins.updater` (already added to your config)

### 5. **Sidecars**
Not needed since your memory daemon runs separately via `./run.sh`

## Current Configuration Status

### ✅ tauri.conf.json
```json
{
  "bundle": { "active": true },        // ✓ Correct
  "app": {
    "trayIcon": { ... }                // ✓ Added (v2 format)
  },
  "plugins": {
    "updater": { "active": false }     // ✓ Added
  }
}
```

### ✅ capabilities/default.json
```json
{
  "permissions": [
    "core:default",    // ✓ Basic window/app permissions
    "opener:default"   // ✓ Open URLs/files
  ]
}
```

### ✅ Cargo.toml Dependencies
```toml
tauri = "2"
tauri-plugin-opener = "2"
reqwest = { version = "0.12", features = ["json"] }  // ✓ For HTTP
```

## Connecting to Memory Daemon

### Recommended Approach: Direct fetch() from Frontend

```typescript
// src/services/memoryDaemon.ts
const DAEMON_URL = 'http://localhost:8765';

export async function ingestMemory(items: any[]) {
  const response = await fetch(`${DAEMON_URL}/ingest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      items,
      model: 'bge-small-en-v1.5'
    })
  });
  
  if (!response.ok) {
    throw new Error(`Memory daemon error: ${response.statusText}`);
  }
  
  return response.json();
}

export async function searchMemory(query: string, topK = 8) {
  const response = await fetch(`${DAEMON_URL}/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query,
      top_k: topK
    })
  });
  
  return response.json();
}
```

### Usage in React Component:

```tsx
import { ingestMemory, searchMemory } from './services/memoryDaemon';

function App() {
  const handleSaveNote = async (text: string) => {
    try {
      await ingestMemory([{
        kind: 'note',
        text: text,
        meta: { timestamp: Date.now() },
        source: 'tauri'
      }]);
      console.log('Note saved to memory!');
    } catch (err) {
      console.error('Failed to save:', err);
    }
  };

  const handleSearch = async (query: string) => {
    try {
      const results = await searchMemory(query);
      console.log('Search results:', results);
    } catch (err) {
      console.error('Search failed:', err);
    }
  };
  
  return (/* your UI */);
}
```

## Starting the Memory Daemon

Before launching your Tauri app, start the daemon:

```bash
cd memory-daemon
./run.sh
```

Or add to your development workflow:
```bash
# Terminal 1: Memory daemon
cd memory-daemon && ./run.sh

# Terminal 2: Tauri app
cd raeos && npm run tauri dev
```

## Summary

✅ **Your config is now Tauri v2 compliant!**
- Bundle: Configured
- Tray icon: Added
- Updater: Disabled (can enable later)
- HTTP: Use fetch() or reqwest (no special permissions needed for localhost)

No `allowlist`, no `sidecar`, no v1 patterns. You're good to go! 🚀
