/** Types for the hand-written rc.5 plugin Config (config.mjs). */

export interface NativeWorkbenchConfig {
  baseUrl?: string;
  bridgeUrl?: string;
  runtimeToken?: string;
  gatewayToken?: string;
  firstPurchaseCandidateDigest?: string;
}

export interface NativeConfigIssue {
  message: string;
  path: string[];
}

export declare const NATIVE_CONFIG_KEYS: readonly string[];

export declare function parseLoopbackOrigin(value: unknown, name?: string): string;

export declare function isLoopbackOrigin(value: unknown): boolean;

export declare function validateNativeConfig(value: unknown):
  { value: NativeWorkbenchConfig } | { issues: NativeConfigIssue[] };

export declare function parseNativeConfig(value: unknown): NativeWorkbenchConfig;

export declare const Config: {
  '~standard': {
    version: 1;
    vendor: string;
    validate: typeof validateNativeConfig;
  };
};
