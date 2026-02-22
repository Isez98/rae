from pathlib import Path
import os

# Point to the memory daemon's database
DB_PATH = os.getenv("MEM_DB", str(Path(__file__).resolve().parents[1] / "memory.db"))
PERSONA_PATH = os.getenv("PERSONA_PATH", str(Path(__file__).with_name("persona.txt")))

# Token budget for assembled prompt (adjust in env if you like)
TOKEN_BUDGET = int(os.getenv("CONTEXT_TOKEN_BUDGET", "2048"))

# Recent + recall sizes (tune to taste)
N_RECENT = int(os.getenv("CONTEXT_RECENT_N", "6"))
K_RECALL = int(os.getenv("CONTEXT_RECALL_K", "8"))
FRESH_HOURS = int(os.getenv("CONTEXT_FRESH_HOURS", "24"))

