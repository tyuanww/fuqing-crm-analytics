import { useState } from 'react';
import { defineStore, type PropsStore } from '@deepseek-ai/dsh-client-store';
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
import { openNativeAccountSettings } from './native-account-settings.mjs';

export function createAccountStore() {
  return defineStore({
    init: () => ({ menuOpen: false, themeOpen: false }),
    actions: {
      closeMenu: draft => { draft.menuOpen = false; },
      closeTheme: draft => { draft.themeOpen = false; },
      closeAll: draft => { draft.menuOpen = false; draft.themeOpen = false; },
    },
  });
}

type AccountStore = ReturnType<typeof createAccountStore>;
type AccountStoreProps = PropsStore<AccountStore>;
type LoginProps = PropsRuntime<'sidebar.footer.action'> & AccountStoreProps;
type ClosedChromeProps =
  | (PropsRuntime<'sidebar.footer.action'> & AccountStoreProps)
  | (PropsRuntime<'shell.overlay'> & AccountStoreProps);

const accountCss = `
[class*="footerActions"] { display:flex; flex-direction:row; align-items:center; gap:8px; }
[class*="footerActions"]:has(.sm-login[data-wide="0"]) {
  flex-direction:column; align-items:center; justify-content:center; gap:6px; width:auto;
}
html, body { min-height: 100%; background: #DCDCE1; }
:has(> [class*="sidebarCol"]) {
  background: rgba(255, 255, 255, 0.28) !important;
  backdrop-filter: blur(40px) saturate(1.15);
  -webkit-backdrop-filter: blur(40px) saturate(1.15);
}
[class*="centerCol"] {
  background: #fff !important;
  --dsw-alias-bg-base: #fff;
}
[class*="centerCol"] [data-conversation-scroll],
[class*="centerCol"] [data-composer-seat] { background: #fff; }
[class*="sidebarCol"] {
  background: rgba(255, 255, 255, 0.10) !important;
  color: #111111;
  -webkit-font-smoothing: antialiased;
  border-right: 0.5px solid rgba(0, 0, 0, 0.06) !important;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.45);
}
button[aria-label="发送消息"],
button[aria-label="排队发送"],
button[aria-label="插话发送"],
button[aria-label="停止生成"],
button[aria-label="停止对话"],
button[aria-label="Send message"],
button[aria-label="Queue message"],
button[aria-label="Steer message"],
button[aria-label="Stop generating"],
button[aria-label="Stop conversation"] {
  background: var(--dsw-alias-brand-primary, CanvasText) !important;
  color: #fff !important;
}
button[aria-label="发送消息"]:hover:not(:disabled),
button[aria-label="排队发送"]:hover:not(:disabled),
button[aria-label="插话发送"]:hover:not(:disabled),
button[aria-label="停止生成"]:hover:not(:disabled),
button[aria-label="停止对话"]:hover:not(:disabled),
button[aria-label="Send message"]:hover:not(:disabled),
button[aria-label="Queue message"]:hover:not(:disabled),
button[aria-label="Steer message"]:hover:not(:disabled),
button[aria-label="Stop generating"]:hover:not(:disabled),
button[aria-label="Stop conversation"]:hover:not(:disabled) {
  filter: brightness(1.08);
}
[class*="sidebarCol"] { font-weight: 500; }
html[data-ds-dark-theme], html[data-ds-dark-theme] body,
body[data-ds-dark-theme] { background: #2C2C2E; }
html[data-ds-dark-theme] :has(> [class*="sidebarCol"]),
body[data-ds-dark-theme] :has(> [class*="sidebarCol"]) { background: rgba(255, 255, 255, 0.06) !important; }
html[data-ds-dark-theme] [class*="centerCol"],
body[data-ds-dark-theme] [class*="centerCol"] {
  background: #120D1D !important;
  --dsw-alias-bg-base: #120D1D;
}
html[data-ds-dark-theme] [class*="centerCol"] [data-conversation-scroll],
html[data-ds-dark-theme] [class*="centerCol"] [data-composer-seat],
body[data-ds-dark-theme] [class*="centerCol"] [data-conversation-scroll],
body[data-ds-dark-theme] [class*="centerCol"] [data-composer-seat] { background: #120D1D; }
html[data-ds-dark-theme] [class*="sidebarCol"],
body[data-ds-dark-theme] [class*="sidebarCol"] {
  background: rgba(16, 14, 22, 0.18) !important;
  color: #F6F3F8;
  border-right-color: rgba(255, 255, 255, 0.12) !important;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.08);
}
.sm-login {
  display:flex; align-items:center; justify-content:flex-start; gap:8px; box-sizing:border-box;
  flex:1; width:auto; height:36px; min-height:36px; padding:0 10px; border:0; border-radius:10px;
  background:color-mix(in srgb, Canvas 22%, transparent);
  color:var(--dsw-alias-label-primary,CanvasText);
  box-shadow:inset 0 0 0 0.75px color-mix(in srgb, Canvas 40%, transparent);
  font:var(--dsw-font-s-14,14px/22px inherit); cursor:pointer;
}
.sm-login[data-wide="0"] {
  width:36px; min-width:36px; flex:none; padding:0; justify-content:center; border-radius:18px; gap:0;
}
.sm-login[data-state="error"] { color:var(--dsw-alias-label-error,#b42318); }
.sm-login-text { overflow:hidden; white-space:nowrap; text-overflow:ellipsis; }
.sm-login[data-wide="0"] .sm-login-text { display:none; }
.sm-native-account-notice {
  color:var(--dsw-alias-label-error,#b42318);
  font:var(--dsw-font-s-12,12px/18px inherit);
}
.sm-login[data-wide="0"] + .sm-native-account-notice {
  position:absolute; width:1px; height:1px; padding:0; margin:-1px; overflow:hidden;
  clip:rect(0,0,0,0); white-space:nowrap; border:0;
}
`;

function AccountIcon() {
  return <svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <circle cx="8" cy="5.2" r="2.4" stroke="currentColor" strokeWidth="1.4" />
    <path d="M3.2 13.2c.6-2.4 2.3-3.6 4.8-3.6s4.2 1.2 4.8 3.6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
  </svg>;
}

export function LoginFooter(props: LoginProps) {
  const [notice, setNotice] = useState('');
  const openOfficial = () => {
    const result = openNativeAccountSettings();
    if (result.ok) {
      setNotice('');
      return;
    }
    setNotice(result.message);
    console.warn(`analytics-workbench: ${result.code}: ${result.message}`);
  };
  return <><style>{accountCss}</style>
    <button type="button" className="sm-login" data-testid="shine-account-login"
      data-native-account-bridge="rc1" data-state={notice ? 'error' : 'ready'}
      data-wide={props.wide ? '1' : '0'}
      aria-label="账号与设置" aria-describedby={notice ? 'shine-native-account-notice' : undefined}
      title={notice || '打开 DSH 原生账号菜单（含设置）'} onClick={openOfficial}>
      <AccountIcon />
      <span className="sm-login-text">账号与设置</span>
    </button>
    {notice ? <span id="shine-native-account-notice" className="sm-native-account-notice" role="alert">{notice}</span> : null}
  </>;
}

export function ThemeFooter(_props: ClosedChromeProps) {
  return null;
}

export function AccountMenu(_props: ClosedChromeProps) {
  return null;
}
