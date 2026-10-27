"""Interrupt/reopen only the caller-owned synthetic test state."""
import json
import os
from pathlib import Path
import sys

from backend.services.analytics.cockpit_files import CockpitFileStore
from backend.services.analytics.cockpit_native_ai import NativeCockpitAIStore
from backend.services.analytics.native_page_source import NATIVE_POLICY, NativePageSource
from backend.services.analytics.page_context import PageRequestContext
from backend.services.analytics.page_documents import PageDocumentStore
from backend.services.analytics.first_purchase.asset_state import now_ms
from backend.tests.test_native_page_source import actor, source_value


directory, job_id, candidate_hash, mode = sys.argv[1:]
state = Path(directory)
source = NativePageSource('http://127.0.0.1:18192')
pages = PageDocumentStore(state, policy=NATIVE_POLICY, resolve_binding=source.resolve_binding)
ai = NativeCockpitAIStore(CockpitFileStore(state / 'files'), pages)
value = source_value()
context = PageRequestContext(actor(), now_ms() + 10000,
                             lambda operation, **fields: {'active': True} if operation == 'assertActive' else value)
if mode == 'interrupt':
    original = pages.confirm
    def interrupt(*args, **kwargs):
        original(*args, **kwargs)
        os._exit(73)
    pages.confirm = interrupt
result = ai.confirm(actor(), job_id, candidate_hash, source_context=context)
print(json.dumps(result))
