import { loadCoordinatorFixture } from '../fixture-loader.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BINDING_STATES, BRIDGE_PROTOCOL, BRIDGE_TRANSPORT, ERROR_HTTP, FORBIDDEN_OPS,
  FROZEN_SCHEMA_VERSION, HANDSHAKE_FIELDS, HOST_TO_PAGE_EVENTS, PAGE_OPERATIONS,
  PAGE_TO_HOST_OPS, PREVIEW_STATUS, isIdentity,
} from './frozen-contract.mjs';


test('frozen-contract constants match coordinator fixture', async () => {
  const frozen = loadCoordinatorFixture('frozen-contract-v0.json');
  assert.equal(frozen.approved_plan_sha256, '47fa5bfe482cb9bd93f4f02a7c62c6933d0242b5204ea95f2b912edc603a6ffb');
  assert.equal(frozen.asset.schema_version, FROZEN_SCHEMA_VERSION);
  assert.equal(frozen.bridge.protocol, BRIDGE_PROTOCOL);
  assert.equal(frozen.bridge.transport, BRIDGE_TRANSPORT);
  assert.deepEqual(frozen.bridge.handshake, [...HANDSHAKE_FIELDS]);
  assert.deepEqual(frozen.bridge.page_to_host_ops, [...PAGE_TO_HOST_OPS]);
  assert.deepEqual(frozen.bridge.host_to_page_events, [...HOST_TO_PAGE_EVENTS]);
  assert.deepEqual(frozen.bridge.forbidden_ops, [...FORBIDDEN_OPS]);
  assert.deepEqual(frozen.asset.binding_states, [...BINDING_STATES]);
  assert.deepEqual(frozen.operations, [...PAGE_OPERATIONS]);
  assert.deepEqual(frozen.preview_status, [...PREVIEW_STATUS]);
  for (const [code, http] of Object.entries(ERROR_HTTP)) {
    assert.equal(frozen.errors[code], http, code);
  }
  assert.equal(isIdentity('page_fixture_unbound'), true);
  assert.equal(isIdentity('bad id'), false);
});
