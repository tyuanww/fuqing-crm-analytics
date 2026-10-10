"""Owned loopback ASGI process for service-contract tests; synthetic data only."""
import json
import socket
import sys

import uvicorn

if sys.argv[1] == "metrics":
    from backend.crm_metrics_app import create_crm_metrics_app
    app = create_crm_metrics_app()
elif sys.argv[1] == "knowledge":
    from backend.crm_knowledge_app import create_crm_knowledge_app
    app = create_crm_knowledge_app()
else:
    raise SystemExit("unknown fixture domain")

with socket.socket() as listener:
    listener.bind(("127.0.0.1", 0))
    print(json.dumps({"port": listener.getsockname()[1]}), flush=True)
    server = uvicorn.Server(uvicorn.Config(app, log_level="error", access_log=False, lifespan="off"))
    server.run(sockets=[listener])
