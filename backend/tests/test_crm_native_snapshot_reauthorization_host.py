from dataclasses import asdict, replace

from fastapi.testclient import TestClient
import pytest

from backend.tests.test_crm_native_snapshot_host import host_case as host_case, call


def install_intent(case, refs):
    handle = 'crm_reauth_' + 'e' * 32
    identity = replace(case['identity'], connection_generation='new-login')
    case['state']['handles'][handle] = {'schema_version': 'native-crm-reauthorization-intent/v1',
        'handle': handle, 'identity': asdict(identity), 'refs': refs}
    return handle, identity


def inspect(client, case, refs, handle):
    return call(client, case, 'inspect', handle=handle, refs=refs)


def test_inspect_exact_purpose_and_scope_then_read_with_new_proof(host_case):
    case = host_case
    with TestClient(case['app']()) as client:
        receipt = call(client, case).json()
        ref = receipt['ref_id']
        handle, identity = install_intent(case, [ref])
        before = (case['root'] / 'refs/native_crm_snapshot_refs.sqlite3').read_bytes()
        inspected = inspect(client, case, [ref], handle)
        assert inspected.status_code == 200, inspected.text
        descriptor = inspected.json()['sources'][0]
        assert descriptor['captured_at'] == case['snapshots'][0].captured_at.isoformat()
        assert inspect(client, case, [ref], 'crm_op_' + 'a' * 32).status_code == 400
        assert inspect(client, case, ['crm_ref_' + '0' * 32], handle).status_code != 200
        observation = case['state']['handles']['crm_op_' + 'a' * 32]
        observation.update(schema_version='native-crm-reauthorized-observation/v1', identity=asdict(identity),
            authorization={'ref_id': ref, 'ref_payload_sha256': descriptor['ref_payload_sha256']})
        assert call(client, case, 'read', ref_id=ref).status_code == 200
        assert call(client, case).status_code == 400
        assert (case['root'] / 'refs/native_crm_snapshot_refs.sqlite3').read_bytes() == before
        assert call(client, case, 'revoke', ref_id=ref).status_code == 200
        assert call(client, case, 'read', ref_id=ref).json()['code'] == 'RESULT_REVOKED'


@pytest.mark.parametrize('damage', ['wrong-ref', 'wrong-sha', 'old-schema', 'extra-authority'])
def test_reauthorized_proof_is_strict_and_cannot_borrow_same_snapshot_ref(host_case, damage):
    case = host_case
    with TestClient(case['app']()) as client:
        receipt = call(client, case).json()
        ref = receipt['ref_id']
        handle, identity = install_intent(case, [ref])
        result = inspect(client, case, [ref], handle)
        assert result.status_code == 200, result.text
        authority = {'ref_id': ref, 'ref_payload_sha256': result.json()['sources'][0]['ref_payload_sha256']}
        observation = case['state']['handles']['crm_op_' + 'a' * 32]
        observation.update(schema_version='native-crm-reauthorized-observation/v1', identity=asdict(identity), authorization=authority)
        if damage == 'wrong-ref':
            authority['ref_id'] = 'crm_ref_' + '0' * 32
        if damage == 'wrong-sha':
            authority['ref_payload_sha256'] = '0' * 64
        if damage == 'old-schema':
            observation['schema_version'] = 'native-crm-snapshot-observation/v1'
        if damage == 'extra-authority':
            observation['authority'] = authority
        assert call(client, case, 'read', ref_id=ref).status_code != 200
        assert call(client, case, 'revoke', ref_id=ref).status_code != 200


def test_mixed_batch_authorities_cannot_authorize_another_item(host_case):
    case = host_case
    with TestClient(case['app']()) as client:
        items = [{'handle': 'crm_op_' + c * 32, 'ref_id': call(client, case, handle='crm_op_' + c * 32).json()['ref_id']} for c in ['a', 'b']]
        refs = [item['ref_id'] for item in items]
        handle, identity = install_intent(case, refs)
        result = inspect(client, case, refs, handle)
        assert result.status_code == 200, result.text
        for item, descriptor in zip(items, result.json()['sources']):
            case['state']['handles'][item['handle']].update(schema_version='native-crm-reauthorized-observation/v1',
                identity=asdict(identity), authorization={'ref_id': descriptor['ref_id'], 'ref_payload_sha256': descriptor['ref_payload_sha256']})
        body = {'operation': 'read_many', 'session_id': 'native-session', 'items': items, 'budget_ms': 5000}
        headers = {'authorization': 'Bearer ' + case['token_file'].read_text()}
        assert client.post('/native-crm-source', json=body, headers=headers).status_code == 200
        case['state']['handles'][items[1]['handle']]['authorization'] = case['state']['handles'][items[0]['handle']]['authorization']
        assert client.post('/native-crm-source', json=body, headers=headers).status_code != 200
