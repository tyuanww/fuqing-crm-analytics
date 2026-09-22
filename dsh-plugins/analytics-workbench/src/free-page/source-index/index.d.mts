export const SCHEMA_VERSION: 'free-page-source-index/v1';
export const IDENTITY_PATTERN: RegExp;
export const MAPPING_STALE: { code: 'MAPPING_STALE'; http: 409 };

export type NodeKind = 'static_element' | 'dynamic_region';
export type HtmlRange = {
  start: number;
  inner_start: number;
  inner_end: number;
  end: number;
  inner_text: string;
  outer_text: string;
};
export type IndexedNode = {
  node_id: string;
  kind: NodeKind;
  selector: string;
  tag: string;
  html_range: HtmlRange;
  mapping_token: string;
  unique_selector: boolean;
  css_rules: ReadonlyArray<{ selector: string; body: string; start: number; end: number; text: string }>;
  js_ranges: ReadonlyArray<{ start: number; end: number; needle: string }>;
};
export type SourceIndex = {
  schema_version: 'free-page-source-index/v1';
  version_hash: string;
  nodes: { readonly [nodeId: string]: IndexedNode };
  duplicates: readonly string[];
  untrusted_markers: readonly string[];
  missing_from_dom: readonly string[];
  html: string;
  css: string;
  js: string;
};
export type Selection =
  | { kind: 'static_element'; node_id: string; mapping?: 'valid' | 'stale' | 'forged'; mapping_token?: string; version_hash?: string }
  | { kind: 'dynamic_region'; node_id: string; mapping?: 'valid' | 'stale' | 'forged'; mapping_token?: string; version_hash?: string }
  | { kind: 'whole_page'; user_switched?: boolean };

export function pageIdentity(value: unknown): boolean;
export function buildSourceIndex(pagePackage: object): SourceIndex;
export function rebuildSourceIndex(pagePackage: object): SourceIndex;
export function locateSelection(index: SourceIndex, selection: Selection): object;
export function isSelectorUniqueToNode(selector: string, node_id: string): boolean;

export const NODE_GRAPH_SCHEMA_VERSION: 'free-page-node-graph/v1';
export const MARKER_IS_CREDENTIAL: false;
export const NODE_GRAPH_BUDGETS: {
  readonly nodes2k: 2000;
  readonly nodes10k: 10000;
  readonly build2kMs: number;
  readonly build10kMs: number;
  readonly batchMs: number;
  readonly maxNodes: number;
  readonly maxBatchRecords: number;
  readonly maxFanout: number;
};
/** Sidecar identity. Not the T1 edit contract. */
export type NodeRef = {
  schema_version: string;
  identity: string;
  node_ref: string;
  kind: 'source' | 'template_instance' | 'dynamic_instance' | 'temporary';
  source_hash?: string;
  region_hash?: string;
  marker_is_credential?: false;
  [key: string]: unknown;
};
/**
 * Projection of a sidecar record onto the T1 edit NodeRef.
 * Channel is not a NodeRef field.
 */
export type EditNodeRef = {
  page_id: string;
  node_id: string;
  kind: 'static_element' | 'dynamic_region' | 'whole_page';
  selector: string | null;
  source_range: { start: number; end: number } | null;
  mapping_token: string;
  source_hash: string;
  region_hash: string;
};
export type ChannelPolicy = {
  presentation: boolean;
  source: boolean;
  logic: boolean;
  reason: string;
};
export function createSourceNodeRef(options?: object): NodeRef;
export function createTemplateInstanceRef(options?: object): NodeRef;
export function createDynamicInstanceRef(options?: object): NodeRef;
export function createTemporaryNodeRef(options?: object): NodeRef;
export function channelPolicy(node: object): ChannelPolicy;
export function packageSourceHash(pagePackage: object): string;
export function byteRegionHash(text: string): string;
export function toEditNodeRef(node: object, options?: { channel?: 'presentation' | 'source' | 'logic' }):
  | { ok: true; projection: 'node_map' | 'synthetic'; channel_policy: ChannelPolicy; reselect: false; value: EditNodeRef }
  | { ok: false; code: string; reselect?: boolean; channel_policy?: ChannelPolicy };
export function buildNodeGraph(pagePackage: object, options?: object): object;
export function rebuildNodeGraph(pagePackage: object, options?: object): object;
export function serializeNodeGraph(graph: object): object;
export function hydrateNodeGraph(pagePackage: object, sidecar: object, options?: object): object;
