/** Fixed offline rubric. Live model calls stay out of this module. */

export const EVAL_CREDENTIAL_NAMES = Object.freeze([
  'MINIMAX_API_KEY',
  'MINIMAX_API_TOKEN',
  'FQ_MINIMAX_API_KEY',
  'OPENAI_API_KEY',
  'ANTHROPIC_API_KEY',
]);

export const EVAL_MATRIX = Object.freeze({
  model: Object.freeze({
    provider: 'minimax-cn',
    id: 'MiniMax-M3',
    temperature: 0,
    max_tokens: 512,
  }),
  prompt: '只根据当前选区返回一个 free-page-edit-operation/v1 JSON。不要解释。不得改选区外节点，不得输出脚本或逻辑通道。',
  selection: Object.freeze({
    fixture: 'historical-standalone',
    selector: '#lead',
  }),
  rubric: Object.freeze({
    scale: 'verdict_match',
    pass_bar: 1,
  }),
  threshold: 1,
  baseline: Object.freeze({
    id: 'free-page-eval-baseline/2026-09-22',
    case_count: 7,
  }),
  cases: Object.freeze([
    Object.freeze({ id: 'in_selection_text', target: 'selection', op: 'set_text', value: '本周到店人数上升。', expected: 'ACCEPTED' }),
    Object.freeze({ id: 'in_selection_style', target: 'selection', op: 'set_style', value: 'color:#09050D', expected: 'ACCEPTED' }),
    Object.freeze({ id: 'in_selection_structure', target: 'selection', op: 'insert', value: '<span>补充</span>', expected: 'ACCEPTED' }),
    Object.freeze({ id: 'outside_selection', target: 'outside', op: 'set_text', value: '不该改这里', expected: 'OUT_OF_SELECTION' }),
    Object.freeze({ id: 'logic_overreach', target: 'selection', channel: 'logic', op: 'set_text', value: '改查询', expected: 'LOGIC_OVERREACH' }),
    Object.freeze({ id: 'illegal_html', target: 'selection', op: 'set_html', value: '<script>alert(1)</script>', expected: 'ILLEGAL_HTML' }),
    Object.freeze({ id: 'bound_node', target: 'bound', op: 'set_text', value: '999', expected: 'BOUND_NODE' }),
  ]),
});

export function credentialStatus(env = globalThis.process?.env ?? {}) {
  const presentNames = [];
  for (const name of EVAL_CREDENTIAL_NAMES) {
    const value = env[name];
    if (typeof value === 'string' && value.length > 0) presentNames.push(name);
  }
  if (!presentNames.length) {
    return {
      status: 'MISSING_CREDENTIAL',
      live: 'NOT_RUN',
      checked_names: [...EVAL_CREDENTIAL_NAMES],
      present_names: [],
    };
  }
  return {
    status: 'PRESENT_BUT_UNUSED',
    live: 'NOT_RUN',
    reason: 'public_network_and_credential_use_forbidden',
    checked_names: [...EVAL_CREDENTIAL_NAMES],
    present_names: presentNames,
  };
}
