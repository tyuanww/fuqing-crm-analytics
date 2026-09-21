import { useMemo, useState } from 'react';
import { Alert, Button, Card, Input, InputNumber, Select, Space, Switch, Typography } from 'antd';
import { nextBlockId, nextLayout } from './crm-board-layout.mjs';

type Snapshot = { snapshot_id: string; captured_at: string; result: { filters: { start_date: string; end_date: string; channel: string }; gsv_amount_fen: number } };
type Analysis = { analysis_id: string; title: string; description?: string; revision: number; snapshot: Snapshot };
type BoardComponent = {
  block_id: string; title: string; analysis_id: string; snapshot_id: string; metric: string;
  layout: { x: number; y: number; w: number; h: number };
  display: { tone: string; density: string; value_format: string; show_coverage: boolean };
  filters?: Snapshot['result']['filters'];
  value?: { amount_fen: number | null; denominator: number | null; reason: string | null; count: number | null };
};
type Board = { board_id: string; title: string; description: string; revision: number; saved_at: string; components: BoardComponent[] };
type Draft = { block_id: string; title: string; analysis_id: string; snapshot_id: string; metric: string;
  layout: { x: number; y: number; w: number; h: number };
  display: { tone: string; density: string; value_format: string; show_coverage: boolean } };

const METRICS = [
  { value: 'gsv', label: 'GSV' }, { value: 'aov', label: 'AOV / 笔' }, { value: 'aus', label: 'AUS / 人' },
  { value: 'orders', label: '去重订单' }, { value: 'buyers', label: '去重买家' },
];
const money = (value: number | null | undefined) => {
  if (value == null) return '不可用';
  const absolute = BigInt(value) < 0n ? -BigInt(value) : BigInt(value);
  return `¥${value < 0 ? '-' : ''}${absolute / 100n}.${String(absolute % 100n).padStart(2, '0')}`;
};

export function CrmBoardCard({ board, onOpen }: { board: { board_id: string; title: string; description: string; component_count: number; revision: number }; onOpen(): void }) {
  return <Card size="small" title={board.title} extra={<Button data-testid="crm-open-board" onClick={onOpen}>编辑组板</Button>}>
    <Typography.Paragraph>{board.description || '无说明'}</Typography.Paragraph>
    <Typography.Text type="secondary">{board.component_count} 个指标 · 版本 {board.revision}</Typography.Text>
  </Card>;
}

export function CrmBoardCanvas({ board }: { board: Board }) {
  return <Space direction="vertical" style={{ width: '100%' }}>{board.components.map(item => <Card key={item.block_id} size="small" title={`${item.title} · ${METRICS.find(metric => metric.value === item.metric)?.label ?? item.metric}`}>
    <Typography.Text>{item.metric === 'orders' || item.metric === 'buyers' ? item.value?.count : money(item.value?.amount_fen ?? null)}</Typography.Text>
    {item.display.show_coverage && item.filters ? <Typography.Paragraph type="secondary">{item.filters.start_date} — {item.filters.end_date} · {item.filters.channel}</Typography.Paragraph> : null}
  </Card>)}</Space>;
}

export function CrmBoardEditor({ analyses, board, busy, message, onSave, onCancel, onPick }: {
  analyses: Analysis[]; board?: Board | null; busy: boolean; message: string;
  onSave(payload: { title: string; description: string; components: Draft[]; base_revision?: number }): void;
  onCancel(): void; onPick(): void;
}) {
  const [title, setTitle] = useState(board?.title ?? 'CRM 指标组板');
  const [description, setDescription] = useState(board?.description ?? '');
  const [components, setComponents] = useState<Draft[]>(() => (board?.components ?? []).map(item => ({
    block_id: item.block_id, title: item.title, analysis_id: item.analysis_id, snapshot_id: item.snapshot_id,
    metric: item.metric, layout: item.layout, display: item.display,
  })));
  const [selected, setSelected] = useState<string>(analyses[0]?.analysis_id ?? '');
  const [metric, setMetric] = useState('gsv');
  const lookup = useMemo(() => Object.fromEntries(analyses.map(item => [item.analysis_id, item])), [analyses]);
  function add() {
    const analysis = lookup[selected];
    if (!analysis || components.length >= 12) return;
    const label = METRICS.find(item => item.value === metric)?.label ?? metric;
    setComponents([...components, {
      block_id: nextBlockId(components.map(item => item.block_id)), title: `${analysis.title} · ${label}`, analysis_id: analysis.analysis_id,
      snapshot_id: analysis.snapshot.snapshot_id, metric, layout: nextLayout(components.map(item => item.layout)),
      display: { tone: 'neutral', density: 'comfortable', value_format: 'standard', show_coverage: true },
    }]);
  }
  return <Space direction="vertical" size="middle" style={{ width: '100%' }}>
    {message && <Alert type="error" message={message} />}
    <label>组板标题<Input data-testid="crm-board-title" value={title} maxLength={120} disabled={busy} onChange={event => setTitle(event.target.value)} /></label>
    <label>说明<Input.TextArea value={description} maxLength={500} disabled={busy} onChange={event => setDescription(event.target.value)} /></label>
    <Space wrap>
      <Select data-testid="crm-board-analysis" style={{ minWidth: 220 }} value={selected || undefined} onChange={setSelected}
        options={analyses.map(item => ({ value: item.analysis_id, label: item.title }))} />
      <Select style={{ minWidth: 140 }} value={metric} onChange={setMetric} options={METRICS} />
      <Button data-testid="crm-add-component" disabled={busy || !selected} onClick={add}>添加指标</Button>
      <Button onClick={onPick}>从分析库选择</Button>
    </Space>
    {components.map((item, index) => {
      const analysis = lookup[item.analysis_id];
      return <Card key={item.block_id} size="small" title={item.title} extra={<Button disabled={busy} onClick={() => setComponents(components.filter(row => row.block_id !== item.block_id))}>移除</Button>}>
        {analysis?.snapshot?.result?.filters ? <Typography.Paragraph>快照 {analysis.snapshot.snapshot_id} · {analysis.snapshot.result.filters.start_date} — {analysis.snapshot.result.filters.end_date} · {analysis.snapshot.result.filters.channel}</Typography.Paragraph>
          : <Typography.Text type="secondary">已绑定快照 {item.snapshot_id}</Typography.Text>}
        <Space wrap>
          <label>列<InputNumber min={0} max={9} value={item.layout.x} disabled={busy} onChange={value => {
            const layout = { ...item.layout, x: Number(value ?? 0) }; setComponents(components.map((row, i) => i === index ? { ...row, layout } : row));
          }} /></label>
          <label>行<InputNumber min={0} max={36} value={item.layout.y} disabled={busy} onChange={value => {
            const layout = { ...item.layout, y: Number(value ?? 0) }; setComponents(components.map((row, i) => i === index ? { ...row, layout } : row));
          }} /></label>
          <label>宽<InputNumber min={3} max={12} value={item.layout.w} disabled={busy} onChange={value => {
            const layout = { ...item.layout, w: Number(value ?? 4) }; setComponents(components.map((row, i) => i === index ? { ...row, layout } : row));
          }} /></label>
          <label>高<InputNumber min={3} max={12} value={item.layout.h} disabled={busy} onChange={value => {
            const layout = { ...item.layout, h: Number(value ?? 4) }; setComponents(components.map((row, i) => i === index ? { ...row, layout } : row));
          }} /></label>
          <label>密度<Select value={item.display.density} options={[{ value: 'comfortable', label: '舒适' }, { value: 'compact', label: '紧凑' }]}
            onChange={density => setComponents(components.map((row, i) => i === index ? { ...row, display: { ...row.display, density } } : row))} /></label>
          <label>覆盖<Switch checked={item.display.show_coverage} onChange={show_coverage => setComponents(components.map((row, i) => i === index ? { ...row, display: { ...row.display, show_coverage } } : row))} /></label>
        </Space>
      </Card>;
    })}
    <Space>
      <Button type="primary" data-testid="crm-save-board" loading={busy} disabled={!title.trim() || components.length === 0}
        onClick={() => onSave({ title: title.trim(), description, components, base_revision: board?.revision })}>保存组板</Button>
      <Button data-testid="crm-cancel-board" disabled={busy} onClick={onCancel}>取消</Button>
    </Space>
    <Typography.Text type="secondary">金额、分母和口径来自已保存快照，不能在组板中改写。取消不落盘。</Typography.Text>
  </Space>;
}
