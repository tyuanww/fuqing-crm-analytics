export type NativeAccountSettingsResult =
  | { readonly ok: true; readonly action: 'account' | 'settings'; readonly fellBack?: boolean }
  | { readonly ok: false; readonly action: null; readonly code: 'NATIVE_ACCOUNT_CLICK_FAILED' | 'NATIVE_ACCOUNT_SETTINGS_NOT_FOUND'; readonly message: string };

export const NATIVE_ACCOUNT_SELECTOR: string;
export const NATIVE_SETTINGS_SELECTOR: string;
export function openNativeAccountSettings(root?: Pick<Document, 'querySelector'> | undefined): NativeAccountSettingsResult;
