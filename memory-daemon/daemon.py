from fastapi import FastAPI, Body
from pydantic import BaseModel
import time, os, json, numpy as np
import orjson
import apsw
import apsw.ext
import onnxruntime as ort
from typing import List, Optional, Tuple
from tokenizers import Tokenizer
import sqlite_vec
import httpx

# ---------- Config ----------
DB_PATH = os.environ.get("MEM_DB", "memory.db")
EMBED_DIM = int(os.environ.get("EMBED_DIM", "384"))
MODEL_NAME = os.environ.get("EMBED_MODEL", "bge-small-en")
EXT_KIND = os.environ.get("VEC_EXT", "sqlite-vec")  # or "sqlite-vss"

# ---------- ONNX Runtime (ROCm first, CPU fallback) ----------
def create_onnx_session():
    """Create ONNX runtime session with available providers."""
    onnx_path = os.environ.get("EMBED_ONNX_PATH", "bge-small-en.onnx")
    available_providers = ort.get_available_providers()
    
    # Try ROCm first if available
    if "ROCMExecutionProvider" in available_providers:
        try:
            sess = ort.InferenceSession(onnx_path, providers=["ROCMExecutionProvider"])
            print(f"✓ Using ROCMExecutionProvider for {onnx_path}")
            return sess
        except Exception as e:
            print(f"⚠ ROCMExecutionProvider failed: {e}")
    
    # Fallback to CPU
    try:
        sess = ort.InferenceSession(onnx_path, providers=["CPUExecutionProvider"])
        print(f"✓ Using CPUExecutionProvider for {onnx_path}")
        return sess
    except Exception as e:
        raise RuntimeError(f"Failed to create ONNX session: {e}")

sess = create_onnx_session()

# Load tokenizer
tokenizer = Tokenizer.from_file(os.environ.get("TOKENIZER_PATH", "tokenizer.json"))
tokenizer.enable_padding(pad_id=0, pad_token="[PAD]")
tokenizer.enable_truncation(max_length=512)

def _preprocess(texts: List[str]) -> dict:
    """Tokenize texts for ONNX model input."""
    encodings = tokenizer.encode_batch(texts)
    
    # Get input IDs and attention masks
    input_ids = np.array([enc.ids for enc in encodings], dtype=np.int64)
    attention_mask = np.array([enc.attention_mask for enc in encodings], dtype=np.int64)
    token_type_ids = np.zeros_like(input_ids, dtype=np.int64)
    
    return {
        "input_ids": input_ids,
        "attention_mask": attention_mask,
        "token_type_ids": token_type_ids
    }

def embed(texts: List[str]) -> np.ndarray:
    """Generate embeddings using ONNX model."""
    inputs = _preprocess(texts)
    
    # Run inference
    outputs = sess.run(None, inputs)
    embeddings = outputs[0]  # First output is usually the embeddings
    
    # Mean pooling with attention mask
    attention_mask = inputs["attention_mask"]
    attention_mask_expanded = np.expand_dims(attention_mask, -1)
    sum_embeddings = np.sum(embeddings * attention_mask_expanded, axis=1)
    sum_mask = np.clip(attention_mask_expanded.sum(axis=1), a_min=1e-9, a_max=None)
    pooled = sum_embeddings / sum_mask
    
    # Normalize for cosine similarity search
    norms = np.linalg.norm(pooled, axis=1, keepdims=True) + 1e-12
    return (pooled / norms).astype(np.float32)

# ---------- SQLite ----------
def connect():
    con = apsw.Connection(DB_PATH)
    cur = con.cursor()
    
    # Load vector extension using sqlite_vec Python package
    if EXT_KIND == "sqlite-vec":
        con.enable_load_extension(True)
        con.load_extension(sqlite_vec.loadable_path())
        con.enable_load_extension(False)
    else:
        # sqlite-vss would go here
        con.enable_load_extension(True)
        try:
            cur.execute("SELECT load_extension('vss0')")
        except Exception as e:
            print(f"Warning: Could not load vss0 extension: {e}")
        con.enable_load_extension(False)
    
    # Pragmas for speed
    for p in [
        "PRAGMA journal_mode=WAL",
        "PRAGMA synchronous=NORMAL",
        "PRAGMA temp_store=MEMORY"
    ]:
        cur.execute(p)
    return con

CON = connect()

# ---------- Models ----------
class IngestItem(BaseModel):
    ts: Optional[int] = None
    kind: str
    text: str
    meta: dict = {}
    source: str = "tauri"

class IngestBatch(BaseModel):
    items: List[IngestItem]
    debounce_ms: Optional[int] = 0  # client may set; server ignores for now
    model: str = MODEL_NAME

class SearchQuery(BaseModel):
    query: str
    top_k: int = 8
    filter_kind: Optional[str] = None
    since_ms: Optional[int] = None

# ---------- Helpers ----------
def upsert_vec_tables(cur, model: str, dim: int, rows: List[Tuple[int, bytes]]):
    if EXT_KIND == "sqlite-vec":
        # mirror into vec table with rowid=event_id
        # Note: dimension must be literal in SQL, not a bind parameter
        cur.execute(f"CREATE VIRTUAL TABLE IF NOT EXISTS vec_events USING vec0(embedding FLOAT[{dim}])")
        # Bulk upsert
        cur.execute("BEGIN")
        for event_id, vec_blob in rows:
            # vec0 accepts F32 blob; pack is already bytes
            cur.execute("INSERT OR REPLACE INTO vec_events(rowid, embedding) VALUES(?, ?)", (event_id, vec_blob))
        cur.execute("COMMIT")
    else:
        # sqlite-vss
        cur.execute(f"CREATE VIRTUAL TABLE IF NOT EXISTS vss_embeddings USING vss0(vec({dim}))")
        cur.execute("BEGIN")
        for event_id, vec_blob in rows:
            # vss expects F32 array; store in vss table
            cur.execute("INSERT OR REPLACE INTO vss_embeddings(rowid, vec) VALUES(?, ?)", (event_id, vec_blob))
        cur.execute("COMMIT")

def f32_to_blob(vec: np.ndarray) -> bytes:
    assert vec.dtype == np.float32 and vec.ndim == 1
    return vec.tobytes(order="C")

def blob_to_f32(b: bytes) -> np.ndarray:
    return np.frombuffer(b, dtype=np.float32)

# ---------- FastAPI ----------
app = FastAPI(title="Memory Daemon")

# ---------- Context Service Integration ----------
try:
    from context_service.app import build_context, BuildContextRequest, BuildContextResponse
    
    @app.post("/context/build", response_model=BuildContextResponse)
    def build_context_endpoint(req: BuildContextRequest):
        """Build context from memory for LLM prompts.
        
        Assembles persona + recent messages + semantic recall + fresh events
        within a token budget. Returns formatted prompt ready for LLM.
        """
        return build_context(req)
    
    print("✓ Context service integrated at /context/build")
except ImportError as e:
    print(f"⚠ Context service not available: {e}")

# ---------- Main Endpoints ----------

@app.post("/ingest")
def ingest(batch: IngestBatch):
    cur = CON.cursor()
    ts_now = int(time.time() * 1000)

    texts = [it.text for it in batch.items]
    vecs = embed(texts)  # (N, D)

    cur.execute("BEGIN")
    event_ids = []
    for it, vec in zip(batch.items, vecs):
        ts = it.ts or ts_now
        cur.execute(
            "INSERT INTO events(ts, kind, text, meta, source) VALUES(?, ?, ?, ?, ?)",
            (ts, it.kind, it.text, orjson.dumps(it.meta).decode(), it.source)
        )
        event_id = cur.getconnection().last_insert_rowid()
        event_ids.append(event_id)
        cur.execute(
            "INSERT OR REPLACE INTO embeddings(event_id, model, dim, vec) VALUES(?, ?, ?, ?)",
            (event_id, batch.model, EMBED_DIM, f32_to_blob(vec))
        )
    cur.execute("COMMIT")

    # reflect into vector index table
    rows = []
    for eid, vec in zip(event_ids, vecs):
        rows.append((eid, f32_to_blob(vec)))
    upsert_vec_tables(cur, batch.model, EMBED_DIM, rows)

    return {"inserted": len(event_ids), "event_ids": event_ids}

@app.post("/search")
def search(q: SearchQuery):
    # Embed the query
    qvec = embed([q.query])[0]  # (D,)
    qblob = f32_to_blob(qvec)

    cur = CON.cursor()
    base_filter = ""
    params: List = []

    if q.filter_kind:
        base_filter += " AND e.kind = ?"
        params.append(q.filter_kind)
    if q.since_ms:
        base_filter += " AND e.ts >= ?"
        params.append(q.since_ms)

    if EXT_KIND == "sqlite-vec":
        # sqlite-vec provides vec_each() for searching
        # Query syntax: SELECT * FROM vec_events WHERE embedding MATCH ? AND k = ?
        sql = f"""
        SELECT e.id, e.ts, e.kind, e.text, e.meta, distance
        FROM vec_events 
        JOIN events e ON e.id = vec_events.rowid
        WHERE embedding MATCH ? AND k = ?
        {base_filter.replace('WHERE 1=1', '')}
        ORDER BY distance ASC
        """
        res = list(cur.execute(sql, (qblob, q.top_k, *params)))
    else:
        # sqlite-vss exposes table-valued function vss_search()
        sql = f"""
        WITH qv AS (SELECT ? AS vec),
        hits AS (
          SELECT rowid AS event_id, distance
          FROM vss_search('vss_embeddings', 'vec', (SELECT vec FROM qv), ?)
        )
        SELECT e.id, e.ts, e.kind, e.text, e.meta, hits.distance
        FROM hits JOIN events e ON e.id = hits.event_id
        WHERE 1=1 {base_filter}
        ORDER BY hits.distance ASC
        LIMIT ?
        """
        res = list(cur.execute(sql, (qblob, q.top_k, *params, q.top_k)))

    return [
        {
            "id": r[0],
            "ts": r[1],
            "kind": r[2],
            "text": r[3],
            "meta": json.loads(r[4]) if r[4] else {},
            "distance": float(r[5]),
        } for r in res
    ]

@app.post("/summarize/daily")
async def summarize_day(day: Optional[str] = None):
    """
    Call this at ~23:55 local time from Tauri or a cron.
    Collects day's events, deduplicates, crafts a prompt, 
    calls Qwen2.5 chat server, and stores the summary.
    """
    cur = CON.cursor()
    
    # Compute start/end in ms (UTC midnight boundaries or passed day)
    if not day:
        day = time.strftime("%Y-%m-%d", time.gmtime())
    start_ts = int(time.mktime(time.strptime(day, "%Y-%m-%d"))) * 1000
    end_ts = start_ts + 24*60*60*1000

    # Fetch all events for the day
    rows = list(cur.execute(
        "SELECT ts, kind, text FROM events WHERE ts >= ? AND ts < ? ORDER BY ts ASC",
        (start_ts, end_ts)
    ))
    
    if not rows:
        return {"day": day, "status": "no-events"}

    # Deduplicate and prepare highlights (cap at ~6000 chars to limit tokens)
    seen_texts = set()
    highlights = []
    total_chars = 0
    max_chars = 6000
    
    for ts, kind, text in rows:
        # Simple deduplication
        if text in seen_texts:
            continue
        seen_texts.add(text)
        
        # Format entry
        time_str = time.strftime("%H:%M", time.gmtime(ts / 1000))
        entry = f"[{time_str}] [{kind}] {text}"
        
        # Check if we're within token budget (rough estimate: 4 chars ≈ 1 token)
        if total_chars + len(entry) > max_chars:
            highlights.append(f"... ({len(rows) - len(highlights)} more events omitted)")
            break
        
        highlights.append(entry)
        total_chars += len(entry)
    
    events_text = "\n".join(highlights)
    
    # Craft the prompt for Qwen2.5
    system_prompt = """You are a personal memory summarizer. Your job is to review a day's worth of user activities and produce:
1. A concise bullet-point summary of key events and interactions
2. Important decisions or insights that emerged
3. Any action items or todos mentioned

Keep your response organized, clear, and under 300 words. Focus on what matters most."""

    user_prompt = f"""Here are the highlights from {day}:

{events_text}

Please provide a structured daily summary."""

    # Call Qwen2.5 chat server (OpenAI-compatible API)
    qwen_url = os.environ.get("QWEN_API_URL", "http://127.0.0.1:5050/v1/chat/completions")
    qwen_api_key = os.environ.get("QWEN_API_KEY", "")
    
    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_prompt}
    ]
    
    payload = {
        "model": "qwen2.5-3b-gguf",
        "messages": messages,
        "temperature": 0.7,
        "max_tokens": 500,
        "stream": False
    }
    
    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            headers = {"Content-Type": "application/json"}
            if qwen_api_key:
                headers["Authorization"] = f"Bearer {qwen_api_key}"
            
            response = await client.post(qwen_url, json=payload, headers=headers)
            response.raise_for_status()
            
            result = response.json()
            summary_text = result["choices"][0]["message"]["content"]
            
            # Estimate tokens used (rough approximation)
            tokens_used = len(summary_text) // 4
            
            # Store in database
            cur.execute(
                "INSERT OR REPLACE INTO summaries(day, text, tokens, from_ts, to_ts) VALUES(?, ?, ?, ?, ?)",
                (day, summary_text, tokens_used, start_ts, end_ts)
            )
            
            return {
                "day": day,
                "status": "ok",
                "tokens": tokens_used,
                "events_processed": len(highlights),
                "summary": summary_text
            }
            
    except httpx.HTTPError as e:
        error_msg = f"Failed to call Qwen server: {str(e)}"
        print(error_msg)
        
        # Fallback: store a basic concatenation
        fallback_summary = f"# {day} — Daily Summary (Qwen unavailable)\n\n{events_text}"
        tokens = len(fallback_summary) // 4
        
        cur.execute(
            "INSERT OR REPLACE INTO summaries(day, text, tokens, from_ts, to_ts) VALUES(?, ?, ?, ?, ?)",
            (day, fallback_summary, tokens, start_ts, end_ts)
        )
        
        return {
            "day": day,
            "status": "fallback",
            "error": error_msg,
            "tokens": tokens,
            "events_processed": len(highlights)
        }

