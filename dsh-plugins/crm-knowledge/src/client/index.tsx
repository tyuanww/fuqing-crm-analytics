import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import type { Context } from '@deepseek-ai/cordis';
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client';
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client';
import type {} from '@deepseek-ai/dsh-api-session-controller/remote';
import type {} from '@deepseek-ai/dsh-api-workspace-controller/remote';
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
import { Alert, Button, ConfigProvider, Input, Modal, Space, Typography, theme } from 'antd';
import { antdSeedToken } from '../../../analytics-workbench/src/client/competition-shell/tokens';

const ENDPOINT = '/api/crm-knowledge/connection';
const FAILURES: Record<string, string> = {
  INVALID_REQUEST: '请检查账号和密码后重试。', SESSION_UNAVAILABLE: '当前对话已不可用，请重新选择对话。',
  HOST_AUTH_REQUIRED: '请重新打开本地 DSH 页面。', LOGIN_FAILED: 'CRM 账号或密码不正确。',
  LOGIN_LIMITED: '登录尝试过于频繁，请稍后再试。', SERVICE_UNAVAILABLE: 'CRM 服务暂不可用，请先确认看板可以打开。',
  LOGIN_BUSY: '连接正在处理中，请稍后重试。', ALREADY_CONNECTED: '当前对话已连接，请先断开再更换账号。',
  CONNECTION_LIMIT: '同时连接的对话已达上限，请先断开不再使用的连接。', CANCELLED: '本次连接已取消。',
};
type ConnectionState = { connected: boolean; username: string | null; expires_at: string | null };
const EMPTY: ConnectionState = { connected: false, username: null, expires_at: null };

/** Session-scoped native slot. Password lives in the form/request, never a host store. */
export function CrmConnectionDock({ sessionId }: Pick<PropsRuntime<'conversation.input.dock'>, 'sessionId'>) {
  const [state, setState] = useState<ConnectionState>(EMPTY);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const pending = useRef<AbortController | null>(null);
  const form = useRef<HTMLFormElement>(null);

  async function call(operation: 'status' | 'login' | 'disconnect', credentials?: { username: string; password: string }) {
    pending.current?.abort();
    const controller = new AbortController(); pending.current = controller;
    setBusy(true); setMessage('');
    try {
      const res = await fetch(ENDPOINT, {
        method: 'POST', credentials: 'same-origin', cache: 'no-store', signal: controller.signal,
        headers: { 'content-type': 'application/json', 'x-crm-ui': '1' },
        body: JSON.stringify({ operation, session_id: sessionId, ...credentials }),
      });
      if (credentials) credentials.password = '';
      if (res.status === 401 && operation !== 'login') throw new Error(FAILURES.HOST_AUTH_REQUIRED);
      const body = await res.json();
      if (controller.signal.aborted) return;
      if (!res.ok || !body.ok) throw new Error(FAILURES[body.code] ?? FAILURES.SERVICE_UNAVAILABLE);
      if (typeof body.connected !== 'boolean' || (body.connected && (typeof body.username !== 'string' || !/^[A-Za-z0-9_.@-]{1,64}$/.test(body.username)))) throw new Error(FAILURES.SERVICE_UNAVAILABLE);
      setState({ connected: body.connected, username: body.username, expires_at: body.expires_at });
      if (operation === 'login' || operation === 'disconnect') setOpen(false);
    } catch (error) {
      if (!controller.signal.aborted) setMessage(error instanceof Error && Object.values(FAILURES).includes(error.message) ? error.message : FAILURES.SERVICE_UNAVAILABLE);
    } finally {
      if (credentials) credentials.password = '';
      if (!controller.signal.aborted) setBusy(false);
    }
  }
  useEffect(() => {
    setState(EMPTY); setOpen(false); setMessage(''); void call('status');
    return () => { pending.current?.abort(); form.current?.reset(); };
  }, [sessionId]);
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const values = new FormData(event.currentTarget);
    const credentials = { username: String(values.get('username') ?? ''), password: String(values.get('password') ?? '') };
    const password = event.currentTarget.elements.namedItem('password');
    if (password instanceof HTMLInputElement) password.value = '';
    void call('login', credentials);
  }
  return <ConfigProvider theme={{ algorithm: theme.darkAlgorithm, token: antdSeedToken }}>
    <Space wrap style={{ padding: '8px 0' }}>
      <Button size="small" onClick={() => { setOpen(true); void call('status'); }}>
        {state.connected ? 'CRM 已连接' : '连接 CRM'}
      </Button>
      <Typography.Text type="secondary">{state.connected ? '本对话可查询看板 GSV' : '连接后可查询你的看板 GSV'}</Typography.Text>
      {!open && message && <Typography.Text type="danger" role="alert">{message}</Typography.Text>}
    </Space>
    <Modal title={state.connected ? '当前对话的 CRM 连接' : '连接 CRM 看板'} open={open} footer={null}
      destroyOnHidden maskClosable={!busy} closable={!busy} keyboard={!busy}
      onCancel={() => { form.current?.reset(); setOpen(false); setMessage(''); }}>
      <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        <Typography.Paragraph>此连接只用于当前对话，查询范围为你的 CRM 账号可查看的数据。</Typography.Paragraph>
        {message && <Alert type="error" showIcon message={message} />}
        {state.connected ? <>
          <Alert type="success" showIcon message={`已连接：${state.username}`} description="你可以返回对话，询问某个日期区间的看板 GSV。登录失效时会提示重新连接。" />
          <Button danger loading={busy} onClick={() => { void call('disconnect'); }}>断开当前连接</Button>
        </> : <form ref={form} onSubmit={submit}>
          <Space direction="vertical" size="middle" style={{ width: '100%' }}>
            <label>CRM 账号<Input name="username" autoComplete="username" maxLength={64} required disabled={busy} /></label>
            <label>CRM 密码<Input.Password name="password" autoComplete="current-password" required disabled={busy} /></label>
            <Typography.Text type="secondary">使用看板的登录账号。密码不会发送给 AI；关闭连接或服务重启后需要重新登录。</Typography.Text>
            <Button type="primary" htmlType="submit" loading={busy} block>登录并连接当前对话</Button>
          </Space>
        </form>}
      </Space>
    </Modal>
  </ConfigProvider>;
}

export const name = 'crm-knowledge-login-ui';
export const inject = ['slots'];
export function apply(ctx: Context) {
  ctx.slots.inject('conversation.input.dock', () => ctx.slots.register({
    name: 'conversation.input.dock', id: 'crm-knowledge.connection', order: 30,
  }, CrmConnectionDock));
}
