import apsw
import apsw.ext
from typing import List, Dict, Any, Tuple
from datetime import datetime, timedelta, timezone
import numpy as np
from pathlib import Path
from .config import DB_PATH
import sqlite_vec

# --- Notes ---
# - Uses APSW to match the main daemon
# - Timestamps are stored as unix ms (int) in events table
# - Event kinds are like "chat:user", "chat:ai", "note", etc.
# - Vector search uses existing embeddings and vec_events table

def _connect() -> apsw.Connection:
    conn = apsw.Connection(DB_PATH)
    # Load sqlite-vec extension
    conn.enable_load_extension(True)
    conn.load_extension(sqlite_vec.loadable_path())
    conn.enable_load_extension(False)
    return conn

def _now_ms() -> int:
    """Return current time as unix milliseconds"""
    return int(datetime.now(timezone.utc).timestamp() * 1000)

def last_messages(n: int) -> List[Dict[str, Any]]:
    """Get last N chat messages (user/assistant)"""
    with _connect() as conn:
        cur = conn.cursor()
        rows = list(cur.execute("""
            SELECT id, ts, kind, text
            FROM events
            WHERE kind IN ('chat:user', 'chat:ai')
            ORDER BY ts DESC
            LIMIT ?
        """, (n,)))
    
    # Convert to dicts and reverse to chronological order
    result = []
    for row in reversed(rows):
        result.append({
            "id": str(row[0]),  # Convert ID to string
            "ts": row[1],
            "kind": row[2],
            "text": row[3]
        })
    return result

def last_hours(hours: int) -> List[Dict[str, Any]]:
    """Get all events from last N hours"""
    cutoff_ms = _now_ms() - (hours * 60 * 60 * 1000)
    with _connect() as conn:
        cur = conn.cursor()
        rows = list(cur.execute("""
            SELECT id, ts, kind, text
            FROM events
            WHERE ts >= ?
            ORDER BY ts DESC
        """, (cutoff_ms,)))
    
    return [{
        "id": str(row[0]),  # Convert ID to string
        "ts": row[1],
        "kind": row[2],
        "text": row[3]
    } for row in rows]

def _decode_vec(blob: bytes) -> np.ndarray:
    """Decode float32 vector from blob"""
    return np.frombuffer(blob, dtype=np.float32)

def search_embeddings(query_text: str, k: int) -> List[Dict[str, Any]]:
    """
    Search for similar events using embeddings.
    For now uses a simple text-based fallback until we wire up query embeddings.
    
    TODO: In production, this should:
    1. Embed the query_text using the same model (bge-small-en)
    2. Use the vec_events MATCH syntax to find similar vectors
    3. Return the top-k results
    """
    # Temporary fallback: keyword-based search
    tokens = set(query_text.lower().split())
    if not tokens:
        return []
    
    with _connect() as conn:
        cur = conn.cursor()
        # Get recent events with embeddings (limit to reasonable number)
        rows = list(cur.execute("""
            SELECT e.id, e.ts, e.kind, e.text
            FROM events e
            JOIN embeddings em ON e.id = em.event_id
            ORDER BY e.ts DESC
            LIMIT 500
        """))
    
    # Score by keyword overlap (simple fallback)
    scored = []
    for row in rows:
        event_id, ts, kind, text = row
        words = set((text or "").lower().split())
        overlap = len(tokens & words) / (len(tokens | words) or 1)
        if overlap > 0:
            scored.append((overlap, {
                "id": str(event_id),  # Convert ID to string
                "ts": ts,
                "kind": kind,
                "text": text
            }))
    
    # Sort by score descending and return top-k
    scored.sort(key=lambda x: x[0], reverse=True)
    return [meta for _, meta in scored[:k]]

def search_embeddings_vector(query_vec: bytes, k: int) -> List[Dict[str, Any]]:
    """
    Search using actual vector similarity (when query embedding is provided).
    Uses the vec_events table for fast vector search.
    """
    with _connect() as conn:
        cur = conn.cursor()
        
        # Use sqlite-vec MATCH syntax
        rows = list(cur.execute("""
            SELECT e.id, e.ts, e.kind, e.text, distance
            FROM vec_events
            JOIN events e ON e.id = vec_events.rowid
            WHERE embedding MATCH ? AND k = ?
            ORDER BY distance ASC
        """, (query_vec, k)))
    
    return [{
        "id": str(row[0]),  # Convert ID to string
        "ts": row[1],
        "kind": row[2],
        "text": row[3],
        "distance": row[4]
    } for row in rows]

