import { useEffect, useRef, useState } from 'react';
import type { ToolCallViewProps } from '@deepseek-ai/dsh-client-ui-tool/client';
import {
  FIRST_PURCHASE_RECEIPT_SCHEMA, decodeFirstPurchaseReceipt, firstPurchaseSaveBinding,
  type FirstPurchaseNativeReceipt, type FirstPurchaseProductRow,
} from '../first-purchase-query-model.mjs';
import { formatEmptyReason, formatRatioPercent } from '../query-format.mjs';
import { FIRST_PURCHASE_CANCEL_COPY, firstPurchaseCancelOutcome, firstPurchaseCommandEnvelope } from '../first-purchase-command-client.mjs';
import { FirstPurchaseSaveActions } from './first-purchase-save-actions.tsx';

type CancelPhase = 'idle' | keyof typeof FIRST_PURCHASE_CANCEL_COPY;

function productLine(row: FirstPurchaseProductRow) {
  const ratio = formatRatioPercent(row.finished_conversion_ratio);
  const empty = formatEmptyReason(row.empty_reason);
  if (ratio === null || empty === null) return null;
  return {
    productId: row.product_id,
    text: `${row.product_id}（${row.role}）：入组 ${row.enrolled_count} / 成熟 ${row.mature_count} / 未成熟 ${row.immature_count} / 正装转化 ${row.finished_conversion_count} · 转化率 ${ratio}`,
    empty,
    ratio,
  };
}

function faultKind(block: ToolCallViewProps['block']): 'running' | 'in-flight' | 'tool-error' | 'cancelled' | 'unknown-version' | 'malformed' | 'ok' | 'contract-rejected' {
  if (!('kind' in block) || block.kind !== 'tool-result') return 'running';
  if (block.isError) {
    const text = Array.isArray(block.content) ? block.content.map(item => 'text' in item ? String(item.text) : '').join(' ') : '';
    return text.includes('cancelled') || text.includes('已取消') ? 'cancelled' : 'tool-error';
  }
  const receipt = decodeFirstPurchaseReceipt(block.meta);
  if (receipt?.disposition === 'IN_FLIGHT') return 'in-flight';
  if (receipt?.result?.status === 'REJECTED') return 'contract-rejected';
  if (receipt) return 'ok';
  const meta = block.meta;
  const version = meta && typeof meta === 'object' && !Array.isArray(meta) && 'schema_version' in meta
    ? (meta as { schema_version?: unknown }).schema_version : undefined;
  return typeof version === 'string' && version !== FIRST_PURCHASE_RECEIPT_SCHEMA ? 'unknown-version' : 'malformed';
}

function cardSessionId(props: ToolCallViewProps): string | null {
  const value = (props as { sessionId?: unknown }).sessionId;
  return typeof value === 'string' && value ? value : null;
}

function RunningCard({
  phase, onCancel, inFlight,
}: { phase: CancelPhase; onCancel: () => void; inFlight: boolean }) {
  const busy = phase === 'submitting' || phase === 'accepted';
  const status = phase === 'idle' ? null : FIRST_PURCHASE_CANCEL_COPY[phase];
  return <div className="analytics-b0-card analytics-query-card" role="status"
    data-query-fault={inFlight ? 'in-flight' : 'running'} data-cancel-state={phase}>
    {inFlight ? '合成首购查询仍在途…' : '合成首购查询运行中…'}
    <button type="button" data-testid="analytics-first-purchase-cancel" disabled={busy}
      onClick={onCancel}>停止查询</button>
    {status && <small data-testid="analytics-first-purchase-cancel-status">{status}</small>}
  </div>;
}

export function FirstPurchaseQueryCard(props: ToolCallViewProps) {
  const { block } = props;
  const sessionId = cardSessionId(props);
  const callId = block.callId;
  const [phase, setPhase] = useState<CancelPhase>('idle');
  const phaseRef = useRef<CancelPhase>('idle');
  const generationRef = useRef(0);

  useEffect(() => {
    generationRef.current += 1;
    phaseRef.current = 'idle';
    setPhase('idle');
    return () => { generationRef.current += 1; };
  }, [sessionId, callId]);

  async function submitCancel() {
    if (phaseRef.current === 'submitting' || phaseRef.current === 'accepted') return;
    const targetSession = sessionId;
    const gen = generationRef.current;
    phaseRef.current = 'submitting';
    setPhase('submitting');
    let outcome: CancelPhase = 'error';
    try {
      if (targetSession) {
        const rpcId = `fp-cancel-${crypto.randomUUID()}`;
        const response = await fetch('/api/commands/execute', {
          method: 'POST', credentials: 'same-origin', cache: 'no-store', redirect: 'error',
          signal: AbortSignal.timeout(15000),
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(firstPurchaseCommandEnvelope(targetSession, `/first-purchase-cancel call ${callId}`, rpcId)),
        });
        let body: unknown = null;
        try { body = await response.json(); } catch { body = null; }
        outcome = (body as { rpcId?: string } | null)?.rpcId === rpcId
          ? firstPurchaseCancelOutcome({ status: response.status, body }) : 'unknown';
      }
    } catch {
      outcome = 'unknown';
    }
    if (generationRef.current !== gen) return;
    phaseRef.current = outcome;
    setPhase(outcome);
  }

  if (!('kind' in block) || block.kind !== 'tool-result') {
    return <RunningCard phase={phase} inFlight={false} onCancel={() => { void submitCancel(); }} />;
  }
  if (block.isError) {
    const kind = faultKind(block);
    return <div className="analytics-b0-card analytics-query-card" role="status" data-query-fault={kind}>
      {kind === 'cancelled' ? '首购查询已取消；没有可用结果。未执行业务动作。' : '首购查询失败；没有可用结果。未执行业务动作。'}
    </div>;
  }
  const receipt = decodeFirstPurchaseReceipt(block.meta) as FirstPurchaseNativeReceipt | null;
  if (receipt?.disposition === 'IN_FLIGHT') {
    return <RunningCard phase={phase} inFlight onCancel={() => { void submitCancel(); }} />;
  }
  if (!receipt) {
    return <div className="analytics-b0-card analytics-query-card" role="status" data-query-fault={faultKind(block)}>查询结果格式无法识别或版本不支持；不推断分析成功。</div>;
  }
  if (receipt.result?.status === 'REJECTED') {
    const missing = receipt.result.missing_product_ids.join(', ');
    return <div className="analytics-b0-card analytics-query-card" role="status"
      data-query-fault="contract-rejected" data-reason-code="MISSING_PRODUCT_ROLE"
      data-run-id={receipt.run_id} data-conversion-metric="0">
      <strong>SYNTHETIC · 首购商品路径合同拒绝</strong>
      <p>商品角色映射缺失（{missing}）。整单拒绝，不展示转化率或 0%。</p>
      <small>result_ref {receipt.run_id} · 不是真实业务数据。保存分析只能引用该 run，不能引用卡片数字。</small>
    </div>;
  }
  const facts = receipt.result?.facts;
  if (!facts || receipt.result?.status !== 'OK') {
    return <div className="analytics-b0-card analytics-query-card" role="status" data-query-fault="malformed">查询结果格式无法识别或版本不支持；不推断分析成功。</div>;
  }
  const rows = facts.products.map(productLine);
  if (rows.some(row => row === null)) {
    return <div className="analytics-b0-card analytics-query-card" role="status" data-query-fault="malformed">查询结果格式无法识别或版本不支持；不推断分析成功。</div>;
  }
  const binding = firstPurchaseSaveBinding(receipt.run_id);
  return <div className="analytics-b0-card analytics-query-card" data-testid="analytics-first-purchase-tool-result"
    data-query-fault="ok" data-observation-days={facts.observation_days} data-run-id={receipt.run_id}
    data-save-run-id={binding?.created_from_run_id} data-save-source="first-purchase-run">
    <strong>SYNTHETIC · 首购商品路径 / N日正装转化</strong>
    <p>FIXED 入组窗 · N={facts.observation_days} · as_of {receipt.result.as_of} · 入组 {facts.cohort_enrolled_count} / 成熟 {facts.cohort_mature_count}</p>
    {rows.filter(row => row !== null).map(row => <p key={row.productId} data-conversion-metric="1">{row.text}{row.empty.code && <>
      {' · '}<abbr title={row.empty.code}>{row.empty.text}</abbr></>}</p>)}
    <small>result_ref {receipt.run_id} · {receipt.result.data_source} · 保存分析仅传递 created_from_run_id，不把卡片 facts 当作可信来源。</small>
    <FirstPurchaseSaveActions key={`${sessionId}:${receipt.run_id}:${callId}`} sessionId={sessionId} callId={callId} runId={receipt.run_id} days={facts.observation_days} />
  </div>;
}
