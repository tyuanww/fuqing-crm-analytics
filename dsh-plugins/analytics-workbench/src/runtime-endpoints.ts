/** Kernel and bridge origins resolved from the plugin Config first, then the transitional B0 port block.
 *
 * P3-2: no caller builds a port literal. `baseUrl` (kernel) and `bridgeUrl`
 * (Host bridge the kernel calls back) come from the rc.5 plugin Config; when a
 * deployment has not set them yet, the existing isolated `B0_PORT_BASE` block
 * still applies so the current profiles keep working. The deployment tokens
 * follow the same precedence (`Config.runtimeToken` / `Config.gatewayToken`
 * before `B0_RUNTIME_TOKEN` / `B0_GATEWAY_TOKEN`).
 *
 * This module is the only Host module that reads those deployment values, and
 * it must never be imported by the browser bundle.
 */
import { parseLoopbackOrigin, parseNativeConfig } from './config.mjs';
import { acpCallbackEnabled } from './acp-callback.mjs';
import {
  NATIVE_BASE_URL_SOURCES, NATIVE_BOUNDS, kernelSurface, bridgeSurface,
  type NativeFamily,
} from './native-tools.mjs';
import { runtimeFamily } from './runtime-family.mjs';

export { NATIVE_BASE_URL_SOURCES, NATIVE_BOUNDS };

/** Transitional isolated port blocks. `Config.baseUrl` replaces them per deployment. */
export const LEGACY_PORT_BASES = Object.freeze([4315, 4325, 4335]);

export type NativeOriginSource = 'config' | 'acp-env' | 'legacy-env' | 'legacy-default' | 'legacy-derived';

export interface NativeRuntime {
  family: NativeFamily;
  kernelOrigin: string;
  bridgeOrigin: string;
  kernelSource: NativeOriginSource;
  bridgeSource: NativeOriginSource;
  runtimeToken: string | undefined;
  gatewayToken: string | undefined;
}

export function runtimePortBase(): number {
  const raw = process.env.B0_PORT_BASE ?? '4315';
  if (!['4315', '4325', '4335'].includes(raw)) throw new Error('Invalid isolated analytics port block');
  return Number(raw);
}

function portOf(origin: string): number {
  return Number(new URL(origin).port);
}

/** Resolve both origins and both capabilities. Config wins over the legacy environment. */
export function resolveNativeRuntime(config: unknown = {}, family: NativeFamily = runtimeFamily()): NativeRuntime {
  const parsed = parseNativeConfig(config);
  const acp = acpCallbackEnabled();
  let kernelOrigin: string;
  let kernelSource: NativeOriginSource;
  if (parsed.baseUrl !== undefined) {
    kernelOrigin = parsed.baseUrl;
    kernelSource = 'config';
  } else if (acp) {
    // The kernel appends this scoped origin when it spawns the ACP child. It is
    // never inherited from the kernel's ambient environment.
    kernelOrigin = parseLoopbackOrigin(process.env.B0_ACP_BASE_URL, 'B0_ACP_BASE_URL');
    kernelSource = 'acp-env';
  } else {
    kernelOrigin = `http://127.0.0.1:${runtimePortBase()}`;
    kernelSource = process.env.B0_PORT_BASE === undefined ? 'legacy-default' : 'legacy-env';
  }
  let bridgeOrigin: string;
  let bridgeSource: NativeOriginSource;
  if (parsed.bridgeUrl !== undefined) {
    bridgeOrigin = parsed.bridgeUrl;
    bridgeSource = 'config';
  } else if (acp) {
    // The tools-only ACP child never calls the Host bridge. Keep the field
    // well-formed without deriving a port the deployment does not own.
    bridgeOrigin = kernelOrigin;
    bridgeSource = 'acp-env';
  } else {
    bridgeOrigin = `http://127.0.0.1:${portOf(kernelOrigin) + NATIVE_BASE_URL_SOURCES.bridge.legacyPortOffset}`;
    bridgeSource = 'legacy-derived';
  }
  return {
    family,
    kernelOrigin,
    bridgeOrigin,
    kernelSource,
    bridgeSource,
    runtimeToken: parsed.runtimeToken
      ?? (acp ? process.env.B0_ACP_RUNTIME_TOKEN || undefined : process.env.B0_RUNTIME_TOKEN || undefined),
    gatewayToken: parsed.gatewayToken ?? (process.env.B0_GATEWAY_TOKEN || undefined),
  };
}

/** Kernel surface URL for the resolved family. Unknown ids/families fail closed. */
export function kernelUrl(runtime: NativeRuntime, surfaceId: string): string {
  return runtime.kernelOrigin + kernelSurface(runtime.family, surfaceId).path;
}

/** Bridge surface URL. The bridge serves these; parity checks and tests use it. */
export function bridgeUrl(runtime: NativeRuntime, surfaceId: string): string {
  return runtime.bridgeOrigin + bridgeSurface(surfaceId).path;
}
