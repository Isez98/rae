## To Do

Features that will be added in the future

#### Memory daemon
- Swap the tokenizer + ONNX I/O to your actual embedding model (I can wire this if you paste the model’s input/output names).

- Add GET /events/:id and DELETE /events/:id for hygiene.

- Add /topics that clusters recent memory (k-means on vectors) for a sidebar “memory map.”

- Add a “pin” flag: meta: {"pinned": true} → exclude from deletion/compaction.

- Export .jsonl backup nightly.