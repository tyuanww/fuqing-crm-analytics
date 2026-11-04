"""Second-entry CSV/XLSX backend tests.

Covers upload/ingest, metadata, preview, read-only SQL validation, row limits,
dataset isolation and the global Bearer-auth requirement.
"""

from __future__ import annotations

import io
import json
import re
import uuid
from pathlib import Path

import pandas as pd
import pytest
from fastapi.testclient import TestClient

from backend.services.second_entry import ingest as ingest_service
from backend.services.second_entry.errors import SecondEntryError
from backend.services.second_entry.store import DatasetStore

SAMPLE_CSV = b"name,amount\nA,10\nB,20\n"
SAMPLE_ID_RE = re.compile(r"^[0-9a-f]{32}$")


@pytest.fixture(autouse=True)
def _disable_rate_limit_for_this_module(monkeypatch):
    monkeypatch.setenv("RATE_LIMIT_PER_MINUTE", "100000")


@pytest.fixture(autouse=True)
def data_dir(tmp_path, monkeypatch):
    root = tmp_path / "second-entry"
    monkeypatch.setenv("SECOND_ENTRY_DATA_DIR", str(root))
    return root


@pytest.fixture
def client():
    from backend.main import app

    return TestClient(app)


@pytest.fixture
def auth_headers(client):
    response = client.post(
        "/api/v1/auth/login",
        json={"username": "testuser", "password": "testpass123"},
    )
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['token']}"}


def _upload(client, headers, filename: str, content: bytes):
    return client.post(
        "/api/second-entry/datasets",
        headers=headers,
        files={"file": (filename, content, "application/octet-stream")},
    )


def _error_code(response) -> str:
    body = response.json()
    assert "detail" in body, body
    return body["detail"]["error"]


def _xlsx_bytes(rows: list[dict]) -> bytes:
    buffer = io.BytesIO()
    pd.DataFrame(rows).to_excel(buffer, index=False, engine="openpyxl")
    return buffer.getvalue()


# ─────────────────────────────────────────────────────────────
# Upload / metadata
# ─────────────────────────────────────────────────────────────

def test_upload_csv_returns_meta_columns_and_manifest(client, auth_headers, data_dir):
    response = _upload(client, auth_headers, "sales.csv", SAMPLE_CSV)
    assert response.status_code == 200, response.text
    meta = response.json()

    assert SAMPLE_ID_RE.fullmatch(meta["id"])
    assert meta["filename"] == "sales.csv"
    assert meta["row_count"] == 2
    assert meta["byte_size"] == len(SAMPLE_CSV)
    assert meta["columns"] == [
        {"name": "name", "dtype": "VARCHAR"},
        {"name": "amount", "dtype": "BIGINT"},
    ]
    assert Path(meta["path"]).is_file()
    assert Path(meta["path"]).parent == data_dir.resolve()

    manifest = json.loads((data_dir / "manifest.json").read_text(encoding="utf-8"))
    assert meta["id"] in manifest["datasets"]

    listed = client.get("/api/second-entry/datasets", headers=auth_headers)
    assert listed.status_code == 200
    assert [item["id"] for item in listed.json()] == [meta["id"]]


def test_upload_xlsx_returns_meta_and_queryable_data(client, auth_headers):
    content = _xlsx_bytes(
        [
            {"product": "alpha", "qty": 3},
            {"product": "beta", "qty": 5},
        ]
    )
    response = _upload(client, auth_headers, "orders.xlsx", content)
    assert response.status_code == 200, response.text
    meta = response.json()

    assert meta["row_count"] == 2
    assert meta["columns"] == [
        {"name": "product", "dtype": "VARCHAR"},
        {"name": "qty", "dtype": "BIGINT"},
    ]

    queried = client.post(
        "/api/second-entry/query",
        headers=auth_headers,
        json={"dataset_id": meta["id"], "sql": "SELECT product, qty FROM data ORDER BY qty"},
    )
    assert queried.status_code == 200, queried.text
    assert queried.json()["rows"] == [["alpha", 3], ["beta", 5]]


def test_detail_returns_metadata_and_ten_row_preview(client, auth_headers):
    rows = ["n"] + [str(index) for index in range(25)]
    response = _upload(
        client,
        auth_headers,
        "many.csv",
        ("\n".join(rows) + "\n").encode(),
    )
    assert response.status_code == 200, response.text
    dataset_id = response.json()["id"]

    detail = client.get(f"/api/second-entry/datasets/{dataset_id}", headers=auth_headers)
    assert detail.status_code == 200, detail.text
    body = detail.json()
    assert body["id"] == dataset_id
    assert body["row_count"] == 25
    assert body["preview"]["columns"] == ["n"]
    assert len(body["preview"]["rows"]) == 10
    assert body["preview"]["truncated"] is True

    missing = client.get(f"/api/second-entry/datasets/{uuid.uuid4().hex}", headers=auth_headers)
    assert missing.status_code == 404
    assert _error_code(missing) == "DATASET_NOT_FOUND"


def test_empty_and_bad_files_are_rejected(client, auth_headers):
    empty = _upload(client, auth_headers, "empty.csv", b"")
    assert empty.status_code == 422
    assert _error_code(empty) == "EMPTY_FILE"

    header_only = _upload(client, auth_headers, "header-only.csv", b"name,amount\n")
    assert header_only.status_code == 422
    assert _error_code(header_only) == "EMPTY_DATASET"

    bad_xlsx = _upload(client, auth_headers, "broken.xlsx", b"not an xlsx workbook")
    assert bad_xlsx.status_code == 422
    assert _error_code(bad_xlsx) == "INVALID_FILE_FORMAT"

    bad_csv = _upload(client, auth_headers, "bad.csv", b"\xff\xfe\x00\x00")
    assert bad_csv.status_code == 422
    assert _error_code(bad_csv) == "INVALID_FILE_FORMAT"

    unsupported = _upload(client, auth_headers, "notes.txt", b"name,amount\nA,1\n")
    assert unsupported.status_code == 415
    assert _error_code(unsupported) == "UNSUPPORTED_FILE_TYPE"


def test_oversized_file_is_rejected(client, auth_headers, monkeypatch):
    monkeypatch.setattr(ingest_service, "MAX_FILE_BYTES", 64)
    response = _upload(client, auth_headers, "big.csv", b"a" * 65)
    assert response.status_code == 413
    assert _error_code(response) == "FILE_TOO_LARGE"


def test_row_and_column_limits_are_rejected(client, auth_headers):
    header = ",".join(f"c{index}" for index in range(201))
    row = ",".join("1" for _ in range(201))
    too_many_columns = _upload(
        client,
        auth_headers,
        "wide.csv",
        f"{header}\n{row}\n".encode(),
    )
    assert too_many_columns.status_code == 422
    assert _error_code(too_many_columns) == "TOO_MANY_COLUMNS"

    too_many_rows = _upload(
        client,
        auth_headers,
        "tall.csv",
        b"n\n" + b"1\n" * 200_001,
    )
    assert too_many_rows.status_code == 422
    assert _error_code(too_many_rows) == "TOO_MANY_ROWS"


def test_upload_requires_bearer_token(client):
    response = _upload(client, {}, "sales.csv", SAMPLE_CSV)
    assert response.status_code == 401

    invalid = _upload(
        client,
        {"Authorization": "Bearer not-a-real-token"},
        "sales.csv",
        SAMPLE_CSV,
    )
    assert invalid.status_code == 401


# ─────────────────────────────────────────────────────────────
# Read-only SQL
# ─────────────────────────────────────────────────────────────

def test_query_returns_rows(client, auth_headers):
    upload = _upload(client, auth_headers, "sales.csv", SAMPLE_CSV)
    assert upload.status_code == 200, upload.text
    dataset_id = upload.json()["id"]

    response = client.post(
        "/api/second-entry/query",
        headers=auth_headers,
        json={
            "dataset_id": dataset_id,
            "sql": "SELECT name, amount FROM data ORDER BY amount DESC",
        },
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["columns"] == ["name", "amount"]
    assert body["rows"] == [["B", 20], ["A", 10]]
    assert body["truncated"] is False


@pytest.mark.parametrize(
    "sql",
    [
        "",
        "   ",
        "DROP TABLE data",
        "delete from data",
        "INSERT INTO data VALUES ('C', 30)",
        "UPDATE data SET amount = 0",
        "CREATE TABLE copied AS SELECT * FROM data",
        "ALTER TABLE data ADD COLUMN extra INTEGER",
        "ATTACH 'other.duckdb' AS other",
        "DETACH other",
        "COPY data TO '/tmp/second-entry-out.csv'",
        "PRAGMA database_list",
        "INSTALL httpfs",
        "LOAD httpfs",
        "SET memory_limit = '1GB'",
        "EXPORT DATABASE '/tmp/second-entry-export'",
        "IMPORT DATABASE '/tmp/second-entry-export'",
        "SELECT * FROM data; DROP TABLE data",
        "SELECT * FROM data; SELECT * FROM data",
        "SELECT * FROM data -- trailing comment",
        "SELECT * FROM data /* block comment */",
        "WITH x AS (SELECT 1 AS one) DELETE FROM data",
        "SELECT * FROM read_csv_auto('/etc/passwd')",
        "SELECT * FROM sqlite_scan('/tmp/other.db', 't')",
    ],
)
def test_read_only_sql_rejections(client, auth_headers, sql):
    upload = _upload(client, auth_headers, "sales.csv", SAMPLE_CSV)
    assert upload.status_code == 200, upload.text
    dataset_id = upload.json()["id"]

    response = client.post(
        "/api/second-entry/query",
        headers=auth_headers,
        json={"dataset_id": dataset_id, "sql": sql},
    )
    assert response.status_code == 400, response.text
    assert _error_code(response) == "INVALID_SQL"


def test_rejected_sql_does_not_mutate_dataset(client, auth_headers):
    upload = _upload(client, auth_headers, "sales.csv", SAMPLE_CSV)
    dataset_id = upload.json()["id"]

    for sql in ("DROP TABLE data", "DELETE FROM data", "INSERT INTO data VALUES ('C', 30)"):
        rejected = client.post(
            "/api/second-entry/query",
            headers=auth_headers,
            json={"dataset_id": dataset_id, "sql": sql},
        )
        assert rejected.status_code == 400
        assert _error_code(rejected) == "INVALID_SQL"

    response = client.post(
        "/api/second-entry/query",
        headers=auth_headers,
        json={"dataset_id": dataset_id, "sql": "SELECT COUNT(*) AS n FROM data"},
    )
    assert response.status_code == 200, response.text
    assert response.json()["rows"] == [[2]]


def test_single_trailing_semicolon_and_literal_semicolon_are_allowed(client, auth_headers):
    upload = _upload(client, auth_headers, "sales.csv", SAMPLE_CSV)
    dataset_id = upload.json()["id"]

    trailing = client.post(
        "/api/second-entry/query",
        headers=auth_headers,
        json={"dataset_id": dataset_id, "sql": "SELECT COUNT(*) AS n FROM data;"},
    )
    assert trailing.status_code == 200, trailing.text
    assert trailing.json()["rows"] == [[2]]

    literal = client.post(
        "/api/second-entry/query",
        headers=auth_headers,
        json={
            "dataset_id": dataset_id,
            "sql": "SELECT ';--/*' AS marker, 'DROP' AS word",
        },
    )
    assert literal.status_code == 200, literal.text
    assert literal.json()["rows"] == [[";--/*", "DROP"]]


def test_query_default_limit_and_explicit_limit_truncate(client, auth_headers):
    content = ("n\n" + "\n".join(str(index) for index in range(1005)) + "\n").encode()
    upload = _upload(client, auth_headers, "many.csv", content)
    assert upload.status_code == 200, upload.text
    dataset_id = upload.json()["id"]

    default_limit = client.post(
        "/api/second-entry/query",
        headers=auth_headers,
        json={"dataset_id": dataset_id, "sql": "SELECT n FROM data"},
    )
    assert default_limit.status_code == 200, default_limit.text
    assert len(default_limit.json()["rows"]) == 1000
    assert default_limit.json()["truncated"] is True

    small_limit = client.post(
        "/api/second-entry/query",
        headers=auth_headers,
        json={"dataset_id": dataset_id, "sql": "SELECT n FROM data", "limit": 3},
    )
    assert small_limit.status_code == 200, small_limit.text
    assert len(small_limit.json()["rows"]) == 3
    assert small_limit.json()["truncated"] is True

    full = client.post(
        "/api/second-entry/query",
        headers=auth_headers,
        json={"dataset_id": dataset_id, "sql": "SELECT n FROM data", "limit": 5000},
    )
    assert full.status_code == 200, full.text
    assert len(full.json()["rows"]) == 1005
    assert full.json()["truncated"] is False


def test_unknown_dataset_returns_404(client, auth_headers):
    response = client.post(
        "/api/second-entry/query",
        headers=auth_headers,
        json={"dataset_id": uuid.uuid4().hex, "sql": "SELECT 1"},
    )
    assert response.status_code == 404
    assert _error_code(response) == "DATASET_NOT_FOUND"

    invalid_id = client.post(
        "/api/second-entry/query",
        headers=auth_headers,
        json={"dataset_id": "../../etc/passwd", "sql": "SELECT 1"},
    )
    assert invalid_id.status_code == 404
    assert _error_code(invalid_id) == "DATASET_NOT_FOUND"


def test_two_datasets_do_not_mix(client, auth_headers):
    first = _upload(client, auth_headers, "first.csv", b"name\nalpha\n")
    second = _upload(client, auth_headers, "second.csv", b"name\nbeta\n")
    assert first.status_code == 200, first.text
    assert second.status_code == 200, second.text

    first_meta = first.json()
    second_meta = second.json()
    assert first_meta["id"] != second_meta["id"]
    assert first_meta["path"] != second_meta["path"]

    for meta, expected in ((first_meta, [["alpha"]]), (second_meta, [["beta"]])):
        response = client.post(
            "/api/second-entry/query",
            headers=auth_headers,
            json={"dataset_id": meta["id"], "sql": "SELECT name FROM data"},
        )
        assert response.status_code == 200, response.text
        assert response.json()["rows"] == expected

    listed = client.get("/api/second-entry/datasets", headers=auth_headers)
    assert listed.status_code == 200
    assert {item["id"] for item in listed.json()} == {first_meta["id"], second_meta["id"]}


def test_store_delete_and_id_path_validation(client, auth_headers, data_dir):
    upload = _upload(client, auth_headers, "sales.csv", SAMPLE_CSV)
    assert upload.status_code == 200, upload.text
    meta = upload.json()

    store = DatasetStore.from_env()
    assert store.get(meta["id"]).filename == "sales.csv"
    assert Path(meta["path"]).is_file()
    assert store.delete(meta["id"]) is True
    assert store.list() == []
    assert not Path(meta["path"]).exists()

    with pytest.raises(SecondEntryError):
        store.get("../../etc/passwd")
    with pytest.raises(SecondEntryError):
        store.dataset_path("not-a-uuid")
