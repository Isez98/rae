import sys
import requests
import json

API_URL = "http://localhost:5000/run"

def run_command(command):
    payload = {'command': command}
    response = requests.post(API_URL, json=payload)
    if response.status_code == 200:
        data = response.json()
        stdout = data.get('stdout', '')
        stderr = data.get('stderr', '')
        returncode = data.get('returncode', "")
        print(f"\n🖤 Rae Bridge executed: {command}")
        print("—" * 40)
        if stdout:
            print("Output:")
            print(stdout)
        if stderr:
            print("Errors:")
            print(stderr)
        print(f"Return code: {returncode}")
    else:
        print("Error:", response.status_code, response.text)

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python rae_client.py \"<command>\"")
        sys.exit(1)
    command = sys.argv[1]
    run_command(command)