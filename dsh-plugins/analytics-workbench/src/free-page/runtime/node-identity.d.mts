export const RUNTIME_IDENTITY_SCHEMA_VERSION: 'free-page-runtime-identity/v1';
export const NODE_GRAPH_BUDGETS: {
  readonly nodes2k: number;
  readonly nodes10k: number;
  readonly build2kMs: number;
  readonly build10kMs: number;
  readonly batchMs: number;
  readonly maxNodes: number;
  readonly maxBatchRecords: number;
  readonly maxFanout: number;
};

export type RuntimeRecord = {
  schema_version: 'free-page-runtime-identity/v1';
  identity: string;
  node_ref: unknown;
  node: object | null;
  state: 'connected' | 'resolved' | 'deleted' | 'missing' | 'disposed';
  metadata?: object;
  generation?: number;
};

export type RuntimeIdentityStore = {
  sourceRef(node: object, ref: unknown, metadata?: object): RuntimeRecord;
  templateRef(node: object, template: unknown, instanceKey: string, metadata?: object): RuntimeRecord;
  dynamicRef(node: object, dynamic: unknown, instanceKey: string, metadata?: object): RuntimeRecord;
  temporaryRef(node: object, key: string, metadata?: object): RuntimeRecord;
  source(node: object, ref: unknown, metadata?: object): RuntimeRecord;
  template(node: object, template: unknown, instanceKey: string, metadata?: object): RuntimeRecord;
  dynamic(node: object, dynamic: unknown, instanceKey: string, metadata?: object): RuntimeRecord;
  temporary(node: object, key: string, metadata?: object): RuntimeRecord;
  resolve(ref: unknown): RuntimeRecord | null;
  resolveLazy(ref: unknown, resolver?: (ref: unknown, identity: string) => unknown): Promise<RuntimeRecord | null>;
  observe(target: object, options?: object): { ok: boolean; reason?: string; degraded?: boolean; observer?: object };
  disconnect(): void;
  dispose(): void;
  suppress<T>(fn: () => T): T | undefined;
  markDeleted(nodeOrRef: unknown): readonly string[] | null;
  flush(): object | null;
  toSidecar(): object | null;
  readonly size: number;
  readonly disposed: boolean;
  readonly degraded: boolean;
  readonly degradeReason: string | null;
};

export function createRuntimeIdentityStore(options?: object): RuntimeIdentityStore;
export function createNodeIdentityStore(options?: object): RuntimeIdentityStore;
