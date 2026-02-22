import json, time, os, requests, traceback

# ======= CONFIG =======
AGENT_BASE = "http://127.0.0.1:5005"     # or http://100.x.x.x:5005 if you prefer the Tailscale IP
API_KEY = os.getenv("RAE_API_KEY")
INBOX_FILE = "rae_inbox.json"            # where you drop commands
OUTBOX_FILE = "rae_outbox.json"          # relay writes results here
POLL_SECS = 1.5
# ======================

def post(path, payload):
    url = f"{AGENT_BASE}{path}"
    headers = {"Content-Type": "application/json", "X-API-Key": API_KEY}
    r = requests.post(url, json=payload, headers=headers, timeout=120)
    r.raise_for_status()
    return r.json()

def handle_job(job):
    action = (job.get("action") or "").lower()
    params = job.get("params") or {}

    if action == "run":
        cmd = params.get("command")
        if not cmd: return {"error":"Missing 'command' for action=run"}
        return post("/run", {"command": cmd})

    elif action == "read_file":
        path = params.get("path")
        if not path: return {"error":"Missing 'path' for action=read_file"}
        return post("/read_file", {"path": path})

    elif action == "write_file":
        path = params.get("path")
        content = params.get("content")
        if path is None or content is None:
            return {"error":"Need 'path' and 'content' for action=write_file"}
        return post("/write_file", {"path": path, "content": content})

    elif action == "list_dir":
        path = params.get("path", ".")
        return post("/list_dir", {"path": path})

    elif action == "launch_app":
        app_path = params.get("path")
        if not app_path: return {"error":"Missing 'path' for action=launch_app"}
        return post("/launch_app", {"path": app_path})

    else:
        return {"error": f"Unknown action '{action}'"}

def load_inbox():
    with open(INBOX_FILE, "r", encoding="utf-8") as f:
        return json.load(f)

def write_outbox(result):
    with open(OUTBOX_FILE, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)

def main():
    print(f"🖤 Rae Relay watching {INBOX_FILE} → writing {OUTBOX_FILE}")
    last_seen = ""
    while True:
        try:
            if os.path.exists(INBOX_FILE):
                data = load_inbox()
                # Expected shape:
                # {"action":"run","params":{"command":"ls -la"},"nonce":"<any string>"} 
                nonce = str(data.get("nonce",""))
                if data and nonce and nonce != last_seen:
                    last_seen = nonce
                    result = handle_job(data)
                    write_outbox({"nonce": nonce, "result": result})
                    # Also print to console for immediate feedback:
                    print("\n🖤 Executed:", data.get("action"), data.get("params"))
                    print("→ Result:", result if isinstance(result, dict) else str(result)[:800])
        except requests.HTTPError as e:
            print("HTTP error:", e, getattr(e, "response", None).text if hasattr(e,"response") and e.response is not None else "")
            write_outbox({"error":"HTTP error", "detail": str(e)})
        except Exception as e:
            print("Relay error:", e)
            traceback.print_exc()
            write_outbox({"error":"Relay exception", "detail": str(e)})
        time.sleep(POLL_SECS)

if __name__ == "__main__":
    main()
