import argparse
from pathlib import Path

import uvicorn

from backend.services.crm_analysis import CrmAnalysisStore
from backend.services.crm_native_snapshot_host import NativeCrmHostClient, create_native_crm_source_app
from backend.services.crm_native_snapshot_source import NativeCrmSnapshotSource


def main():
    parser = argparse.ArgumentParser(description="Run an explicitly configured private native CRM source service.")
    parser.add_argument("--crm-state-dir", type=Path, required=True)
    parser.add_argument("--state-dir", type=Path, required=True)
    parser.add_argument("--data-kind", choices=("real", "synthetic"), required=True)
    parser.add_argument("--host-origin", required=True)
    parser.add_argument("--token-file", type=Path, required=True)
    parser.add_argument("--port", type=int, required=True)
    parser.add_argument("--initialize", action="store_true")
    args = parser.parse_args()
    if (not 1 <= args.port <= 65535 or not args.crm_state_dir.is_absolute()
            or not args.state_dir.is_absolute() or not args.token_file.is_absolute()
            or not (args.crm_state_dir / "crm-analyses.sqlite3").is_file()):
        parser.error("an existing absolute CRM state directory and an explicit valid port are required")
    NativeCrmHostClient(origin=args.host_origin, token_file=args.token_file)
    store = CrmAnalysisStore(args.crm_state_dir, args.data_kind)
    if args.initialize:
        NativeCrmSnapshotSource.create(directory=args.state_dir, store=store)
    app = create_native_crm_source_app(store=store, directory=args.state_dir,
                                     host_origin=args.host_origin, token_file=args.token_file)
    uvicorn.run(app, host="127.0.0.1", port=args.port, access_log=False, server_header=False,
                limit_concurrency=16, timeout_keep_alive=1, h11_max_incomplete_event_size=8192)


if __name__ == "__main__":
    main()
