from fastapi import FastAPI
from pydantic import BaseModel
from typing import List, Dict, Any
from pathlib import Path
from .config import PERSONA_PATH, TOKEN_BUDGET, N_RECENT, K_RECALL, FRESH_HOURS
from . import db

app = FastAPI(title="Context Manager")

class BuildContextRequest(BaseModel):
    user_input: str
    token_budget: int | None = None

class BuildContextResponse(BaseModel):
    prompt: str
    chosen_ids: List[str] = []
    stats: Dict[str, Any] = {}

def estimate_tokens(s: str) -> int:
    # Simple, fast heuristic: ~1 token ≈ 4 chars
    return max(1, len(s) // 4)

def dedupe_by_id(items: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    seen = set()
    out = []
    for it in items:
        _id = it.get("id")
        if _id and _id not in seen:
            seen.add(_id)
            out.append(it)
    return out

def load_persona() -> str:
    p = Path(PERSONA_PATH)
    if not p.exists():
        return 'You are "Rae".'
    return p.read_text(encoding="utf-8").strip()

@app.post("/context/build", response_model=BuildContextResponse)
def build_context(req: BuildContextRequest):
    persona = load_persona()
    budget = req.token_budget or TOKEN_BUDGET

    # 1) Recent chat turns (handle empty DB gracefully)
    try:
        recent = db.last_messages(N_RECENT)
    except Exception as e:
        print(f"Warning: Could not fetch recent messages: {e}")
        recent = []

    # 2) Semantic-ish recall (swap to true vector recall when you wire query embeddings)
    try:
        recall = db.search_embeddings(req.user_input, K_RECALL)
    except Exception as e:
        print(f"Warning: Could not fetch recall: {e}")
        recall = []

    # 3) Fresh items (last N hours)
    try:
        fresh = db.last_hours(FRESH_HOURS)
    except Exception as e:
        print(f"Warning: Could not fetch fresh events: {e}")
        fresh = []

    # Merge + dedupe, maintain useful ordering: recent > recall > fresh
    merged = dedupe_by_id(recent + recall + fresh)

    # 4) Trim to token budget
    header = f"{persona}\n\n[Context]\n"
    budget_left = max(128, budget - estimate_tokens(header) - estimate_tokens(req.user_input) - 32)  # keep room for the question
    chosen = []
    used_tokens = 0

    for ev in merged:
        line = f"{ev['kind']}: {ev['text'].strip()}"
        t = estimate_tokens(line) + 2
        if used_tokens + t > budget_left:
            break
        chosen.append((ev["id"], line))
        used_tokens += t

    context_block = "\n".join(l for _, l in chosen)
    prompt = f"{header}{context_block}\n\n[User]\n{req.user_input.strip()}"

    return BuildContextResponse(
        prompt=prompt,
        chosen_ids=[i for i, _ in chosen],
        stats={
            "recent": len(recent),
            "recall": len(recall),
            "fresh": len(fresh),
            "used_tokens_est": used_tokens,
            "budget": budget
        }
    )
