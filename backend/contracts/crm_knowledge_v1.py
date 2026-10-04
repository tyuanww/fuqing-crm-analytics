"""Knowledge-service wire boundary. No CRM query engine or DSH dependency."""
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


class KnowledgeExplainRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    topic: str = Field(min_length=1, max_length=512)


class KnowledgeExplanation(BaseModel):
    # Domain-specific definitions/verification metadata may grow additively.
    model_config = ConfigDict(extra="allow", strict=True)
    topic: str
    metric_version: Literal["crm-metrics/v1"]
    pack_version: Literal["crm-knowledge-offline/v1"]
    pack_sha256: str = Field(pattern=r"^[a-f0-9]{64}$")
    decision_ids: list[str]
    evidence_refs: list[str]
    sources: list[dict[str, Any]]
    relations: list[dict[str, Any]]
    context_nodes: list[dict[str, Any]]
    implementation_status: str
    content_scope: Literal["public_synthetic_pack_only"]
    synthetic: Literal[True]
    publication_status: Literal["local_isolated_candidate"]
    document_acl_connected: Literal[False]
    code_fixed_in_legacy_services: Literal[False]
    execution_authorized: Literal[False]
    real_business_acceptance: Literal[False]
    dsh_using_neo4j: Literal[False]
