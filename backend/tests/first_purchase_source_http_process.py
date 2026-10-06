"""Owned integration child. Receives only saved-state directory and query URL."""
import json
import os
from pathlib import Path
import sys
from urllib.parse import unquote, urlsplit


def main():
    config = json.loads(sys.stdin.readline())
    state = Path(config["state"]).resolve(strict=True)
    opened = set()

    def local_state_only(event, args):
        if event == "sqlite3.connect":
            raw = str(args[0])
            uri = urlsplit(raw)
            path = Path(unquote(uri.path) if uri.scheme == "file" and not uri.netloc else raw).resolve()
            if path != state / "first_purchase_analyses.sqlite3":
                raise RuntimeError("SAVE_PROCESS_QUERY_DB_FORBIDDEN")
            opened.add(path.name)

    sys.addaudithook(local_state_only)
    from backend.analytics_first_purchase_analysis_app import create_first_purchase_analysis_app
    from backend.services.analytics.first_purchase.saved import FirstPurchaseSavedAnalysisStore
    from backend.services.analytics.first_purchase.save_policy import FirstPurchaseSavePolicy
    from backend.services.analytics.first_purchase.source_http import HTTPFirstPurchaseSourceResolver
    from backend.tests.test_analytics_first_purchase_analysis import make_registry
    from backend.tests.test_analytics_first_purchase_save_ui import serve
    policy = FirstPurchaseSavePolicy("process-no-age-v1", frozenset({config["candidate"]}), None, None,
                                     check_freshness=False)
    app = create_first_purchase_analysis_app(analysis_store=FirstPurchaseSavedAnalysisStore(state),
        identities=make_registry(), source_resolver=HTTPFirstPurchaseSourceResolver(config["origin"]),
        save_policy=lambda: policy)
    with serve(app) as origin:
        print(json.dumps({"origin": origin, "pid": os.getpid()}), flush=True)
        sys.stdin.read()
    print(json.dumps({"stopped": True, "sqlite_files": sorted(opened)}), flush=True)


if __name__ == "__main__":
    main()
