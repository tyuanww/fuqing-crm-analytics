/** Deterministic edit routing. The model never chooses a wider write scope. */

export const EDIT_INTENTS = Object.freeze(['presentation', 'source_range', 'manual']);

const PRESENTATION = /(?:文案|文字|标题|内容|间距|边距|布局|宽度|高度|对齐|显示|隐藏|圆角|字体大小|字号|粗细|位置)/i;
const SOURCE = /(?:html|css|javascript|\bjs\b|svg|canvas|fill|颜色|色值|柱子|柱状图|图表|渲染|脚本|动画|阴影|border|background)/i;

function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * Route only from host-owned capability information and the user's intent.
 * Unknown, shared, bound and whole-page cases fail closed to manual/read-only.
 */
export function routeEditIntent({ instruction, allowed_scope, binding_state, whole_page = false } = {}) {
  const request = text(instruction);
  const scope = text(allowed_scope);
  const binding = text(binding_state);
  if (whole_page || scope === 'whole_package') {
    return Object.freeze({ intent: 'manual', mode: 'manual', reason: 'whole_package_requires_explicit_manual_entry', can_save: false });
  }
  if (scope === 'readonly_bound' || binding.startsWith('BOUND_')) {
    return Object.freeze({ intent: 'manual', mode: 'readonly', reason: 'bound_page_source_is_readonly', can_save: false });
  }
  if (scope === 'shared_scope' || scope === 'unmapped' || scope === 'none') {
    return Object.freeze({ intent: 'manual', mode: 'manual', reason: scope === 'shared_scope' ? 'shared_selector_requires_explicit_scope' : 'selection_not_mapped', can_save: false });
  }
  if (!request) return Object.freeze({ intent: 'manual', mode: 'manual', reason: 'instruction_missing', can_save: false });
  if (SOURCE.test(request) && (scope === 'exact_source_range' || scope === 'dynamic_source_range' || scope === 'declared_region')) {
    return Object.freeze({ intent: 'source_range', mode: 'source', reason: 'source_capability_matches_request', can_save: true });
  }
  if (PRESENTATION.test(request) && (scope === 'exact_source_range' || scope === 'rendered_element')) {
    return Object.freeze({ intent: 'presentation', mode: 'structured', reason: scope === 'rendered_element' ? 'rendered_element_presentation' : 'structured_capability_matches_request', can_save: true });
  }
  return Object.freeze({ intent: 'manual', mode: 'manual', reason: 'intent_or_capability_unknown', can_save: false });
}
