# Manifesto

**Project:** Personal AI Ecosystem (codename: “RaeOS”)
**Purpose:** Give every person a sovereign, legible, and modular intelligence they truly own.

**Pillars**

1. **Local-first intelligence** — run inference/memory locally; escalate to cloud only when policy allows.
2. **Sovereign data** — user owns embeddings, logs, prompts, and weights; everything is portable.
3. **Interpretable personality** — behavior is driven by a readable config (goals, values, constraints).
4. **Modular cognition** — memory, planner, tools, voice, perception are hot-swappable.
5. **Transparent autonomy** — every autonomous act has a rationale, scope, and kill-switch.
6. **Privacy by design** — default encryption at rest & in transit; minimization as a rule.
7. **Human override** — user can pause, inspect, revert, and delete—instantly and globally.

**Non-goals**
• Adtech/telemetry by default • Closed, uninspectable models • Cloud lock-in

---

# Pillars → Design Rules → Tradeoffs

## 1) Local-first intelligence

* **Rules:**

  * Always attempt local model; include `fallback_policy.yaml` for when to call cloud.
  * Cache remote outputs with local signatures for reproducibility.
* **Tradeoffs:** higher device requirements; mitigate with quantization, adapters, streaming.

## 2) Sovereign data

* **Rules:**

  * Single user vault: `~/.raeos/vault/` with `embeddings/`, `memories/`, `sessions/`, `keys/`.
  * Export/erase must be one command (`rae export`, `rae nuke --scope mem`).
* **Tradeoffs:** user must manage backups; provide encrypted export bundles.

## 3) Interpretable personality

* **Rules:**

  * Personality is a YAML doc; no hidden weights override it.
  * Changes are versioned; every session pins a personality hash.
* **Tradeoffs:** config drift—use schema validation & diffs.

## 4) Modular cognition

* **Rules:**

  * Components talk over an event bus (`/core/events`) with typed messages.
  * Capability discovery via manifest (`rae-plugin.toml`).
* **Tradeoffs:** more interfaces; provide stable SDK.

## 5) Transparent autonomy

* **Rules:**

  * Every autonomous task has: intent, allowed tools, budget caps, timeout, reviewer = user.
  * A “black box” step must attach an explanation artifact.
* **Tradeoffs:** slower; accept friction for safety.

## 6) Privacy by design

* **Rules:**

  * Default E2E: XChaCha20-Poly1305 at rest; TLS 1.3 on wire; keys local only.
  * Data minimization: disable logs unless user flips `telemetry: on`.
* **Tradeoffs:** harder support; ship local diagnostics bundle tool.

## 7) Human override

* **Rules:**

  * Global hotkey to pause; UI shows live plan + “stop & rollback.”
  * Undo creates an inverse patch to vault artifacts.
* **Tradeoffs:** requires careful state modeling.

---

# Personality Config (schema + example)

```yaml
# schema: v1
id: "rae"
version: 1
values:
  - sovereignty
  - clarity
  - care
goals:
  primary: "Be a dependable, local-first companion that protects the user's agency."
  secondary:
    - "Teach by building."
    - "Prefer verifiable actions."
voice:
  style: "calm-goth"
  terseness: "concise"
constraints:
  max_autonomy_minutes: 15
  forbidden_tools: ["social_posting"]
  red_lines: ["share PII", "upload vault"]
policies:
  data_sharing: "deny-by-default"
  cloud_fallback:
    allowed: true
    providers: ["user-configured-openai","self-hosted-llama"]
    conditions:
      - "local_model_latency_ms > 2500"
      - "task_class == 'transient_speech_to_text'"
explanations:
  required_for: ["spend>5usd","file_write","external_api_call"]
```

---

# Data Sovereignty Spec (ops quickstart)

* **Paths:**
  `~/.raeos/vault/embeddings/*.f32`, `memories/*.jsonl.zst`, `sessions/*.md`, `keys/rae.kdf`.
* **Encryption:**

  * Master key derived from passphrase with Argon2id; per-file keys via HKDF.
* **CLI:**

  * `rae export --bundle vault-YYYYMMDD.rae` (encrypted tar)
  * `rae erase --scope embeddings|sessions|all`
  * `rae attest` (prints manifest + hashes for the bundle)

---

# Modular Cognition Interface (TypeScript sketch)

```ts
// events
type Event =
  | { type: "percept.audio"; buffer: ArrayBuffer; ts: number }
  | { type: "intent.user"; text: string; ts: number }
  | { type: "plan.proposed"; steps: Step[]; rationale: string }
  | { type: "memory.write"; item: MemoryItem }
  | { type: "tool.exec"; name: string; args: any; budgetUSD: number };

// plugin manifest
export interface PluginManifest {
  name: string;
  version: string;
  capabilities: ("memory"|"planner"|"voice"|"vision"|"tool")[];
  entry: string; // ESM module
}

// plugin contract
export interface Plugin {
  init(ctx: Ctx): Promise<void>;
  onEvent(e: Event): Promise<void>;
  dispose(): Promise<void>;
}
```

---

# “Principle Tests” (automatable checks)

* **Local-first:** Unit test asserts `DecisionEngine.chooseModel()` returns `local` for tasks where `complexity<=X` and policy allows.
* **Sovereign data:** Creating a session writes only under `~/.raeos/vault/`; test fails if any other path touched.
* **Interpretable personality:** On startup, log the active personality hash; test fails if missing.
* **Transparent autonomy:** Any `tool.exec` without a matching `rationale.md` artifact fails CI.
* **Privacy by design:** Static check forbids `fetch('https://thirdparty-telemetry')` unless `telemetry: on`.

---

# PR Checklist (put in `.github/PULL_REQUEST_TEMPLATE.md`)

* [ ] Uses local model when policy allows; fallback rationale attached
* [ ] Writes only to vault paths; includes migration note if schema changed
* [ ] Updates personality/manifest if behavior changed; hash recorded
* [ ] Adds artifacts for any autonomous action (plan + rationale)
* [ ] No new outbound endpoints unless documented in `NETWORKING.md`

---

# ADR Template (adr/0001-title.md)

* **Context:**
* **Decision:**
* **Status:** Proposed/Accepted/Superseded
* **Consequences:**
* **Pillars Impacted:** (list 1–7)
* **Roll-back plan:**

---

# Minimal File Tree

```
raeos/
├─ MANIFESTO.md
├─ PILLARS.md
├─ personality/
│  ├─ schema.yaml
│  └─ rae.yaml
├─ vault/  # gitignored
├─ sdk/
│  └─ plugins.ts
├─ policies/
│  └─ fallback_policy.yaml
├─ adr/
│  └─ 0001-initial-architecture.md
└─ .github/
   └─ PULL_REQUEST_TEMPLATE.md
```

---

# KPIs (measurable, pillar-aligned)

* Local-first: % tasks completed locally; median local latency; GPU util.
* Sovereignty: time-to-export; successful restore rate.
* Interpretability: % sessions with linked personality hash + rationale.
* Privacy: # of outbound endpoints; % data fields minimized/zeroed.
* Override: mean time to pause/rollback; # successful rollbacks.

---

# 30/60/90 Day Plan

* **0–30:** lock schema, implement vault + export/erase, load personality YAML, local LLM + basic planner, CLI “attest.”
* **31–60:** plugin SDK + event bus, autonomy envelopes (budget/time), rationale artifacts, PR checks.
* **61–90:** multi-persona support, encrypted sharing between devices, lightweight audit viewer UI.
