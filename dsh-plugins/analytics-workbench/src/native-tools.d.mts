/** Types for the single native surface binding table (native-tools.mjs). */

export type NativeFamily = 'b0' | 'channel_followup' | 'first_purchase' | 'competition_growth';
export type NativeSide = 'kernel' | 'bridge';
export type NativeTransport = 'gateway' | 'bridge' | 'acp';

export interface NativeSurfaceTool {
  name: string;
}

export interface NativeSurfaceRequest {
  models: Partial<Record<NativeFamily, string | null>> | null;
  fields: readonly string[];
}

export interface NativeSurfaceResponse {
  models: Partial<Record<NativeFamily, string | null>> | null;
  fields: readonly string[];
}

export interface NativeSurface {
  id: string;
  side: NativeSide;
  transport: NativeTransport;
  families: readonly NativeFamily[];
  method: 'GET' | 'POST';
  path: string;
  tool: NativeSurfaceTool | null;
  request: NativeSurfaceRequest | null;
  response: NativeSurfaceResponse | null;
}

export interface NativeToolsTable {
  schema_version: string;
  families: readonly NativeFamily[];
  baseUrlSources: {
    kernel: { config: string; legacyEnv: string; legacyPortBase: number; scheme: 'http'; host: '127.0.0.1' };
    bridge: { config: string; legacyPortOffset: number };
  };
  bounds: { payloadBytes: number; contextTimeoutMs: number; toolTimeoutMs: number };
  surfaces: readonly NativeSurface[];
}

export declare const NATIVE_TOOLS_SCHEMA: string;

export declare const NATIVE_FAMILIES: readonly NativeFamily[];

export declare const NATIVE_BASE_URL_SOURCES: NativeToolsTable['baseUrlSources'];

export declare const NATIVE_BOUNDS: NativeToolsTable['bounds'];

export declare const NATIVE_TOOLS: NativeToolsTable;

export declare function nativeSurface(id: string): NativeSurface;

export declare function kernelSurface(family: NativeFamily, id: string): NativeSurface;

export declare function bridgeSurface(id: string): NativeSurface;

export declare function toolSurface(toolName: string): NativeSurface;

export declare function assertToolBindings(family: NativeFamily, toolNames: readonly string[]): string[];
