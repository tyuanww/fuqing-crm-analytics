import argparse
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[2]


def build_app(*, state_dir, callback_origin):
    sys.path.insert(0, str(ROOT))
    from backend.services.analytics.native_page_source import NativePageSource, NATIVE_POLICY
    from backend.services.analytics.page_documents_routes import create_page_app

    source = NativePageSource(callback_origin)
    return create_page_app(page_state_dir=state_dir, authenticate_page=source.authenticate,
                           resolve_binding=source.resolve_binding, native_source=source, policy=NATIVE_POLICY)


if __name__ == "__main__":
    import uvicorn
    parser = argparse.ArgumentParser()
    parser.add_argument("--state-dir", required=True, type=Path)
    parser.add_argument("--callback-origin", required=True)
    parser.add_argument("--port", required=True, type=int)
    args = parser.parse_args()
    if not 1 <= args.port <= 65535 or args.port == 6677:
        parser.error("dedicated loopback port required")
    uvicorn.run(build_app(state_dir=args.state_dir, callback_origin=args.callback_origin),
                host="127.0.0.1", port=args.port, log_level="warning", access_log=False)
