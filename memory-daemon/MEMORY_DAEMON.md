Using SQLite in a Python sidecar

```mermaid
flowchart LR
    UI[Tauri Frontend] -->|invoke| RB[Tauri Rust backend]
    RB -- POST /ingest, /search --> MD[Memory Daemon (FastAPI)]
    subgraph Memory Daemon
      E[ONNX Embeddings (bge-small-en / GTE-small) via onnxruntime-rocm]
      DB[(SQLite + WAL + sqlite-vec|sqlite-vss)]
      S[Summarizer (Qwen2.5, daily)] 
    end
    MD <--> DB
    S --> DB
```