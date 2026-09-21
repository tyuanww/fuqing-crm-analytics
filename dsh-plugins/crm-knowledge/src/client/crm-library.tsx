import { useEffect, useRef, useState } from 'react';
import { Alert, Button, Card, ConfigProvider, Descriptions, Input, Modal, Space, Tabs, Tag, Typography, theme } from 'antd';
import type { components } from '../dashboard-contract.generated.js';
import { antdSeedToken } from '../../../analytics-workbench/src/client/competition-shell/tokens';
import { CrmBoardCanvas, CrmBoardCard, CrmBoardEditor } from './crm-board';

type Snapshot = components['schemas']['CrmSnapshot'];
type Analysis = components['schemas']['CrmAnalysis'] & { description?: string; revision?: number; updated_at?: string };
type Library = components['schemas']['CrmLibrary'];
type Summary = { analysis_id: string; title: string; description: string; saved_at: string; updated_at: string; revision: number; snapshot_id: string; access: string };
type BoardSummary = { board_id: string; title: string; description: string; component_count: number; revision: number };
type Board = { board_id: string; title: string; description: string; revision: number; saved_at: string; components: Array<Record<string, unknown>> };
type Grant = { username: string; granted_at: string };
type Command =
  | { operation: 'save'; snapshot_id: string; title: string; key: string }
  | { operation: 'pin'; analysis_id: string; key: string }
  | { operation: 'patch'; analysis_id: string; title: string; description: string; base_revision: number; key: string }
  | { operation: 'share'; analysis_id: string; username: string; key: string }
  | { operation: 'unshare'; analysis_id: string; username: string; key: string }
  | { operation: 'save_board'; title: string; description: string; components: unknown[]; key: string }
  | { operation: 'patch_board'; board_id: string; title: string; description: string; components: unknown[]; base_revision: number; key: string };
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
  if (!snapshot?.result?.filters) return null;
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
  const [page, setPage] = useState<{ items: Summary[]; next_cursor: string | null }>({ items: [], next_cursor: null });
  const [boards, setBoards] = useState<{ items: BoardSummary[]; next_cursor: string | null }>({ items: [], next_cursor: null });
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [candidate, setCandidate] = useState<Candidate | null>(null);
  const [title, setTitle] = useState('');
  const [command, setCommand] = useState<Command | null>(null);
  const [editor, setEditor] = useState<Analysis | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [sharing, setSharing] = useState<Analysis | null>(null);
  const [grants, setGrants] = useState<Grant[]>([]);
  const [shareUser, setShareUser] = useState('');
  const [boardEditor, setBoardEditor] = useState<Board | null | 'new'>(null);
  const [openBoard, setOpenBoard] = useState<Board | null>(null);
  const [picked, setPicked] = useState<Analysis[]>([]);
  const [viewing, setViewing] = useState<Analysis | null>(null);
  const pending = useRef<AbortController | null>(null);
  const commandRef = useRef<Command | null>(null);
  const retries = useRef(new Map<string, Command>());
  function retry(slot: string, same: (cmd: Command) => boolean, make: () => Command) {
    const prior = retries.current.get(slot);
    if (prior && same(prior)) return prior;
    const request = make();
    retries.current.set(slot, request);
    return request;
  }
  function finish(slot: string) { retries.current.delete(slot); }
  function clear() {
    pending.current?.abort(); setData(null); setCandidate(null); setCommand(null); commandRef.current = null;
    retries.current.clear(); setBusy(false); setOpen(false); setMessage(''); setEditor(null); setSharing(null);
    setBoardEditor(null); setOpenBoard(null); setViewing(null);
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
  async function run<T>(payload: Record<string, unknown>) {
    pending.current?.abort(); const controller = new AbortController(); pending.current = controller;
    setBusy(true); setMessage('');
    try { return await call(payload, controller.signal) as T; }
    catch (error) {
      if (!controller.signal.aborted) setMessage(error instanceof Error ? error.message : '读取失败，请重试。');
      throw error;
    } finally { if (!controller.signal.aborted) setBusy(false); }
  }
  async function refresh() {
    pending.current?.abort(); const controller = new AbortController(); pending.current = controller;
    setBusy(true); setMessage(''); setData(null);
    try {
      const [library, analyses, boardPage] = await Promise.all([
        call({ operation: 'library' }, controller.signal),
        call({ operation: 'search', q: query, cursor: '', limit: 20, scope: 'all' }, controller.signal),
        call({ operation: 'boards', q: '', cursor: '', limit: 20 }, controller.signal),
      ]);
      if (!controller.signal.aborted) {
        setData(library); setPage({ items: analyses.items, next_cursor: analyses.next_cursor });
        setBoards({ items: boardPage.items, next_cursor: boardPage.next_cursor });
      }
    } catch (error) { if (!controller.signal.aborted) setMessage(error instanceof Error ? error.message : '读取失败，请重试。'); }
    finally { if (!controller.signal.aborted) setBusy(false); }
  }
  useEffect(() => {
    if (!open || candidate || editor || sharing || boardEditor) return;
    const check = () => { void refresh(); };
    window.addEventListener('focus', check);
    return () => window.removeEventListener('focus', check);
  }, [open, candidate, editor, sharing, boardEditor, sessionId, query]);
  function choose(value: Candidate) {
    if (!value?.snapshot?.result?.filters) return;
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
  async function loadMore() {
    if (!page.next_cursor) return;
    try {
      const extra = await run<{ items: Summary[]; next_cursor: string | null }>({ operation: 'search', q: query, cursor: page.next_cursor, limit: 20, scope: 'all' });
      setPage({ items: [...page.items, ...extra.items], next_cursor: extra.next_cursor });
    } catch { /* message already set */ }
  }
  async function searchNow() {
    try {
      const extra = await run<{ items: Summary[]; next_cursor: string | null }>({ operation: 'search', q: query, cursor: '', limit: 20, scope: 'all' });
      setPage({ items: extra.items, next_cursor: extra.next_cursor });
    } catch { /* message already set */ }
  }
  async function openAnalysis(analysisId: string, next: 'edit' | 'share' | 'pin' | 'board' | 'view') {
    try {
      const analysis = await run<Analysis>({ operation: 'get', analysis_id: analysisId });
      if (next === 'view') { setViewing(analysis); return; }
      if (next === 'edit') { setEditor(analysis); setEditTitle(analysis.title); setEditDescription(analysis.description ?? ''); }
      if (next === 'share') {
        setSharing(analysis);
        const listed = await run<{ grants: Grant[] }>({ operation: 'shares', analysis_id: analysisId });
        setGrants(listed.grants);
      }
      if (next === 'pin') choose({ snapshot: analysis.snapshot, analysis });
      if (next === 'board') {
        setPicked(current => current.some(item => item.analysis_id === analysis.analysis_id) ? current : [...current, analysis]);
        setBoardEditor(current => current ?? 'new');
      }
    } catch { /* message already set */ }
  }
  async function saveEdit() {
    if (!editor) return;
    const slot = `patch:${editor.analysis_id}`;
    const request = retry(slot, cmd => cmd.operation === 'patch' && 'analysis_id' in cmd && cmd.analysis_id === editor.analysis_id, () => ({
      operation: 'patch', analysis_id: editor.analysis_id, title: editTitle.trim(), description: editDescription,
      base_revision: editor.revision ?? 1, key: crypto.randomUUID(),
    }));
    setCommand(request);
    try {
      await run(request);
      finish(slot); setCommand(null); setEditor(null); await refresh();
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'VERSION_CONFLICT') setMessage('分析已被更新，请刷新后基于最新版本继续。');
    }
  }
  async function saveShare(revoke?: string) {
    if (!sharing) return;
    const username = revoke || shareUser.trim();
    const operation = revoke ? 'unshare' : 'share';
    const slot = `${operation}:${sharing.analysis_id}:${username}`;
    const request = retry(slot, cmd => (cmd.operation === 'share' || cmd.operation === 'unshare') && cmd.username === username && cmd.operation === operation, () => (
      revoke
        ? { operation: 'unshare', analysis_id: sharing.analysis_id, username: revoke, key: crypto.randomUUID() }
        : { operation: 'share', analysis_id: sharing.analysis_id, username: shareUser.trim(), key: crypto.randomUUID() }
    ));
    setCommand(request);
    try {
      const listed = await run<{ grants: Grant[] }>(request);
      finish(slot); setCommand(null); setGrants(listed.grants); setShareUser('');
    } catch { /* keep this slot's key for retry */ }
  }
  async function openSavedBoard(boardId: string) {
    try {
      const board = await run<Board>({ operation: 'get_board', board_id: boardId });
      setOpenBoard(board); setBoardEditor(board);
    } catch { /* message already set */ }
  }
  async function saveBoard(payload: { title: string; description: string; components: unknown[]; base_revision?: number }) {
    const existing = typeof boardEditor === 'object' && boardEditor ? boardEditor : null;
    const slot = existing ? `patch_board:${existing.board_id}` : 'save_board:new';
    const request = retry(slot, cmd => existing ? cmd.operation === 'patch_board' && 'board_id' in cmd && cmd.board_id === existing.board_id : cmd.operation === 'save_board', () => (
      existing
        ? { operation: 'patch_board', board_id: existing.board_id, ...payload, base_revision: payload.base_revision ?? existing.revision, key: crypto.randomUUID() }
        : { operation: 'save_board', title: payload.title, description: payload.description, components: payload.components, key: crypto.randomUUID() }
    ));
    setCommand(request);
    try {
      const saved = await run<Board>(request);
      finish(slot); setCommand(null); setBoardEditor(null); setOpenBoard(saved); await refresh();
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'VERSION_CONFLICT') setMessage('组板已被更新，请刷新重开后再保存。');
    }
  }
  const analysisCards = page.items.map(item => <Card key={item.analysis_id} size="small" title={item.title}
    extra={item.access === 'shared' ? <Button disabled={busy} onClick={() => void openAnalysis(item.analysis_id, 'view')}>查看</Button>
      : <Space wrap>
      <Button disabled={busy} onClick={() => void openAnalysis(item.analysis_id, 'edit')}>编辑</Button>
      <Button disabled={busy} onClick={() => void openAnalysis(item.analysis_id, 'share')}>分享</Button>
      <Button disabled={busy} onClick={() => void openAnalysis(item.analysis_id, 'board')}>加入组板</Button>
      <Button disabled={busy} onClick={() => void openAnalysis(item.analysis_id, 'pin')}>加入驾驶舱</Button>
    </Space>}>
    <Typography.Paragraph>{item.description || '无说明'}</Typography.Paragraph>
    <Typography.Text type="secondary">{item.access === 'shared' ? '分享给我 · ' : ''}版本 {item.revision} · 快照 {item.snapshot_id}</Typography.Text>
  </Card>);
  const list = (kind: 'snapshots' | 'analyses' | 'references') => <Space direction="vertical" size="middle" style={{ width: '100%' }}>
    {kind === 'analyses' && <>
      <Space wrap>
        <Input data-testid="crm-analysis-search" aria-label="搜索分析" value={query} maxLength={80} disabled={busy}
          placeholder="标题、说明或分析编号" onChange={event => setQuery(event.target.value)} onPressEnter={() => void searchNow()} />
        <Button disabled={busy} onClick={() => void searchNow()}>查找</Button>
      </Space>
      {analysisCards}
      {page.next_cursor && <Button data-testid="crm-analysis-more" disabled={busy} onClick={() => void loadMore()}>更早的记录</Button>}
      {!page.items.length && <Typography.Paragraph>从查询快照选择“保存分析”，或输入标题查找更早的记录。</Typography.Paragraph>}
    </>}
    {kind === 'snapshots' ? <>
      {data?.snapshots_truncated && <Alert type="info" message="最近 20 个快照；保存为分析后可按标题检索全部历史。" />}
      {data?.snapshots.map(snapshot => <Card key={snapshot.snapshot_id} size="small" title="查询结果快照"
        extra={<Button disabled={busy} onClick={() => choose({ snapshot })}>保存分析</Button>}><CrmSnapshotFacts snapshot={snapshot} /></Card>)}
      {data && !data.snapshots.length && <Typography.Paragraph>尚无查询快照。在对话中请求“查询销售指标并生成快照”，随后刷新。</Typography.Paragraph>}
    </> : kind === 'references' ? <>
      {data?.references.map(ref => <Card key={ref.reference_id} size="small" title={ref.analysis.title}><CrmSnapshotFacts snapshot={ref.analysis.snapshot} />
        <Typography.Text type="secondary">引用分析 {ref.analysis.analysis_id} · {ref.reference_id}</Typography.Text></Card>)}
      {data && !data.references.length && <Typography.Paragraph>从已保存分析选择“加入驾驶舱”。</Typography.Paragraph>}
    </> : null}
  </Space>;
  const boardAnalyses = [
    ...picked,
    ...(data?.analyses ?? []).filter(item => !picked.some(row => row.analysis_id === item.analysis_id)),
  ];
  return <ConfigProvider theme={{ algorithm: theme.darkAlgorithm, token: antdSeedToken }}>
    <Button size="small" onClick={() => { setOpen(true); if (sessionId) void refresh(); }} aria-label="CRM 分析">CRM 分析</Button>
    {open && <Modal title={cockpit ? '驾驶舱 · CRM 分析引用' : 'CRM 分析'} open width={960} footer={null} destroyOnHidden
      maskClosable={!busy && !candidate && !editor && !sharing && !boardEditor && !viewing} closable={!busy && !candidate && !editor && !sharing && !boardEditor && !viewing}
      keyboard={!busy && !candidate && !editor && !sharing && !boardEditor && !viewing} onCancel={clear}>
      <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        <Typography.Paragraph>展示当前账号保存的分析，以及分享给当前账号的只读记录。保存与引用保留查询当时的结果，重新查数会生成新的快照。分享只发给明确的 CRM 账号，不生成公开链接。</Typography.Paragraph>
        {!sessionId ? <Alert type="info" message="请先打开一个对话并连接 CRM，再查看私有分析。" /> : <Button disabled={busy || !!candidate} onClick={() => void refresh()} loading={busy}>刷新 CRM 分析</Button>}
        {message && !candidate && !editor && !sharing && !boardEditor && <Alert type="error" message={message} />}
        <Tabs defaultActiveKey={cockpit ? 'references' : 'snapshots'} items={[
          { key: 'snapshots', label: '查询快照', children: list('snapshots') },
          { key: 'analyses', label: '已保存分析', children: list('analyses') },
          { key: 'boards', label: '指标组板', children: <Space direction="vertical" size="middle" style={{ width: '100%' }}>
            <Button data-testid="crm-new-board" disabled={busy} onClick={() => setBoardEditor('new')}>新建组板</Button>
            {boards.items.map(board => <CrmBoardCard key={board.board_id} board={board} onOpen={() => void openSavedBoard(board.board_id)} />)}
            {openBoard && !boardEditor && <CrmBoardCanvas board={openBoard as never} />}
            {!boards.items.length && <Typography.Paragraph>从已保存分析选择指标，组成可编辑组板。金额始终来自快照。</Typography.Paragraph>}
          </Space> },
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
    {viewing && <Modal title="分享给我的分析" open footer={null} onCancel={() => setViewing(null)}>
      <Space direction="vertical" style={{ width: '100%' }}>
        <Typography.Paragraph>{viewing.title}{viewing.description ? ` · ${viewing.description}` : ''}</Typography.Paragraph>
        <CrmSnapshotFacts snapshot={viewing.snapshot} />
        <Typography.Text type="secondary">只读。金额、分母和口径来自原快照。</Typography.Text>
      </Space>
    </Modal>}
    {editor && <Modal title="编辑分析" open confirmLoading={busy} okText={command ? '重试并核对结果' : '保存'} cancelText="取消"
      onOk={() => void saveEdit()} onCancel={() => { setEditor(null); setCommand(null); }}>
      <Space direction="vertical" style={{ width: '100%' }}>
        {message && <Alert type="error" message={message} />}
        <label>标题<Input data-testid="crm-edit-title" value={editTitle} maxLength={120} disabled={busy || !!command} onChange={event => setEditTitle(event.target.value)} /></label>
        <label>说明<Input.TextArea data-testid="crm-edit-description" value={editDescription} maxLength={500} disabled={busy || !!command} onChange={event => setEditDescription(event.target.value)} /></label>
        <CrmSnapshotFacts snapshot={editor.snapshot} />
      </Space>
    </Modal>}
    {sharing && <Modal title="分享分析" open footer={null} onCancel={() => { setSharing(null); setCommand(null); }}>
      <Space direction="vertical" style={{ width: '100%' }}>
        {message && <Alert type="error" message={message} />}
        <Typography.Paragraph>输入对方 CRM 账号。撤权后，其现有登录也不能再读取。</Typography.Paragraph>
        <Space>
          <Input data-testid="crm-share-user" value={shareUser} maxLength={64} disabled={busy} onChange={event => setShareUser(event.target.value)} />
          <Button type="primary" loading={busy} disabled={!shareUser.trim()} onClick={() => void saveShare()}>分享</Button>
        </Space>
        {grants.map(grant => <Space key={grant.username}><Typography.Text>{grant.username}</Typography.Text>
          <Button disabled={busy} onClick={() => void saveShare(grant.username)}>撤销</Button></Space>)}
      </Space>
    </Modal>}
    {boardEditor && <Modal title={boardEditor === 'new' ? '新建组板' : '编辑组板'} open width={960} footer={null}
      maskClosable={!busy} closable={!busy} onCancel={() => { setBoardEditor(null); setCommand(null); }}>
      <CrmBoardEditor analyses={boardAnalyses as never} board={boardEditor === 'new' ? null : boardEditor as never}
        busy={busy} message={message} onSave={payload => void saveBoard(payload)} onCancel={() => { setBoardEditor(null); setCommand(null); }}
        onPick={() => setMessage('请在“已保存分析”选择“加入组板”。')} />
    </Modal>}
  </ConfigProvider>;
}
