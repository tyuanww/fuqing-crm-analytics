export function openNativeHtmlArtifact(sidebarRight: {
  readonly mounted: { getSnapshot(): string | undefined; subscribe(listener: () => void): () => void };
  openResource(address: string): void;
}, sessionId: string, address: string, options?: { timeoutMs?: number; signal?: AbortSignal }): Promise<void>;
