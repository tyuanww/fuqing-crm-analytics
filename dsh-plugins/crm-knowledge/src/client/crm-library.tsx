import { useEffect, useRef, useState } from 'react';
import { Alert, Button, Card, ConfigProvider, Descriptions, Input, Modal, Space, Tabs, Tag, Typography, theme } from 'antd';
import type { components } from '../dashboard-contract.generated.js';
import { antdSeedToken } from '../../../analytics-workbench/src/client/competition-shell/tokens';

type Snapshot = components['schemas']['CrmSnapshot'];
type Analysis = components['schemas']['CrmAnalysis'];
type Library = components['schemas']['CrmLibrary'];
type Command = { operation: 'save'; snapshot_id: string; title: string; key: string } | { operation: 'pin'; analysis_id: string; key: string };
type Candidate = { snapshot: Snapshot; analysis?: Analysis };
const authFailure = (error: unknown) => error instanceof Error && 'code' in error &&
  ['NOT_CONNECTED', 'AUTH_EXPIRED', 'ACCOUNT_MISMATCH', 'HOST_AUTH_REQUIRED', 'SESSION_UNAVAILABLE'].includes(String(error.code));
const money = (value: number | null) => {
  if (value === null) return '不可用';
  const absolute = BigInt(value) < 0n ? -BigInt(value) : BigInt(value);
  return `¥${value < 0 ? '-' : ''}${absolute / 100n}.${String(absolute % 100n).padStart(2, '0')}`;
};
const reasons: Record<string, string> = { INVALID_AMOUNT: '金额异常', NEGATIVE_AMOUNT: '存在负额', UNKNOWN_ORDER: '订单标识缺失',
  UNKNOWN_BUYER: '买家标识缺失', AMBIGUOUS_ORDER_BUYER: '订单对应多个买家', NO_PURCHASES: '分母为零' };

export function CrmSnapshotFacts({ snapshot }: { snapshot: Snapshot }) {
  const r = snapshot.result;
  return <Space direction="vertical" style={{ width: '100%' }}>
    <Space wrap><Tag>{snapshot.data_kind === 'synthetic' ? '合成资料 · 非真实验收' : 'CRM 业务资料'}</Tag>
      <Typography.Text>{r.filters.start_date} — {r.filters.end_date} · {r.filters.channel}{r.filters.exclude_low_price ? ' · 剔除低价' : ''}</Typography.Text></Space>
    <Descriptions size="small" column={{ xs: 1, sm: 3 }} items={[
      { key: 'gsv', label: 'GSV', children: money(r.gsv_amount_fen) },
      { key: 'aov', label: 'AOV / 笔', children: r.aov.reason ? reasons[r.aov.reason] : money(r.aov.amount_fen) },
      { key: 'aus', label: 'AUS / 人', children: r.aus.reason ? reasons[r.aus.reason] : money(r.aus.amount_fen) },
      { key: 'orders', label: '去重订单', children: r.coverage.orders },
      { key: 'buyers', label: '去重买家', children: r.coverage.buyers },
      { key: 'zero', label: '零元订单 / 仅零元买家', children: `${r.coverage.zero_amount_orders} / ${r.coverage.zero_only_buyers}` },
      { key: 'missing', label: '未知订单 / 买家明细', children: `${r.coverage.unknown_order_rows} / ${r.coverage.unknown_buyer_rows}` },
    ]} />
    <Typography.Text type="secondary">查询时间：{new Date(snapshot.captured_at).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}（北京时间）。固定结果，不自动刷新；数据水位、退款截止日未知。</Typography.Text>
    <Typography.Text type="secondary">口径 {r.metric_version} · 零元订单及仅零元买家另列，不计购买分母。快照 {snapshot.snapshot_id}</Typography.Text>
  </Space>;
}

/** Explicit confirmation sends reference IDs only; facts never leave this view. */
export function CrmLibraryButton({ sessionId, cockpit = false }: { sessionId?: string; cockpit?: boolean }) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<Library | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [candidate, setCandidate] = useState<Candidate | null>(null);
  const [title, setTitle] = useState('');
  const [command, setCommand] = useState<Command | null>(null);
  const pending = useRef<AbortController | null>(null);
  const commandRef = useRef<Command | null>(null);
  function clear() {
    pending.current?.abort(); setData(null); setCandidate(null); setCommand(null); commandRef.current = null;
    setBusy(false); setOpen(false); setMessage('');
  }
  useEffect(() => {
    clear(); window.addEventListener('crm-connection-changed', clear);
    return () => { pending.current?.abort(); window.removeEventListener('crm-connection-changed', clear); };
  }, [sessionId]);
  async function call(payload: Record<string, unknown>, signal: AbortSignal) {
    const res = await fetch('/api/crm-knowledge/assets', { method: 'POST', credentials: 'same-origin', cache: 'no-store', signal,
      headers: { 'content-type': 'application/json', 'x-crm-ui': '1' }, body: JSON.stringify({ ...payload, session_id: sessionId }) });
    const value = await res.json();
    if (signal.aborted) throw new Error('cancelled');
    if (!res.ok || !value.ok) throw Object.assign(new Error(typeof value.message === 'string' ? value.message : 'CRM 分析暂不可用，请刷新核对。'), { code: value.code });
    return value.value;
  }
  async function refresh() {
    pending.current?.abort(); const controller = new AbortController(); pending.current = controller;
    setBusy(true); setMessage(''); setData(null);
    try { const value = await call({ operation: 'library' }, controller.signal); if (!controller.signal.aborted) setData(value); }
    catch (error) { if (!controller.signal.aborted) setMessage(error instanceof Error ? error.message : '读取失败，请重试。'); }
    finally { if (!controller.signal.aborted) setBusy(false); }
  }
  useEffect(() => {
    if (!open || candidate) return;
    const check = () => { void refresh(); };
    window.addEventListener('focus', check);
    return () => window.removeEventListener('focus', check);
  }, [open, candidate, sessionId]);
  function choose(value: Candidate) {
    setCandidate(value); setTitle(`${value.snapshot.result.filters.start_date} 销售分析`);
    setCommand(null); commandRef.current = null; setMessage('');
  }
  async function confirm() {
    if (!candidate || busy) return;
    const request: Command = commandRef.current ?? (candidate.analysis ? { operation: 'pin', analysis_id: candidate.analysis.analysis_id, key: crypto.randomUUID() }
      : { operation: 'save', snapshot_id: candidate.snapshot.snapshot_id, title: title.trim(), key: crypto.randomUUID() });
    commandRef.current = request; setCommand(request);
    pending.current?.abort(); const controller = new AbortController(); pending.current = controller;
    setBusy(true); setMessage('');
    try {
      await call(request, controller.signal);
      if (controller.signal.aborted) return;
      setCandidate(null); setCommand(null); commandRef.current = null;
      await refresh();
    } catch (error) {
      if (!controller.signal.aborted) {
        setData(null);
        if (authFailure(error)) { setCandidate(null); setCommand(null); commandRef.current = null; }
        setMessage(`${error instanceof Error ? error.message : '请求未完成。'} ${authFailure(error) ? '重新连接后刷新核对。' : '保存状态请用原请求重试核对。'}`);
      }
    } finally { if (!controller.signal.aborted) setBusy(false); }
  }
  const list = (kind: 'snapshots' | 'analyses' | 'references') => <Space direction="vertical" size="middle" style={{ width: '100%' }}>
    {data?.[`${kind}_truncated`] && <Alert type="info" message="仅展示最近 20 项，较早项目仍保留；完整检索待后续接入。" />}
    {kind === 'snapshots' ? data?.snapshots.map(snapshot => <Card key={snapshot.snapshot_id} size="small" title="查询结果快照"
      extra={<Button disabled={busy} onClick={() => choose({ snapshot })}>保存分析</Button>}><CrmSnapshotFacts snapshot={snapshot} /></Card>)
      : kind === 'analyses' ? data?.analyses.map(analysis => <Card key={analysis.analysis_id} size="small" title={analysis.title}
        extra={<Button disabled={busy} onClick={() => choose({ snapshot: analysis.snapshot, analysis })}>加入驾驶舱</Button>}><CrmSnapshotFacts snapshot={analysis.snapshot} /></Card>)
      : data?.references.map(ref => <Card key={ref.reference_id} size="small" title={ref.analysis.title}><CrmSnapshotFacts snapshot={ref.analysis.snapshot} />
        <Typography.Text type="secondary">引用分析 {ref.analysis.analysis_id} · {ref.reference_id}</Typography.Text></Card>)}
    {data && !data[kind].length && <Typography.Paragraph>{kind === 'snapshots' ? '尚无查询快照。在对话中请求“查询销售指标并生成快照”，随后刷新。' : kind === 'analyses' ? '从查询快照选择“保存分析”。' : '从已保存分析选择“加入驾驶舱”。'}</Typography.Paragraph>}
  </Space>;
  return <ConfigProvider theme={{ algorithm: theme.darkAlgorithm, token: antdSeedToken }}>
    <Button size="small" onClick={() => { setOpen(true); if (sessionId) void refresh(); }} aria-label="CRM 分析">CRM 分析</Button>
    {open && <Modal title={cockpit ? '驾驶舱 · CRM 分析引用' : 'CRM 分析'} open width={960} footer={null} destroyOnHidden
      maskClosable={!busy && !candidate} closable={!busy && !candidate} keyboard={!busy && !candidate} onCancel={clear}>
      <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        <Typography.Paragraph>仅展示当前对话所连接账号的私有分析。保存与引用保留查询当时的结果，重新查数会生成新的快照。</Typography.Paragraph>
        {!sessionId ? <Alert type="info" message="请先打开一个对话并连接 CRM，再查看私有分析。" /> : <Button disabled={busy || !!candidate} onClick={() => void refresh()} loading={busy}>刷新 CRM 分析</Button>}
        {message && !candidate && <Alert type="error" message={message} />}
        <Tabs defaultActiveKey={cockpit ? 'references' : 'snapshots'} items={[
          { key: 'snapshots', label: '查询快照', children: list('snapshots') },
          { key: 'analyses', label: '已保存分析', children: list('analyses') },
          { key: 'references', label: '驾驶舱引用', children: list('references') },
        ]} />
      </Space>
    </Modal>}
    {candidate && <Modal title={candidate.analysis ? '确认加入驾驶舱' : '确认保存分析'} open confirmLoading={busy}
      okText={command ? '重试并核对结果' : candidate?.analysis ? '确认加入' : '确认保存'} cancelText={command ? '稍后刷新核对' : '取消'}
      okButtonProps={{ disabled: busy || (!candidate?.analysis && !title.trim()) }} cancelButtonProps={{ disabled: busy }}
      maskClosable={!busy} closable={!busy} keyboard={!busy} onOk={() => void confirm()}
      onCancel={() => { setCandidate(null); setCommand(null); commandRef.current = null; }}>
      {candidate && <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        {message && <Alert type="error" message={message} />}
        {candidate.analysis ? <Typography.Paragraph>将“{candidate.analysis.title}”的固定结果加入当前账号的驾驶舱引用。</Typography.Paragraph>
          : <label>分析标题<Input aria-label="分析标题" value={title} maxLength={120} disabled={busy || !!command} onChange={event => setTitle(event.target.value)} /></label>}
        <CrmSnapshotFacts snapshot={candidate.snapshot} />
      </Space>}
    </Modal>}
  </ConfigProvider>;
}
