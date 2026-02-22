from flask import Flask, request, jsonify
import threading, json, time, os

app = Flask(__name__)
API_KEY = os.getenv("RAE_INBOX_KEY")
INBOX_FILE = "rae_inbox.json"

@app.route("/enqueue", methods=["POST"])
def enqueue():
    if request.headers.get("X-API-Key") != API_KEY:
        return jsonify({"error":"Unauthorized"}), 401
    data = request.get_json(force=True, silent=True) or {}
    if "action" not in data or "params" not in data:
        return jsonify({"error":"Need 'action' and 'params'"}), 400
    # Add a nonce if missing
    data.setdefault("nonce", str(time.time()))
    with open(INBOX_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    return jsonify({"status":"queued","nonce":data["nonce"]})

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5050)
