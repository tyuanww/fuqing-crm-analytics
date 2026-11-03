export type PagePackage = {
  html: string;
  css: string;
  js: string;
  resources: unknown[];
  node_map: unknown[];
};
export type BindingManifest = {
  bindings: Array<{ binding_id: string; result_ref: string; node_id?: string; data_ref?: string; mode?: 'summary' | 'page' | 'range' }>;
  result_refs: string[];
};
export type PageGenerateExtras = {
  designGuide?: unknown;
  skill?: unknown;
  requestId?: string;
  sessionId?: string;
  signal?: AbortSignal;
  timeoutMs?: number;
  package?: unknown;
};
export type PagePackageWaiter = {
  deliver(requestId: string, outcome: PagePackage | { package: PagePackage; binding_manifest?: unknown } | Error | null): boolean;
  wait(requestId: string, signal?: AbortSignal, timeoutMs?: number): Promise<PagePackage | { package: PagePackage; binding_manifest?: unknown } | null>;
  cancelAll(): void;
  readonly pendingCount: number;
};
export function normalizePagePackage(pkg: unknown): PagePackage | null;
export function extractPagePackage(source: unknown): PagePackage | null;
export function extractBindingManifest(source: unknown): BindingManifest;
export function nativeGenerateUnavailable(message?: string): Error & { code: 'NATIVE_GENERATE_UNAVAILABLE' };
export function createPagePackageWaiter(): PagePackageWaiter;
export function createNativePageGenerate(options?: {
  submitPrompt?: (prompt: string, extras?: PageGenerateExtras) => Promise<unknown> | unknown;
  waiter?: PagePackageWaiter;
}): (prompt: string, extras?: PageGenerateExtras) => Promise<PagePackage>;
