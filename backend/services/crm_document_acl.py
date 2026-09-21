"""CRM username → private textbook grants. Fail closed when citations exist."""
from __future__ import annotations

import json
import os
from pathlib import Path
import re
import stat

ACL_SCHEMA = "crm-graph-acl/v1"
USER = re.compile(r"^[A-Za-z0-9_.@-]{1,64}$")
UUID = re.compile(r"^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$")


def _ids(citations):
    values = []
    for item in citations or []:
        knowledge_id = item.knowledge_id if hasattr(item, "knowledge_id") else item["knowledge_id"]
        if knowledge_id not in values:
            values.append(knowledge_id)
    return values


def load_graph_acl(path=None):
    raw = path or os.getenv("FQ_CRM_GRAPH_ACL_FILE")
    if not raw:
        return None
    file = Path(raw)
    if not file.is_absolute() or file.is_symlink():
        raise ValueError("graph ACL path must be an absolute private file")
    info = file.stat()
    if (not stat.S_ISREG(info.st_mode) or info.st_nlink != 1 or info.st_uid != os.getuid()
            or info.st_mode & 0o077 or info.st_size > 65536):
        raise ValueError("graph ACL file must be owner-only")
    acl = json.loads(file.read_text(encoding="utf-8"))
    if (not isinstance(acl, dict) or acl.get("schema") != ACL_SCHEMA
            or not UUID.fullmatch(str(acl.get("knowledge_base_id", "")))
            or not isinstance(acl.get("grants"), list) or len(acl["grants"]) > 32):
        raise ValueError("graph ACL schema invalid")
    for grant in acl["grants"]:
        if (not isinstance(grant, dict) or not USER.fullmatch(str(grant.get("username", "")))
                or not isinstance(grant.get("knowledge_ids"), list) or len(grant["knowledge_ids"]) > 20
                or any(not UUID.fullmatch(str(item)) for item in grant["knowledge_ids"])):
            raise ValueError("graph ACL grant invalid")
    return acl


def grant_set(acl, username):
    if not acl or not USER.fullmatch(username or ""):
        return set()
    for grant in acl["grants"]:
        if grant["username"] == username:
            return set(grant["knowledge_ids"])
    return set()


def can_read_citations(username, citations, acl=None):
    if not citations:
        return True
    loaded = acl
    if loaded is None:
        try:
            loaded = load_graph_acl()
        except (OSError, ValueError, json.JSONDecodeError, TypeError, KeyError):
            return False
    if loaded is None:
        return False
    granted = grant_set(loaded, username)
    return all(item in granted for item in _ids(citations))


def share_citations_allowed(recipient, citations, acl=None):
    return can_read_citations(recipient, citations, acl)
