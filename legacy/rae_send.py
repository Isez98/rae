import sys, json, uuid

USAGE = """Usage:
  rae-send run "<command>"
  rae-send list_dir "<path>"
  rae-send read_file "<path>"
  rae-send write_file "<path>" "<content>"
  rae-send launch_app "<path>"
"""

def write_inbox(action, params):
    payload = {"action": action, "params": params, "nonce": str(uuid.uuid4())}
    with open("rae_inbox.json","w",encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
    print("🖤 Wrote inbox:", payload)

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print(USAGE); sys.exit(1)

    action = sys.argv[1]
    if action == "run":
        write_inbox("run", {"command": sys.argv[2]})
    elif action == "list_dir":
        write_inbox("list_dir", {"path": sys.argv[2]})
    elif action == "read_file":
        write_inbox("read_file", {"path": sys.argv[2]})
    elif action == "write_file":
        if len(sys.argv) < 4:
            print(USAGE); sys.exit(1)
        write_inbox("write_file", {"path": sys.argv[2], "content": sys.argv[3]})
    elif action == "launch_app":
        write_inbox("launch_app", {"path": sys.argv[2]})
    else:
        print(USAGE); sys.exit(1)
