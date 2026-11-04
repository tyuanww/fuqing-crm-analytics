import type { Context } from '@deepseek-ai/cordis';

export function apply(_ctx: Context): void {
  (globalThis as { __SHINE_CROWD_ACTION__?: boolean }).__SHINE_CROWD_ACTION__ = true;
}
