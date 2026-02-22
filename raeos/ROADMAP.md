## 🧩 Phase 0 — Vision & Foundations (the manifesto phase)

**Goal:** Establish principles, architecture, and purpose.
**Milestone Definition:** “We know *what* we’re building, *why*, and *how it behaves*.”

### Deliverables

* ✅ **Pillars Manifesto** finalized (values: local-first, sovereign data, interpretable mind, modular cognition).
* ✅ **Core diagram** mapping modules (Memory, Context, Task Engine, Interface).
* ✅ **Tech stack** locked (Rust/Tauri + Python ROCm sidecar).
* ✅ **Success metrics** defined (e.g., local inference latency <1s per token, memory recall precision >80%).

### “Done when…”

You can explain your ecosystem’s purpose and constraints in one paragraph, and every future decision can be justified by the manifesto.

---

## ⚙️ Phase 1 — Minimal Living Prototype (MLP)

**Goal:** A self-contained, local “brain” that remembers, reasons, and interacts.
**Milestone Definition:** “It can remember yesterday, reason today, and act tomorrow.”

### Core modules to complete

1. **Memory Daemon**

   * Can record, retrieve, and vectorize data.
   * Stores JSON events + embeddings in SQLite.
   * Works offline.
2. **Context Manager**

   * Pulls relevant memories & injects personality into prompt.
   * Keeps daily summary logs.
3. **Task Engine (stub)**

   * Executes one sandboxed skill (write_file, log_note).
   * Uses YAML manifest.
4. **Interface Layer**

   * Tauri chat window connected to Rust backend.
   * Displays memory log + token stream.

### “Done when…”

* The AI can recall an event from a previous session accurately (e.g., “What did we talk about yesterday?”).
* You can execute a simple task via the chat (e.g., “Save this thought to notes”).
* You can see and edit the memory database manually.

---

## 🧠 Phase 2 — Autonomy & Adaptation

**Goal:** Your AI begins to self-maintain and expand capabilities responsibly.
**Milestone Definition:** “It can organize its own thoughts and learn over time.”

### New systems

1. **Skill orchestration**

   * Add multiple skills with allow-lists and audit trail.
   * Support parallel task scheduling via Rust tokio.
2. **Summarization & pruning**

   * Daily self-summarization pipeline.
   * Periodic memory compression (retain key facts, discard redundancy).
3. **Reflection loop**

   * AI can reflect on actions:
     “What did I do well this week? What confused me?”
4. **Permission model**

   * Explicit allow/deny UI for new capabilities.

### “Done when…”

* The AI can automatically summarize your weekly activity.
* It can propose new skills (“Would you like me to index PDFs?”).
* Every action is transparent and explainable through the audit panel.

---

## 🌐 Phase 3 — Multi-Modal Awareness

**Goal:** Extend senses — vision, voice, and external data streams.
**Milestone Definition:** “It perceives, not just reads.”

### Integrations

* OCR ingestion (handwriting/doc scanning).
* Speech input + text-to-speech.
* External API adapters (calendar, notes, local file watcher).
* Live data ingestion through `event bus`.

### “Done when…”

* You can talk to it through mic or camera.
* It extracts information from real-world documents.
* You can query: “Summarize all scanned rental forms this week.”

---

## 🕸️ Phase 4 — Ecosystem Expansion

**Goal:** From single instance → interoperable network of local AIs.
**Milestone Definition:** “It can collaborate and share models or memories securely.”

### Evolution

* **Federated linking:** encrypted sync with other devices or trusted peers.
* **API standard:** local AIs expose `/context`, `/skills`, `/memory` endpoints.
* **Versioning:** schema + embeddings version management.
* **Runtime marketplace:** install skills as modules from a signed registry.

### “Done when…”

* Two personal AIs (e.g., on laptop + phone) can share or sync memory safely.
* You can install or remove skills without breaking the core.
* The ecosystem survives version upgrades — it’s stable enough to live independently.

---

## 🧬 Phase 5 — Maturity: The Personal AI Ecosystem

**Goal:** A fully sovereign, adaptive, interoperable AI runtime — yours alone.
**Milestone Definition:** “It’s your second self, private, persistent, and extensible.”

### Capabilities at maturity

* Persistent long-term memory (years).
* Self-updating modules with explainable diffs.
* Clear privacy boundaries (audit trail of all data flow).
* Local-first inference + optional cloud connectors.
* Interface as OS-layer companion (tray, voice, or glasses).

### “Done when…”

* You can rebuild your AI from scratch using only your local data backup.
* You can export its memories, skills, and personality config — and restore them elsewhere.
* You can trust it to act autonomously *within predefined bounds* (e.g., schedule tasks, draft plans).
* It feels *alive* — not because it’s magical, but because it continuously learns from you, in your presence.

---

## 🧭 Optional Metrics for Each Phase

| Area               | Metric                              | Target        |
| ------------------ | ----------------------------------- | ------------- |
| Memory recall      | Top-3 relevant events recall        | ≥80% accuracy |
| Context latency    | From query → full context assembled | <1.5s         |
| Task runtime       | Simple skill execution              | <500ms        |
| Audit completeness | Actions with visible logs           | 100%          |
| User trust         | Manual override confidence          | 100% pass     |

---

<details>
<summary><b>Flow Chart</b></summary>

```mermaid
gantt
  title Personal AI Ecosystem — Milestone Roadmap
  dateFormat  YYYY-MM-DD
  axisFormat  %b %d

  %% Anchor start
  section Phase 0 — Vision & Foundations
  Pillars manifesto, architecture, metrics locked        :milestone, m0, 2025-10-27, 1d

  section Phase 1 — Minimal Living Prototype (MLP)
  Memory daemon (SQLite + vectors, WAL, APIs)            :active, t1a, after m0, 4d
  Context manager (relevance + daily summaries)          :t1b, after t1a, 3d
  Task engine stub (one safe skill, YAML manifest)       :t1c, after t1b, 2d
  Tauri chat UI + token streaming                        :t1d, after t1c, 3d
  MLP done when: recall yesterday + execute a simple task:milestone, m1, after t1d, 1d

  section Phase 2 — Autonomy & Adaptation
  Skill orchestration (multiple skills, audit trail)     :t2a, after m1, 4d
  Summarization + pruning pipeline                       :t2b, after t2a, 3d
  Reflection loop (weekly review, lessons)               :t2c, after t2b, 2d
  Permission model UI (allow, deny, explain)             :t2d, after t2c, 2d
  Autonomy done when: weekly auto summary + proposals    :milestone, m2, after t2d, 1d

  section Phase 3 — Multi-Modal Awareness
  OCR ingestion (docs, handwriting to text)              :t3a, after m2, 4d
  Voice IO (STT and TTS)                                 :t3b, after t3a, 3d
  External adapters (calendar, file watcher, notes)      :t3c, after t3b, 3d
  Multimodal done when: talk, see, extract & query docs  :milestone, m3, after t3c, 1d

  section Phase 4 — Ecosystem Expansion
  Encrypted device sync or trusted peer link             :t4a, after m3, 4d
  Local API standard (/context, /skills, /memory)        :t4b, after t4a, 3d
  Versioning for schema and embeddings                   :t4c, after t4b, 2d
  Signed skill registry (install, remove, rollback)      :t4d, after t4c, 3d
  Expansion done when: two devices sync safely           :milestone, m4, after t4d, 1d

  section Phase 5 — Maturity
  Backup and full restore of mind state                  :t5a, after m4, 3d
  Self-updates with explainable diffs                    :t5b, after t5a, 3d
  Privacy boundaries with complete audit trail           :t5c, after t5b, 2d
  OS-layer companion (tray, hotkeys, optional voice)     :t5d, after t5c, 3d
  Ecosystem done when: sovereign, portable, trusted      :milestone, m5, after t5d, 1d
```

</details>