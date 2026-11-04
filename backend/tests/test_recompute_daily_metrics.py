"""Tests for scripts/etl/recompute_daily_metrics.py.

Synthetic databases cover the three historical calibers observed in production:

1. 2026-01-01 .. 2026-01-02: order_count = valid orders, gsv = valid GSV;
2. 2026-01-03 .. 2026-01-04: order_count = all orders, gsv = non-canonical;
3. 2026-01-05 .. 2026-01-06: order_count = all orders, gsv = valid GSV.
"""

from __future__ import annotations

import hashlib
import json
import sys
from datetime import date, datetime
from pathlib import Path

import pytest


ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from scripts.etl import recompute_daily_metrics as rdm  # noqa: E402


OUTPUT_13_COLUMNS = [
    "date",
    "gmv",
    "gsv",
    "order_count",
    "gsv_order_count",
    "new_user_count",
    "old_user_count",
    "member_gmv",
    "member_gsv",
    "member_count",
    "avg_order_value",
    "new_user_gmv",
    "old_user_gmv",
]


def _expected_day(day: int) -> dict[str, float | int]:
    """Expected unified-caliber values for the synthetic day template."""
    if day == 1:
        # Day 1 adds one goujinjin order and one user without first_purchase.
        return {
            "gmv": 661.0,
            "gsv": 361.0,
            "order_count": 3,
            "gsv_order_count": 3,
            "new_user_count": 1,
            "old_user_count": 1,
            "member_gmv": 500.0,
            "member_gsv": 200.0,
            "member_count": 1,
            "avg_order_value": 120.33,
            "new_user_gmv": 111.0,
            "old_user_gmv": 200.0,
            "all_order_count": 6,
            "all_order_rows": 7,
            "all_order_gmv": 1561.0,
            "gmv_order_count": 4,
            "valid_order_rows": 4,
            "all_user_count": 6,
            "valid_user_count": 3,
        }

    gsv = 310 + day
    gmv = 610 + day
    return {
        "gmv": float(gmv),
        "gsv": float(gsv),
        "order_count": 2,
        "gsv_order_count": 2,
        "new_user_count": 0,
        "old_user_count": 2,
        "member_gmv": 500.0,
        "member_gsv": 200.0,
        "member_count": 1,
        "avg_order_value": round(gsv / 2, 2),
        "new_user_gmv": 0.0,
        "old_user_gmv": float(gsv),
        "all_order_count": 4,
        "all_order_rows": 5,
        "all_order_gmv": float(gmv + 400),
        "gmv_order_count": 3,
        "valid_order_rows": 3,
        "all_user_count": 4,
        "valid_user_count": 2,
    }


def _stored_row(day: int) -> dict[str, float | int]:
    expected = _expected_day(day)
    row = {
        key: expected[key]
        for key in (
            "gmv",
            "gsv",
            "order_count",
            "gsv_order_count",
            "new_user_count",
            "old_user_count",
            "member_gmv",
            "member_gsv",
            "member_count",
            "avg_order_value",
            "new_user_gmv",
            "old_user_gmv",
        )
    }
    if day <= 2:
        return row
    if day <= 4:
        row["order_count"] = expected["all_order_count"]
        row["gsv"] = round(float(expected["gsv"]) + 1.0, 2)
        return row
    row["order_count"] = expected["all_order_count"]
    return row


def _write_source(path: Path, *, schema: str = "13col") -> None:
    duckdb = pytest.importorskip("duckdb")
    conn = duckdb.connect(str(path))
    try:
        conn.execute(
            """
            CREATE TABLE orders (
                order_id VARCHAR,
                sub_order_id VARCHAR,
                user_id VARCHAR,
                pay_time TIMESTAMP,
                order_status VARCHAR,
                actual_amount DECIMAL(12,2),
                is_member BOOLEAN,
                is_goujinjin BOOLEAN,
                is_refund BOOLEAN
            )
            """
        )
        conn.execute(
            "CREATE TABLE user_first_purchase (user_id VARCHAR, first_pay_date DATE)"
        )
        if schema == "13col":
            conn.execute(
                """
                CREATE TABLE daily_metrics (
                    date DATE PRIMARY KEY,
                    gmv DECIMAL(14,2),
                    gsv DECIMAL(14,2),
                    order_count INTEGER,
                    gsv_order_count INTEGER,
                    new_user_count INTEGER,
                    old_user_count INTEGER,
                    member_gmv DECIMAL(14,2),
                    member_gsv DECIMAL(14,2),
                    member_count INTEGER,
                    avg_order_value DECIMAL(10,2),
                    new_user_gmv DECIMAL(14,2),
                    old_user_gmv DECIMAL(14,2)
                )
                """
            )
        else:
            conn.execute(
                """
                CREATE TABLE daily_metrics (
                    d DATE,
                    order_count BIGINT,
                    user_count BIGINT,
                    gsv DECIMAL(38,2),
                    member_user_count BIGINT,
                    member_gsv DECIMAL(38,2)
                )
                """
            )

        conn.executemany(
            "INSERT INTO user_first_purchase VALUES (?, ?::DATE)",
            [
                ("u_new", "2026-01-01"),
                ("u_old", "2025-12-01"),
                ("u_old2", "2025-12-01"),
                ("u_ref", "2025-12-15"),
                ("u_closed", "2025-12-20"),
                ("u_gou", "2025-12-21"),
            ],
        )

        rows: list[tuple[object, ...]] = []
        for day in range(1, 7):
            pay_day = datetime(2026, 1, day)
            first_user = "u_new" if day == 1 else "u_old"
            rows.extend(
                [
                    # Same order_id, two sub-orders: row count != distinct order count.
                    (
                        f"o{day}a",
                        "s1",
                        first_user,
                        pay_day.replace(hour=10),
                        "交易成功",
                        100 + day,
                        False,
                        False,
                        False,
                    ),
                    (
                        f"o{day}a",
                        "s2",
                        first_user,
                        pay_day.replace(hour=10, minute=30),
                        "交易成功",
                        10,
                        False,
                        False,
                        False,
                    ),
                    (
                        f"o{day}b",
                        "s1",
                        "u_old2",
                        pay_day.replace(hour=11),
                        "交易成功",
                        200,
                        True,
                        False,
                        False,
                    ),
                    # GMV-only: refunded after purchase.
                    (
                        f"o{day}c",
                        "s1",
                        "u_ref",
                        pay_day.replace(hour=12),
                        "交易成功",
                        300,
                        True,
                        False,
                        True,
                    ),
                    # Neither GMV nor GSV: closed.
                    (
                        f"o{day}d",
                        "s1",
                        "u_closed",
                        pay_day.replace(hour=13),
                        "交易关闭",
                        400,
                        False,
                        False,
                        False,
                    ),
                ]
            )

        rows.extend(
            [
                (
                    "o1e",
                    "s1",
                    "u_gou",
                    datetime(2026, 1, 1, 14),
                    "交易成功",
                    500,
                    False,
                    True,
                    False,
                ),
                (
                    "o1f",
                    "s1",
                    "u_noufp",
                    datetime(2026, 1, 1, 15),
                    "交易成功",
                    50,
                    False,
                    False,
                    False,
                ),
            ]
        )
        conn.executemany(
            """
            INSERT INTO orders VALUES (
                ?, ?, ?, ?::TIMESTAMP, ?, ?, ?, ?, ?
            )
            """,
            rows,
        )

        for day in range(1, 7):
            stored = _stored_row(day)
            d = date(2026, 1, day)
            if schema == "13col":
                conn.execute(
                    """
                    INSERT INTO daily_metrics VALUES (
                        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
                    )
                    """,
                    [
                        d,
                        stored["gmv"],
                        stored["gsv"],
                        stored["order_count"],
                        stored["gsv_order_count"],
                        stored["new_user_count"],
                        stored["old_user_count"],
                        stored["member_gmv"],
                        stored["member_gsv"],
                        stored["member_count"],
                        stored["avg_order_value"],
                        stored["new_user_gmv"],
                        stored["old_user_gmv"],
                    ],
                )
            else:
                expected = _expected_day(day)
                conn.execute(
                    "INSERT INTO daily_metrics VALUES (?, ?, ?, ?, ?, ?)",
                    [
                        d,
                        stored["order_count"],
                        expected["all_user_count"],
                        stored["gsv"],
                        expected["member_count"],
                        stored["member_gsv"],
                    ],
                )
    finally:
        conn.close()


def _sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def test_predicates_match_semantic_sources() -> None:
    from backend.semantic.calculations import GSV_PREDICATE
    from backend.semantic.filters import OrderFilters

    assert rdm.GSV_PREDICATE == GSV_PREDICATE
    assert rdm.GMV_ORDER_PREDICATE == OrderFilters.gmv_base()[0]


def test_recompute_columns_and_daily_diffs(tmp_path: Path) -> None:
    duckdb = pytest.importorskip("duckdb")
    source = tmp_path / "source.duckdb"
    output = tmp_path / "out"
    _write_source(source)

    report = rdm.run(source, output)

    assert report["mode"] == "recompute"
    assert report["window"]["start"] == "2026-01-01"
    assert report["window"]["end"] == "2026-01-06"
    assert report["window"]["days"] == 6
    assert report["window"]["basis"].startswith("MIN(daily_metrics.date)")
    assert report["window"]["basis"].endswith("MAX(CAST(orders.pay_time AS DATE))")

    day_one = report["daily"][0]
    assert day_one["date"] == "2026-01-01"
    expected = _expected_day(1)
    for column in OUTPUT_13_COLUMNS:
        if column == "date":
            continue
        assert day_one["recomputed"][column] == pytest.approx(expected[column]), column
        assert day_one["diff"][column]["direction"] == "equal", column

    assert day_one["contrast"] == {
        "all_order_count": 6,
        "all_order_rows": 7,
        "all_order_gmv": 1561.0,
        "gmv_order_count": 4,
        "valid_order_rows": 4,
        "all_user_count": 6,
        "valid_user_count": 3,
    }

    day_three = report["daily"][2]
    assert day_three["recomputed"]["order_count"] == 2
    assert day_three["caliber"] == {"order_count": "all", "gsv": "other"}
    assert day_three["diff"]["order_count"]["delta"] == -2
    assert day_three["diff"]["gsv"]["delta"] == -1.0

    day_five = report["daily"][4]
    assert day_five["caliber"] == {"order_count": "all", "gsv": "valid"}
    assert day_five["diff"]["gsv"]["direction"] == "equal"

    db_path = output / rdm.OUTPUT_DB_NAME
    assert db_path.is_file()
    conn = duckdb.connect(str(db_path), read_only=True)
    try:
        description = conn.execute("DESCRIBE daily_metrics").fetchall()
        assert [row[0] for row in description] == OUTPUT_13_COLUMNS
        rows = conn.execute("SELECT * FROM daily_metrics ORDER BY date").fetchall()
        assert len(rows) == 6
        for day, row in enumerate(rows, start=1):
            expected_day = _expected_day(day)
            values = dict(zip(OUTPUT_13_COLUMNS, row))
            for column in OUTPUT_13_COLUMNS:
                if column == "date":
                    assert values[column] == date(2026, 1, day)
                    continue
                assert float(values[column]) == pytest.approx(expected_day[column]), (
                    day,
                    column,
                )
    finally:
        conn.close()


def test_report_json_marks_three_segments_and_totals(tmp_path: Path) -> None:
    source = tmp_path / "source.duckdb"
    output = tmp_path / "out"
    _write_source(source)

    rdm.run(source, output)
    report = json.loads((output / rdm.REPORT_NAME).read_text(encoding="utf-8"))

    assert [segment["label"] for segment in report["segments"]] == [
        "valid_order_count+valid_gsv",
        "all_order_count+other_gsv",
        "all_order_count+valid_gsv",
    ]
    assert [(segment["start"], segment["end"]) for segment in report["segments"]] == [
        ("2026-01-01", "2026-01-02"),
        ("2026-01-03", "2026-01-04"),
        ("2026-01-05", "2026-01-06"),
    ]
    assert [segment["days"] for segment in report["segments"]] == [2, 2, 2]

    totals = report["totals"]
    assert totals["stored"]["order_count"] == 21
    assert totals["recomputed"]["order_count"] == 13
    assert totals["stored"]["gsv"] == pytest.approx(1933.0)
    assert totals["recomputed"]["gsv"] == pytest.approx(1931.0)
    assert totals["contrast"]["valid_order_rows"] == 19
    assert totals["contrast"]["all_order_rows"] == 32
    assert totals["contrast"]["all_order_count"] == 26
    assert totals["recomputed"]["avg_order_value"] == pytest.approx(148.54)

    assert report["drift"]["order_count"]["stored"] == 21
    assert report["drift"]["order_count"]["recomputed"] == 13
    assert report["drift"]["order_count"]["delta"] == -8
    assert report["drift"]["order_count"]["magnitude_pct"] == pytest.approx(-38.0952)
    assert report["drift"]["order_count"]["direction"] == "recomputed_lower"
    assert report["drift"]["gsv"]["delta"] == pytest.approx(-2.0)
    assert report["drift"]["gsv"]["direction"] == "recomputed_lower"
    assert report["drift"]["avg_order_value"]["stored"] == pytest.approx(92.05)

    assert any("混用了去重订单数与明细行数" in warning for warning in report["warnings"])
    assert report["definitions"]["metrics"]["order_count"] == (
        "COUNT(DISTINCT CASE WHEN V THEN order_id END)"
    )


def test_source_is_not_modified(tmp_path: Path) -> None:
    source = tmp_path / "source.duckdb"
    _write_source(source)
    before_hash = _sha256(source)
    before_stat = source.stat()
    assert not Path(str(source) + ".wal").exists()

    rdm.run(source, tmp_path / "out")

    assert _sha256(source) == before_hash
    after_stat = source.stat()
    assert after_stat.st_size == before_stat.st_size
    assert after_stat.st_mtime_ns == before_stat.st_mtime_ns
    assert not Path(str(source) + ".wal").exists()


def test_output_same_directory_is_rejected(
    tmp_path: Path,
    capsys: pytest.CaptureFixture[str],
) -> None:
    source = tmp_path / "source.duckdb"
    _write_source(source)
    before_hash = _sha256(source)

    with pytest.raises(ValueError, match="不能与 source 同目录"):
        rdm.run(source, source.parent)

    assert _sha256(source) == before_hash
    assert not (source.parent / rdm.OUTPUT_DB_NAME).exists()
    assert not (source.parent / rdm.REPORT_NAME).exists()

    exit_code = rdm.main(["--source", str(source), "--output", str(source.parent)])
    assert exit_code == 2
    captured = capsys.readouterr()
    assert "不能与 source 同目录" in captured.err
    assert not (source.parent / rdm.OUTPUT_DB_NAME).exists()


def test_verify_only_writes_no_files(tmp_path: Path) -> None:
    source = tmp_path / "source.duckdb"
    output = tmp_path / "out"
    _write_source(source)
    before_hash = _sha256(source)
    before_files = sorted(path.name for path in tmp_path.iterdir())

    report = rdm.run(source, output, verify_only=True)

    assert report["mode"] == "verify_only"
    assert report["output"] is None
    assert not output.exists()
    assert sorted(path.name for path in tmp_path.iterdir()) == before_files
    assert _sha256(source) == before_hash


def test_verify_only_reads_legacy_six_column_schema(tmp_path: Path) -> None:
    source = tmp_path / "source_6col.duckdb"
    output = tmp_path / "out"
    _write_source(source, schema="6col")

    report = rdm.run(source, output, verify_only=True)

    assert report["source_schema"]["date_column"] == "d"
    assert report["source_schema"]["daily_metrics_columns"] == [
        "d",
        "order_count",
        "user_count",
        "gsv",
        "member_user_count",
        "member_gsv",
    ]
    assert [segment["label"] for segment in report["segments"]] == [
        "valid_order_count+valid_gsv",
        "all_order_count+other_gsv",
        "all_order_count+valid_gsv",
    ]
    assert report["totals"]["stored"]["order_count"] == 21
    assert report["totals"]["stored"]["gsv"] == pytest.approx(1933.0)
    assert report["totals"]["recomputed"]["gsv"] == pytest.approx(1931.0)
    assert not output.exists()
