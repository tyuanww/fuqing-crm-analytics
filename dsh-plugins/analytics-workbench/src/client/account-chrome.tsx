import { useState } from 'react';
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
import { openNativeAccountSettings } from './native-account-settings.mjs';

type LoginProps = PropsRuntime<'sidebar.footer.action'>;

export const accountCss = `
.sm-login {
  display:flex; align-items:center; justify-content:flex-start; gap:8px; box-sizing:border-box;
  flex:1; width:auto; height:36px; min-height:36px; padding:0 10px; border:0; border-radius:10px;
  background:color-mix(in srgb, var(--dsw-alias-bg-layer-1, Canvas) 82%, transparent);
  color:var(--dsw-alias-label-primary,CanvasText);
  box-shadow:inset 0 0 0 0.75px var(--dsw-alias-border-l3, color-mix(in srgb, Canvas 40%, transparent));
  font:var(--dsw-font-s-14,14px/22px inherit); cursor:pointer;
  transition:background-color 160ms ease-out, box-shadow 160ms ease-out;
}
.sm-login:hover:not(:disabled) {
  background:color-mix(in srgb, var(--dsw-alias-bg-layer-2, Canvas) 88%, transparent);
  box-shadow:inset 0 0 0 0.75px var(--dsw-alias-border-l2, CanvasText);
}
.sm-login:active:not(:disabled) { filter:brightness(.96); }
.sm-login:focus-visible {
  outline:2px solid var(--dsw-alias-brand-primary, CanvasText);
  outline-offset:2px;
}
.sm-login:disabled { opacity:.45; cursor:not-allowed; }
.sm-login[data-wide="0"] {
  width:36px; min-width:36px; flex:none; padding:0; justify-content:center; border-radius:18px; gap:0;
}
.sm-login[data-state="error"] { color:var(--dsw-alias-state-error-primary, CanvasText); }
.sm-login-text { overflow:hidden; white-space:nowrap; text-overflow:ellipsis; }
.sm-login[data-wide="0"] .sm-login-text { display:none; }
.sm-native-account-notice {
  max-width:100%;
  color:var(--dsw-alias-state-error-primary, CanvasText);
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
