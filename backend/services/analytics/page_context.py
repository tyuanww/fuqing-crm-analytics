from dataclasses import dataclass, field
from typing import Callable

from backend.contracts.competition_computed import DATA_SCOPE
from backend.services.analytics.access import AnalyticsError, AnalyticsPrincipal
from backend.services.analytics.first_purchase.asset_state import now_ms


@dataclass(frozen=True)
class PageAccessPolicy:
    document_scope: str = DATA_SCOPE
    result_scope: str = "free-page-result-fixture"
    edit_tenant: str | None = None


@dataclass
class PageRequestContext:
    actor: AnalyticsPrincipal
    deadline_ms: int | None = None
    remote: Callable | None = None
    observations: dict = field(default_factory=dict)

    def check_active(self):
        if self.deadline_ms is not None and now_ms() >= self.deadline_ms:
            raise AnalyticsError(503, "SOURCE_UNAVAILABLE", "页面请求已结束，请重试。", retryable=True)

    def revalidate(self):
        self.check_active()
        if self.remote is not None:
            self.remote("assertActive")
        for (session, ref), observed in list(self.observations.items()):
            current = self.remote("read", session_id=session, ref=ref)
            if current != observed:
                raise AnalyticsError(409, "RESULT_STALE", "结果来源已变化，请重新查询。")
        self.check_active()
