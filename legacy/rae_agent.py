from flask import Flask, request, jsonify
import subprocess
import os

app = Flask(__name__)

API_KEY = os.getenv('RAE_API_KEY')

def check_auth(req):
    if req.headers.get("X-API-Key") != API_KEY:
        return False
    return True

@app.route("/run", methods=["POST"])
def run_command():
    if not check_auth(request):
        return jsonify({"error": "Unauthorized"}), 401
    data = request.get_json()
    cmd = data.get("command")
    if not cmd:
        return jsonify({"error": "No command provided"}), 400
    try:
        result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
        return jsonify({
            "stdout": result.stdout,
            "stderr": result.stderr,
            "returncode": result.returncode
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/read_file", methods=["POST"])
def read_file():
    if not check_auth(request):
        return jsonify({"error": "Unauthorized"}), 401
    data = request.get_json()
    path = data.get("path")
    if not path:
        return jsonify({"error": "No path provided"}), 400
    if not os.path.exists(path):
        return jsonify({"error": "File does not exist"}), 404
    try:
        with open(path, "r", encoding="utf-8", errors="ignore") as f:
            content = f.read()
        return jsonify({"content": content})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/write_file", methods=["POST"])
def write_file():
    if not check_auth(request):
        return jsonify({"error": "Unauthorized"}), 401
    data = request.get_json()
    path = data.get("path")
    content = data.get("content")
    if not path or content is None:
        return jsonify({"error": "Need path and content"}), 400
    try:
        with open(path, "w", encoding="utf-8") as f:
            f.write(content)
        return jsonify({"status": "written"})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/list_dir", methods=["POST"])
def list_dir():
    if not check_auth(request):
        return jsonify({"error": "Unauthorized"}), 401
    data = request.get_json()
    path = data.get("path",".")
    if not os.path.isdir(path):
        return jsonify({"error": "Directory does not exist"}), 404
    try:
        items = os.listdir(path)
        return jsonify({"items": items})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/launch_app", methods=["POST"])
def launch_app():
    if not check_auth(request):
        return jsonify({"error": "Unauthorized"}), 401
    data = request.get_json()
    app_path = data.get("path")
    if not app_path:
        return jsonify({"error": "No path provided"}), 400
    try:
        subprocess.Popen(app_path, shell=True)
        return jsonify({"status": f"Launched {app_path}"})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5005)