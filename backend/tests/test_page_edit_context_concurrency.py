from threading import Event, Thread

from fastapi import FastAPI
from fastapi.testclient import TestClient
import pytest

from backend.services.analytics.access import AnalyticsPrincipal
from backend.services.analytics.page_edit_context_routes import PREFIX, page_edit_context_router


@pytest.mark.parametrize("suffix", ["", "/ctx/native", "/ctx/patches", "/ctx/patches/preview/confirm"])
def test_pending_edit_authentication_does_not_block_other_http_requests(suffix):
    entered, release, served = Event(), Event(), Event()
    responses = []

    class Edits:
        def create(self, *args, **kwargs):
            return {"ok": True}

        native_handoff = apply = confirm = create

    def principal(request):
        entered.set()
        assert release.wait(5), "owned authentication wait was not released"
        return AnalyticsPrincipal("page-owner", frozenset(), frozenset())

    app = FastAPI()
    app.include_router(page_edit_context_router(Edits(), principal))

    @app.get("/available")
    def available():
        return {"ok": True}

    with TestClient(app) as client:
        def probe():
            responses.append(client.get("/available"))
            served.set()

        first = Thread(target=lambda: responses.append(client.post(PREFIX + suffix, json={})))
        second = Thread(target=probe)
        first.start()
        try:
            assert entered.wait(2)
            second.start()
            responsive = served.wait(1)
        finally:
            release.set()
            first.join(3)
            if second.ident is not None:
                second.join(3)
        assert not first.is_alive() and not second.is_alive()
        assert responsive, "pending edit authentication blocked unrelated HTTP work"
        assert len(responses) == 2 and all(response.status_code == 200 or response.status_code == 201 for response in responses)
