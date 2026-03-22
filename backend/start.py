import os
import sys
import uvicorn

port_str = os.environ.get("PORT", "8000")
print(f"PORT env var value: '{port_str}'", flush=True)
print(f"All env vars: {dict(os.environ)}", flush=True)

try:
    port = int(port_str)
except ValueError as e:
    print(f"Failed to parse PORT: {e}", flush=True)
    port = 8000

print(f"Starting on port {port}", flush=True)
uvicorn.run("app.main:app", host="0.0.0.0", port=port)
