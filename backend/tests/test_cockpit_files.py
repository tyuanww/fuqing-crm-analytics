"""File persistence and signed Office boundaries, exclusively on isolated small fixtures."""
import io
import time
import zipfile

import pytest
from fastapi.testclient import TestClient

from backend.services.analytics.access import AnalyticsError, AnalyticsPrincipal, B0IdentityRegistry
from backend.services.analytics.cockpit_files import CockpitFileStore, OfficeSettings, sign_token, verify_token, validate_file
from backend.services.analytics.page_documents_routes import create_page_app


@pytest.fixture
def actor():
    return AnalyticsPrincipal("cabinet-alice", frozenset({"dashboard:read", "dashboard:update"}), frozenset())


@pytest.fixture
def store(tmp_path):
    return CockpitFileStore(tmp_path)


def office_bytes(ext):
    stream = io.BytesIO()
    with zipfile.ZipFile(stream, "w") as package:
        package.writestr("word/document.xml" if ext == "docx" else "xl/workbook.xml", "<document/>")
    return stream.getvalue()


@pytest.mark.parametrize("name,content", [("report.html", b"<h1>Report</h1>"), ("rows.csv", b"name,value\nx,2"),
                                        ("report.pdf", b"%PDF-1.7\n"), ("report.docx", office_bytes("docx")),
                                        ("report.xlsx", office_bytes("xlsx"))])
def test_upload_reopens_from_new_connection_and_store(store, actor, name, content):
    first = store.upload(actor, name, content, "upload-request-01")
    reopened = CockpitFileStore(store.path.parent)
    assert reopened.content(actor, first["file_id"]) == (name, content)
    assert reopened.list(actor)["items"][0]["version"] == 1
    assert reopened.upload(actor, name, content, "upload-request-01") == first
    with pytest.raises(AnalyticsError) as error:
        reopened.upload(actor, name, content + b" ", "upload-request-01")
    assert error.value.code == "UPLOAD_CONFLICT"


def test_owner_boundary(store, actor):
    saved = store.upload(actor, "a.csv", b"x,1", "request-1")
    other = AnalyticsPrincipal("bob", actor.capabilities, actor.data_scopes)
    assert store.list(other)["items"] == []
    with pytest.raises(AnalyticsError) as error:
        store.content(other, saved["file_id"])
    assert error.value.status == 404


def test_office_drafts_are_not_saved_heads_and_cancel_preserves_original(store, actor):
    saved = store.upload(actor, "a.csv", b"x,1", "request-1")
    edit = store.begin_edit(actor, saved["file_id"])
    store.stage_office(actor, edit["key"], "a.csv", b"x,2")
    assert store.content(actor, saved["file_id"])[1] == b"x,1"
    store.cancel_edit(actor, edit["key"])
    assert store.commit_office(actor, edit["key"], "a.csv", b"x,3") == {"discarded": True}
    assert store.content(actor, saved["file_id"])[1] == b"x,1"


def test_confirmed_save_keeps_versions_and_rejects_stale_editor(store, actor):
    saved = store.upload(actor, "a.csv", b"x,1", "request-1")
    edit = store.begin_edit(actor, saved["file_id"])
    old = store.begin_edit(actor, saved["file_id"])
    store.save_receipt(actor, edit["key"], "save-request-1", create=True)
    receipt = store.commit_office(actor, edit["key"], "a.csv", b"x,2", "save-request-1")
    assert receipt["version"] == 2
    assert CockpitFileStore(store.path.parent).content(actor, saved["file_id"])[1] == b"x,2"
    assert store.content(actor, saved["file_id"], 1)[1] == b"x,1"
    assert store.save_receipt(actor, edit["key"], "save-request-1")["status"] == "SAVED"
    assert store.commit_office(actor, edit["key"], "a.csv", b"x,2", "save-request-1")["version"] == 2
    with pytest.raises(AnalyticsError) as error:
        store.commit_office(actor, old["key"], "a.csv", b"x,3")
    assert error.value.code == "FILE_CONFLICT"


@pytest.mark.parametrize("filename,data", [("../a.csv", b"a"), ("bad.pdf", b"html"),
                                          ("bad.docx", b"zip"), ("empty.csv", b""),
                                          ("bad.csv", b"\xff"), ("code.exe", b"MZ")])
def test_rejects_unsupported_or_mislabeled_file(filename, data):
    with pytest.raises(AnalyticsError):
        validate_file(filename, data)


@pytest.mark.parametrize('ext', ['docx', 'xlsx'])
def test_corrupt_office_entry_is_rejected_before_upload(store, actor, ext):
    data = office_bytes(ext).replace(b'<document/>', b'<broken!!/>')
    with pytest.raises(AnalyticsError) as error:
        store.upload(actor, 'broken.' + ext, data, 'corrupted-archive')
    assert error.value.code == 'INVALID_OFFICE_FILE'
    assert store.list(actor)['items'] == []


def test_signed_forcesave_failure_is_terminal_and_does_not_lock_the_editor(tmp_path, actor):
    from urllib.parse import urlsplit
    registry = B0IdentityRegistry()
    token = 'synthetic-failure-token-' * 3
    registry.grant(token, actor)
    settings = OfficeSettings('http://127.0.0.1:18110', 'http://host.docker.internal:19091', 'private-' * 8)
    app = create_page_app(registry, page_state_dir=tmp_path, office=settings, office_principal=lambda: actor)
    files = CockpitFileStore(tmp_path / 'files')
    item = files.upload(actor, 'a.csv', b'x,1', 'failed-callback-upload')
    edit = files.begin_edit(actor, item['file_id'])
    callback = urlsplit(settings.config(actor, edit)['config']['editorConfig']['callbackUrl'])
    path = callback.path + '?' + callback.query
    files.save_receipt(actor, edit['key'], 'failed-request', create=True)
    body = {'key': edit['key'], 'status': 7, 'userdata': 'failed-request'}
    with TestClient(app) as client:
        signed = {**body, 'token': sign_token(body, settings.secret)}
        assert client.post(path, json={**signed, 'userdata': 'other-request'}).status_code == 401
        assert client.post(path, json=signed).json() == {'error': 0}
        reopened = CockpitFileStore(files.path.parent)
        assert reopened.save_receipt(actor, edit['key'], 'failed-request')['status'] == 'FAILED'
        # A delayed duplicate callback cannot silently resurrect a terminal receipt.
        assert reopened.commit_office(actor, edit['key'], 'a.csv', b'x,2', 'failed-request') == {'failed': True}
        assert reopened.content(actor, item['file_id'])[1] == b'x,1'
        reopened.save_receipt(actor, edit['key'], 'retry-request', create=True)
        reopened.commit_office(actor, edit['key'], 'a.csv', b'x,2', 'retry-request')
        retry = {**body, 'userdata': 'retry-request'}
        assert client.post(path, json={**retry, 'token': sign_token(retry, settings.secret)}).json() == {'error': 0}
        assert reopened.save_receipt(actor, edit['key'], 'retry-request')['status'] == 'SAVED'
        assert reopened.get(actor, item['file_id'])['version'] == 2


def test_jwt_rejects_tamper_expiry_and_wrong_secret():
    secret = "test-secret-" * 4
    token = sign_token({"key": "known", "exp": time.time() + 60}, secret)
    assert verify_token(token, secret)["key"] == "known"
    for candidate, key in [(token + "x", secret), (token, "wrong-secret"), (sign_token({"exp": 1}, secret), secret)]:
        with pytest.raises(AnalyticsError):
            verify_token(candidate, key)


def test_http_auth_and_unconfigured_editor(tmp_path, actor):
    registry = B0IdentityRegistry()
    token = "isolated-cabinet-token-" * 3
    registry.grant(token, actor)
    app = create_page_app(registry, page_state_dir=tmp_path)
    with TestClient(app) as client:
        prefix = "/api/v1/analytics/cockpit-files"
        assert client.get(prefix).status_code == 401
        headers = {"authorization": "Bearer " + token, "idempotency-key": "upload-request-1"}
        response = client.post(prefix + "?filename=a.csv", content=b"x,1", headers=headers)
        assert response.status_code == 201
        file_id = response.json()["file_id"]
        assert client.get(prefix + "/" + file_id + "/content", headers=headers).content == b"x,1"
        assert client.post(prefix + "/" + file_id + "/edit", headers=headers).status_code == 503


def test_office_config_has_scoped_tickets_not_caller_bearer(store, actor):
    saved = store.upload(actor, "a.csv", b"x,1", "request-1")
    edit = store.begin_edit(actor, saved["file_id"])
    settings = OfficeSettings("http://127.0.0.1:18110", "http://host.docker.internal:19091", "private-" * 8)
    config = settings.config(actor, edit)
    signed = verify_token(config["config"]["token"], settings.secret)
    assert signed["document"]["key"] == edit["key"]
    assert signed["documentType"] == "cell"


def test_receipt_replay_never_rewrites_a_saved_version(store, actor):
    item = store.upload(actor, "a.csv", b"x,1", "request-1")
    edit = store.begin_edit(actor, item["file_id"])
    for number in (2, 3):
        receipt = f"save-request-{number}"
        store.save_receipt(actor, edit["key"], receipt, create=True)
        store.commit_office(actor, edit["key"], "a.csv", f"x,{number}".encode(), receipt)
    assert store.commit_office(actor, edit["key"], "a.csv", b"x,2", "save-request-2") == {"version": 2}
    with pytest.raises(AnalyticsError) as error:
        store.commit_office(actor, edit["key"], "a.csv", b"x,4", "save-request-2")
    assert error.value.code == "RECEIPT_CONFLICT"
    assert store.get(actor, item["file_id"])["version"] == 3
    assert store.content(actor, item["file_id"])[1] == b"x,3"


def test_stale_editor_produces_a_durable_conflict_receipt(store, actor):
    item = store.upload(actor, 'a.csv', b'x,1', 'conflict-upload')
    first = store.begin_edit(actor, item['file_id'])
    stale = store.begin_edit(actor, item['file_id'])
    store.commit_office(actor, first['key'], 'a.csv', b'x,2')
    store.save_receipt(actor, stale['key'], 'stale-save', create=True)
    assert store.commit_office(actor, stale['key'], 'a.csv', b'x,3', 'stale-save') == {'conflict': True}
    reopened = CockpitFileStore(store.path.parent)
    assert reopened.save_receipt(actor, stale['key'], 'stale-save')['status'] == 'CONFLICT'
    assert reopened.content(actor, item['file_id'])[1] == b'x,2'
    reopened.cancel_edit(actor, stale['key'])



def test_callback_requires_signed_payload_scoped_ticket_and_trusted_download(tmp_path, actor):
    from urllib.parse import urlsplit
    registry = B0IdentityRegistry()
    token = "isolated-cabinet-token-" * 3
    registry.grant(token, actor)
    settings = OfficeSettings("http://127.0.0.1:18110", "http://host.docker.internal:19091", "private-" * 8)
    app = create_page_app(registry, page_state_dir=tmp_path, office=settings, office_principal=lambda: registry.resolve("Bearer " + token))
    prefix = "/api/v1/analytics/cockpit-files"
    headers = {"authorization": "Bearer " + token, "idempotency-key": "upload-request-1"}
    with TestClient(app) as client:
        item = client.post(prefix + "?filename=a.csv", content=b"x,1", headers=headers).json()
        editor = client.post(prefix + "/" + item["file_id"] + "/edit", headers=headers).json()
        config = editor["config"]
        callback = urlsplit(config["editorConfig"]["callbackUrl"])
        callback_path = callback.path + "?" + callback.query
        body = {"key": editor["edit_key"], "status": 1}
        signed = {**body, "token": sign_token(body, settings.secret)}
        assert client.post(callback_path, json=signed).json() == {"error": 0}
        assert client.post(callback_path, json={**signed, "status": 6}).status_code == 401
        assert client.post(callback_path, json=[]).status_code == 422
        assert client.post(callback_path, content="not-json").status_code == 422
        assert client.post(prefix + "/edits/" + editor["edit_key"] + "/save", json=[], headers=headers).status_code == 422
        for url in ("http://127.0.0.1:19091/private", "http://127.0.0.1:18110/not-cache", "http://example.com/cache/file"):
            body = {"key": editor["edit_key"], "status": 6, "url": url}
            assert client.post(callback_path, json={**body, "token": sign_token(body, settings.secret)}).status_code == 422
        # A read ticket cannot be replayed as a callback capability.
        read = urlsplit(config["document"]["url"])
        assert client.post(callback.path + "?" + read.query, json=signed).status_code == 401
        client.post(prefix + "/edits/" + editor["edit_key"] + "/cancel", headers=headers)
        assert client.post(callback_path, json=signed).status_code == 409


def test_page_service_loads_only_private_office_config(tmp_path, monkeypatch):
    import importlib.util
    import json
    from pathlib import Path
    path = Path(__file__).resolve().parents[2] / "scripts/dsh-dev/page_http_server.py"
    spec = importlib.util.spec_from_file_location("cockpit_page_http_test", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    config = tmp_path / "office.json"
    config.write_text(json.dumps({"base": "http://127.0.0.1:18110", "callback_base": "http://host.docker.internal:19091", "secret": "synthetic-" * 5}))
    config.chmod(0o600)
    monkeypatch.setenv("COCKPIT_OFFICE_CONFIG", str(config))
    token = "isolated-page-token-" * 3
    (tmp_path / "state").mkdir(mode=0o700)
    with TestClient(module.build_app(state_dir=tmp_path / "state", token=token)) as client:
        result = client.get("/api/v1/analytics/cockpit-files/status", headers={"authorization": "Bearer " + token})
        assert result.json()["office_configured"] is True
    config.chmod(0o644)
    with pytest.raises(ValueError, match="private"):
        module.build_app(state_dir=tmp_path / "rejected", token=token)


def test_forcesave_retry_cannot_acknowledge_an_old_autosave_draft(tmp_path, actor, monkeypatch):
    """A lost command response followed by error 4 is not the latest callback."""
    import httpx
    from backend.services.analytics import cockpit_files_routes
    registry = B0IdentityRegistry()
    token = 'isolated-save-token-' * 3
    registry.grant(token, actor)
    settings = OfficeSettings('http://127.0.0.1:18110', 'http://host.docker.internal:19091', 'private-' * 8)
    app = create_page_app(registry, page_state_dir=tmp_path, office=settings, office_principal=lambda: actor)
    store = CockpitFileStore(tmp_path / 'files')
    item = store.upload(actor, 'a.csv', b'x,1', 'old-draft-test')
    edit = store.begin_edit(actor, item['file_id'])
    store.stage_office(actor, edit['key'], 'a.csv', b'x,2')
    store.save_receipt(actor, edit['key'], 'old-save', create=True)
    store.commit_office(actor, edit['key'], 'a.csv', b'x,2', 'old-save')
    results = iter([0, 4])

    class Commands:
        def __init__(self, **_kwargs): pass
        async def __aenter__(self): return self
        async def __aexit__(self, *_args): pass
        async def post(self, *_args, **_kwargs):
            return httpx.Response(200, json={'error': next(results), 'key': edit['key']})

    monkeypatch.setattr(cockpit_files_routes.httpx, 'AsyncClient', Commands)
    with TestClient(app) as client:
        path = '/api/v1/analytics/cockpit-files/edits/' + edit['key'] + '/save'
        for _ in range(2):
            result = client.post(path, json={'receipt_id': 'new-save'}, headers={'authorization': 'Bearer ' + token})
            assert result.status_code == 200
            assert result.json()['status'] == 'WAITING'
        store.stage_office(actor, edit['key'], 'a.csv', b'x,3')
        store.commit_office(actor, edit['key'], 'a.csv', b'x,3', 'new-save')
        assert store.save_receipt(actor, edit['key'], 'new-save')['version'] == 3
        assert store.content(actor, item['file_id'])[1] == b'x,3'


def test_cabinet_preferences_are_durable_private_and_reversible(store, actor):
    saved = store.upload(actor, 'keep.html', b'<h1>Keep</h1>', 'pref-upload-key')
    identity = 'cabinet:' + saved['file_id']
    assert store.preferences(actor)['removed'] == []
    store.preferences(actor, {'remove': identity})
    store.preferences(actor, {'order': ['page:one', identity]})
    store.preferences(actor, {'rail_width': 320})
    reopened = CockpitFileStore(store.path.parent)
    assert reopened.preferences(actor) == {'removed': [identity], 'order': ['page:one', identity], 'rail_width': 320, 'rail_layout': None}
    assert reopened.content(actor, saved['file_id'])[1] == b'<h1>Keep</h1>'
    other = AnalyticsPrincipal('bob', actor.capabilities, actor.data_scopes)
    assert reopened.preferences(other)['removed'] == []
    reopened.preferences(actor, {'restore': identity})
    assert store.preferences(actor)['removed'] == []
    placement = {'x': 500, 'y': 100, 'width': 320, 'height': 540}
    store.preferences(actor, {'rail_layout': placement})
    assert reopened.preferences(actor)['rail_layout'] == placement
    store.preferences(actor, {'rail_layout': None})
    assert reopened.preferences(actor)['rail_layout'] is None
    reader = AnalyticsPrincipal(actor.actor_id, frozenset({'dashboard:read'}), frozenset())
    with pytest.raises(AnalyticsError):
        store.preferences(reader, {'remove': identity})
    for change in [{'rail_width': True}, {'rail_width': 900}, {'order': ['page:a', 'page:a']}, {'remove': 'bad'}, {'other': 1}]:
        with pytest.raises(AnalyticsError):
            store.preferences(actor, change)


def test_preference_boundaries_reject_invalid_changes_without_overwriting_saved_values(store, actor):
    placement = {'x': 20000, 'y': 20000, 'width': 480, 'height': 1000}
    store.preferences(actor, {'rail_layout': placement})
    baseline = store.preferences(actor)
    invalid = [{}, {'remove': 'page:a', 'rail_width': 300}, {'remove': 'page:a\n'},
               {'restore': 'file:' + 'a' * 4608}, {'order': ['page:a'] * 5001},
               {'rail_width': 179}, {'rail_width': 481}, {'rail_width': 248.0},
               {'rail_layout': {**placement, 'x': 20001}}, {'rail_layout': {**placement, 'y': -1}},
               {'rail_layout': {**placement, 'x': True}}, {'rail_layout': {**placement, 'width': 179}},
               {'rail_layout': {**placement, 'height': 239}}, {'rail_layout': {**placement, 'height': 1001}},
               {'rail_layout': {**placement, 'extra': 0}}, {'rail_layout': {'x': 0}}, {'rail_layout': []}]
    for change in invalid:
        with pytest.raises(AnalyticsError) as error:
            store.preferences(actor, change)
        assert error.value.code == 'INVALID_PREFERENCE'
        assert CockpitFileStore(store.path.parent).preferences(actor) == baseline
    for width in (180, 480):
        assert store.preferences(actor, {'rail_width': width})['rail_width'] == width
    minimum = {'x': 0, 'y': 0, 'width': 180, 'height': 240}
    assert store.preferences(actor, {'rail_layout': minimum})['rail_layout'] == minimum


def test_preference_recycle_limit_allows_idempotent_removal_and_recovers_after_restore(store, actor):
    import json
    removed = [f'page:item-{index}' for index in range(5000)]
    baseline = {'removed': removed, 'order': [], 'rail_width': 248, 'rail_layout': None}
    with store.connect() as con:
        con.execute('INSERT INTO cockpit_preferences VALUES(?,?)', (actor.actor_id, json.dumps(baseline)))
    assert len(store.preferences(actor, {'remove': removed[-1]})['removed']) == 5000
    with pytest.raises(AnalyticsError) as error:
        store.preferences(actor, {'remove': 'page:overflow'})
    assert error.value.code == 'PREFERENCE_LIMIT'
    assert CockpitFileStore(store.path.parent).preferences(actor) == baseline
    store.preferences(actor, {'restore': removed[0]})
    saved = store.preferences(actor, {'remove': 'page:overflow'})
    assert len(saved['removed']) == 5000
    assert removed[0] not in saved['removed']
    assert saved['removed'][-1] == 'page:overflow'


def test_preference_http_routes_enforce_identity_permissions_and_object_contract(tmp_path, actor):
    registry = B0IdentityRegistry()
    writer_token, reader_token, other_token, denied_token = (f'isolated-preference-{role}-' * 3 for role in ('writer', 'reader', 'other', 'denied'))
    registry.grant(writer_token, actor)
    registry.grant(reader_token, AnalyticsPrincipal(actor.actor_id, frozenset({'dashboard:read'}), frozenset()))
    registry.grant(other_token, AnalyticsPrincipal('other-owner', actor.capabilities, actor.data_scopes))
    registry.grant(denied_token, AnalyticsPrincipal('denied-owner', frozenset(), frozenset()))
    app = create_page_app(registry, page_state_dir=tmp_path)
    prefix = '/api/v1/analytics/cockpit-files/preferences'
    headers = {'authorization': 'Bearer ' + writer_token}
    with TestClient(app) as client:
        assert client.get(prefix).status_code == 401
        assert client.patch(prefix, json={'remove': 'page:a'}).status_code == 401
        assert client.get(prefix, headers={'authorization': 'Bearer ' + denied_token}).status_code == 403
        assert client.patch(prefix, json={'remove': 'page:a'}, headers={'authorization': 'Bearer ' + reader_token}).status_code == 403
        assert client.patch(prefix, json={'remove': 'page:a'}, headers=headers).status_code == 200
        assert client.get(prefix, headers={'authorization': 'Bearer ' + reader_token}).json()['removed'] == ['page:a']
        assert client.get(prefix, headers={'authorization': 'Bearer ' + other_token}).json()['removed'] == []
        for body in ([], None, {}, {'remove': 'page:b', 'rail_width': 300}, {'rail_width': False}):
            assert client.patch(prefix, json=body, headers=headers).status_code == 422
        assert client.patch(prefix, content='not-json', headers={**headers, 'content-type': 'application/json'}).status_code == 422
        assert client.get(prefix, headers=headers).json()['removed'] == ['page:a']
        assert client.patch(prefix, json={'restore': 'page:a'}, headers=headers).json()['removed'] == []
