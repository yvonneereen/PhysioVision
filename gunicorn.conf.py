"""Production worker limits shared by Render and local Gunicorn launches."""

# A Gemini plan normally completes well below this limit, but the default
# 30-second Gunicorn timeout was killing valid in-flight planner requests.
timeout = 120

# Render's free instance has limited memory. One threaded worker keeps memory
# predictable while allowing health checks and ordinary API requests to run
# during a synchronous Gemini call.
workers = 1
threads = 4
worker_class = "gthread"
