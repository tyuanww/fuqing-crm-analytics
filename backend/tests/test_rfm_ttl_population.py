import duckdb
import pytest

from backend.services.health.rfm_analysis.period import _run_rfm_period_live
from backend.services.rfm.r_flow import _run_r_flow_period
from backend.services.rfm.f_flow import _run_f_flow_period
from backend.services.rfm.m_flow import _run_m_flow_period


PERIOD = ("2026-07-01 00:00:00", "2026-07-05 23:59:59", "2026-06-30")


@pytest.fixture
def orders():
    conn = duckdb.connect(config={"memory_limit": "128MB", "threads": "1"})
    try:
        conn.execute(
            "CREATE TABLE orders (order_id VARCHAR, user_id VARCHAR, pay_time TIMESTAMP, "
            "actual_amount DECIMAL(18,2), channel VARCHAR, is_member BOOLEAN, is_goujinjin BOOLEAN, "
            "is_refund BOOLEAN, order_status VARCHAR)"
        )
        conn.execute(
            "INSERT INTO orders VALUES "
            "('s1','old','2020-01-01',10,'货架',false,false,false,'已付款'),"
            "('s2','old','2025-07-02',80,'货架',false,false,false,'已付款'),"
            "('s3','old','2026-07-02',100,'货架',true,false,false,'已付款'),"
            "('s4','new','2026-07-04',20,'货架',false,false,false,'已付款'),"
            "('s5','other','2026-07-05',50,'直播',false,false,false,'已付款')"
        )
        yield conn
    finally:
        conn.close()


@pytest.mark.parametrize("run", [_run_r_flow_period, _run_f_flow_period, _run_m_flow_period])
def test_flow_member_ttl_uses_member_buyers_and_amounts(orders, run):
    all_rows, same_rows, member_rows, member_same_rows = run(orders, *PERIOD, None, "GSV", None)
    for rows in (all_rows, same_rows):
        ttl = rows["已购客TTL"]
        assert ttl["hist_users"] == ttl["repurchase_users"] == 3
        assert ttl["repurchase_gsv"] == 170
    for rows in (member_rows, member_same_rows):
        ttl = rows["已购客TTL"]
        assert ttl["hist_users"] == ttl["repurchase_users"] == 1
        assert ttl["repurchase_gsv"] == 100
        assert ttl["repurchase_rate"] == 1


@pytest.mark.parametrize("was_member", [False, True])
def test_eight_quadrant_member_ttl_is_the_sum_of_preperiod_member_segments(orders, was_member):
    if was_member:
        orders.execute("UPDATE orders SET is_member=true WHERE order_id='s1'")
    all_rows, _, member_rows, member_same_rows = _run_rfm_period_live(orders, *PERIOD, None, "GSV", None)
    assert all_rows["已购客TTL"]["hist_users"] == 1
    assert all_rows["已购客TTL"]["repurchase_gsv"] == 100
    for rows in (member_rows, member_same_rows):
        ttl = rows["已购客TTL"]
        assert ttl["hist_users"] == sum(value["hist_users"] for segment, value in rows.items() if segment != "已购客TTL")
        assert ttl["hist_users"] == ttl["repurchase_users"] == int(was_member)
        assert ttl["repurchase_gsv"] == (100 if was_member else 0)
