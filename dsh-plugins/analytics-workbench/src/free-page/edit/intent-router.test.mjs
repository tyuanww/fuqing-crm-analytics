import test from 'node:test';
import assert from 'node:assert/strict';
import { routeEditIntent } from './intent-router.mjs';

test('routes chart color to source_range when the host proves a local source scope', () => {
  const route = routeEditIntent({ instruction: '把柱子改成紫色', allowed_scope: 'dynamic_source_range' });
  assert.deepEqual(route, { intent: 'source_range', mode: 'source', reason: 'source_capability_matches_request', can_save: true });
});

test('routes ordinary text/layout requests to presentation', () => {
  const route = routeEditIntent({ instruction: '把标题字体调大并增加间距', allowed_scope: 'exact_source_range' });
  assert.equal(route.intent, 'presentation');
  assert.equal(route.can_save, true);
});

test('routes an unbound rendered runtime element to presentation', () => {
  const route = routeEditIntent({ instruction: '替换卡片文案', allowed_scope: 'rendered_element', binding_state: 'UNBOUND_SAMPLE' });
  assert.deepEqual(route, { intent: 'presentation', mode: 'structured', reason: 'rendered_element_presentation', can_save: true });
});

test('shared, bound, whole-page and unknown requests fail closed', () => {
  assert.equal(routeEditIntent({ instruction: '改颜色', allowed_scope: 'shared_scope' }).can_save, false);
  assert.equal(routeEditIntent({ instruction: '改颜色', allowed_scope: 'exact_source_range', binding_state: 'BOUND_VERIFIED' }).mode, 'readonly');
  assert.equal(routeEditIntent({ instruction: '整页重做', allowed_scope: 'whole_package', whole_page: true }).intent, 'manual');
  assert.equal(routeEditIntent({ instruction: '改变数据计算逻辑', allowed_scope: 'exact_source_range' }).intent, 'manual');
});
