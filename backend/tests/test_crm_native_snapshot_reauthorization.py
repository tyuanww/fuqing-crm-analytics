from contextlib import closing
from dataclasses import FrozenInstanceError, asdict, replace
import sqlite3

import pytest

from backend.services import crm_native_snapshot_source as module
from backend.services.crm_analysis import digest
from backend.services.crm_native_snapshot_source import NativeCrmLease, NativeSnapshotExpectation, NativeSnapshotRead
from backend.tests.test_crm_native_snapshot_source import source_case as source_case, assert_code


def authorize(case, ref):
    source, _, _, state, _, _ = case
    authority = module.NativeSnapshotAuthorization(ref.ref_id, digest(asdict(ref)))
    source.provider = lambda: NativeCrmLease(state['identity'], lambda: state['connected'], (authority,))
    return authority


def test_explicit_authorization_restores_exact_snapshot_without_writing_ref(source_case):
    source, _, snapshot, state, clock, _ = source_case
    ref = source.register(snapshot.snapshot_id)
    before = source.path.read_bytes()
    state['identity'] = replace(state['identity'], connection_generation='new-login', expires_at_ms=clock['now'] + 20000)
    assert_code('NOT_FOUND', lambda: source.read(ref.ref_id))
    authorize(source_case, ref)
    assert source.read(ref.ref_id) == snapshot
    assert source.path.read_bytes() == before
    assert_code('INVALID_REQUEST', lambda: source.register(snapshot.snapshot_id))
    source.revoke(ref.ref_id)
    assert_code('RESULT_REVOKED', lambda: source.read(ref.ref_id))


def test_expired_original_grant_requires_exact_authorization(source_case):
    source, _, snapshot, state, clock, _ = source_case
    ref = source.register(snapshot.snapshot_id)
    clock['now'] = ref.identity.expires_at_ms
    state['identity'] = replace(state['identity'], expires_at_ms=clock['now'] + 10000)
    assert_code('RESULT_STALE', lambda: source.read(ref.ref_id))
    authority = authorize(source_case, ref)
    request = (NativeSnapshotRead(ref.ref_id, NativeSnapshotExpectation(snapshot.snapshot_id, snapshot.result_sha256)),)
    assert source.read_many(request, check_active=lambda: None) == (snapshot,)
    source.provider = lambda: NativeCrmLease(state['identity'], lambda: True, (replace(authority, ref_payload_sha256='0' * 64),))
    assert_code('RESULT_STALE', lambda: source.read(ref.ref_id))


@pytest.mark.parametrize('field', ['username', 'native_session_id'])
def test_authorization_never_overrides_owner_session(source_case, field):
    source, _, snapshot, state, _, _ = source_case
    ref = source.register(snapshot.snapshot_id)
    authorize(source_case, ref)
    state['identity'] = replace(state['identity'], **{field: 'other'})
    assert_code('NOT_FOUND', lambda: source.read(ref.ref_id))


@pytest.mark.parametrize('damage', ['wrong-ref', 'wrong-hash', 'list', 'duplicate', 'too-many', 'wrong-type'])
def test_lease_authority_is_strict(source_case, damage):
    source, _, snapshot, state, _, _ = source_case
    ref = source.register(snapshot.snapshot_id)
    authority = authorize(source_case, ref)
    values = {
        'wrong-ref': (replace(authority, ref_id='bad'),),
        'wrong-hash': (replace(authority, ref_payload_sha256=True),),
        'list': [authority], 'duplicate': (authority, authority),
        'too-many': tuple(replace(authority, ref_id=f'crm_ref_{i:032x}') for i in range(65)),
        'wrong-type': ({'ref_id': ref.ref_id, 'ref_payload_sha256': authority.ref_payload_sha256},),
    }[damage]
    source.provider = lambda: NativeCrmLease(state['identity'], lambda: True, values)
    assert_code('IDENTITY_UNAVAILABLE', lambda: source.read(ref.ref_id))


def test_authorizations_frozen_and_default_empty(source_case):
    source, _, snapshot, state, _, _ = source_case
    ref = source.register(snapshot.snapshot_id)
    authority = authorize(source_case, ref)
    with pytest.raises(FrozenInstanceError):
        authority.ref_id = 'changed'
    assert NativeCrmLease(state['identity'], lambda: True).authorizations == ()


def test_authority_change_during_read_is_rejected(source_case, monkeypatch):
    source, store, snapshot, state, _, _ = source_case
    ref = source.register(snapshot.snapshot_id)
    authority = authorize(source_case, ref)
    grants = [authority]
    source.provider = lambda: NativeCrmLease(state['identity'], lambda: True, tuple(grants))
    original = store.read_owned_snapshot
    def changed(*args):
        value = original(*args)
        grants.clear()
        return value
    monkeypatch.setattr(store, 'read_owned_snapshot', changed)
    assert_code('UNAUTHENTICATED', lambda: source.read(ref.ref_id))


@pytest.mark.parametrize('count', [1, 16, 17, 64])
def test_inspection_metadata_is_complete_and_does_not_activate(source_case, count):
    source, _, snapshot, state, clock, _ = source_case
    refs = []
    for i in range(count):
        state['identity'] = replace(state['identity'], connection_generation=f'old-{i}')
        refs.append(source.register(snapshot.snapshot_id).ref_id)
    state['identity'] = replace(state['identity'], connection_generation='new', expires_at_ms=clock['now'] + 20000)
    clock['now'] += 10001
    before = source.path.read_bytes()
    values = source.inspect(tuple(refs), check_active=lambda: None)
    assert len(values) == count
    for ref_id, descriptor in zip(refs, values):
        assert set(descriptor) == {'ref_id', 'ref_payload_sha256', 'snapshot_id', 'source_sha256', 'result_sha256', 'projection_version', 'data_kind', 'captured_at'}
        assert descriptor['ref_id'] == ref_id
        assert descriptor['captured_at'] == snapshot.captured_at.isoformat()
        assert descriptor['result_sha256'] == snapshot.result_sha256
    assert source.path.read_bytes() == before
    assert_code('NOT_FOUND', lambda: source.read(refs[0]))


@pytest.mark.parametrize('damage,code', [('duplicate', 'INVALID_REQUEST'), ('65', 'INVALID_REQUEST'), ('missing', 'NOT_FOUND'), ('revoked', 'RESULT_REVOKED'), ('tampered', 'STATE_UNAVAILABLE')])
def test_inspect_rejects_invalid_or_damaged_refs(source_case, damage, code):
    source, _, snapshot, _, _, _ = source_case
    ref = source.register(snapshot.snapshot_id)
    refs = (ref.ref_id,)
    if damage == 'duplicate':
        refs *= 2
    if damage == '65':
        refs = tuple(f'crm_ref_{i:032x}' for i in range(65))
    if damage == 'missing':
        refs = (ref.ref_id, 'crm_ref_' + '0' * 32)
    if damage == 'revoked':
        source.revoke(ref.ref_id)
    if damage == 'tampered':
        with closing(sqlite3.connect(source.path)) as con:
            con.execute("UPDATE refs SET payload='{}'")
            con.commit()
    assert_code(code, lambda: source.inspect(refs, check_active=lambda: None))


def test_exact_authority_cannot_restore_a_different_ref_to_the_same_snapshot(source_case):
    source, _, snapshot, state, _, _ = source_case
    first = source.register(snapshot.snapshot_id)
    state['identity'] = replace(state['identity'], connection_generation='second')
    second = source.register(snapshot.snapshot_id)
    state['identity'] = replace(state['identity'], connection_generation='third')
    authorize(source_case, first)
    source.expected_snapshot = NativeSnapshotExpectation(snapshot.snapshot_id, snapshot.result_sha256)
    assert source.read(first.ref_id) == snapshot
    assert_code('NOT_FOUND', lambda: source.read(second.ref_id))
    assert_code('NOT_FOUND', lambda: source.revoke(second.ref_id))
    requests = tuple(NativeSnapshotRead(ref.ref_id, source.expected_snapshot) for ref in (first, second))
    assert_code('NOT_FOUND', lambda: source.read_many(requests, check_active=lambda: None))


@pytest.mark.parametrize('damage', ['deleted-snapshot', 'changed-snapshot', 'late-revocation', 'late-final-revocation', 'late-proof'])
def test_inspect_rechecks_whole_batch_and_current_proof(source_case, monkeypatch, damage):
    source, store, snapshot, state, _, _ = source_case
    ref = source.register(snapshot.snapshot_id)
    if damage == 'deleted-snapshot':
        with closing(sqlite3.connect(store.path)) as con:
            con.execute('DELETE FROM assets WHERE id=?', (snapshot.snapshot_id,))
            con.commit()
        assert_code('NOT_FOUND', lambda: source.inspect((ref.ref_id,), check_active=lambda: None))
        return
    original = store.read_owned_snapshot
    calls = 0
    def read(*args):
        nonlocal calls
        value = original(*args)
        calls += 1
        if calls == (2 if damage == 'late-final-revocation' else 1):
            if damage in {'late-revocation', 'late-final-revocation'}:
                source.revoke(ref.ref_id)
            elif damage == 'late-proof':
                state['connected'] = False
            else:
                with closing(sqlite3.connect(store.path)) as con:
                    row = con.execute('SELECT source,payload FROM assets WHERE id=?', (snapshot.snapshot_id,)).fetchone()
                    import json
                    from backend.services.crm_analysis import canonical
                    raw = json.loads(row[1])
                    raw['captured_at'] = '2026-01-01T00:00:00+00:00'
                    con.execute('UPDATE assets SET payload=?,sha256=? WHERE id=?',
                                (canonical(raw), digest(['alice', 'snapshot', snapshot.snapshot_id, row[0], raw]), snapshot.snapshot_id))
                    con.commit()
        return value
    monkeypatch.setattr(store, 'read_owned_snapshot', read)
    expected = {'changed-snapshot': 'RESULT_STALE', 'late-revocation': 'RESULT_REVOKED', 'late-final-revocation': 'RESULT_REVOKED', 'late-proof': 'UNAUTHENTICATED'}[damage]
    assert_code(expected, lambda: source.inspect((ref.ref_id,), check_active=lambda: None))
