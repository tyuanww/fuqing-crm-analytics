import type { AISourceSelection } from './html-source-selection.mjs';
import type { PageHttpOptions } from './free-html-library/page-http.mjs';
export type AIJob = { selection?: AISourceSelection | null; id: string; target_kind: 'file' | 'page'; target_id: string; base_version: number; filename: string;
  status: 'WAITING' | 'READY' | 'SAVED' | 'CANCELLED'; candidate_hash: string | null; saved_version: number | null;
  title?: string; bound?: boolean; session_id: string; workspace: string; source_name: string; output_name: string };
export type AIState = { jobs: AIJob[]; active: AIJob | null; busy: boolean; confirmationUncertain: boolean; message: string; messageError?: boolean;
  comparison: { text_diff: string; truncated: boolean; note: string; source_size: number; candidate_size: number } | null;
  previewVariant?: string | null; viewer: { script_url: string; config: Record<string, unknown> } | null;
  html: { html: string; css?: string; js?: string; resources?: unknown[] } | null };
export function nativeArtifactPrompt(job: AIJob): string;
export function createCockpitAIClient(http?: PageHttpOptions | null, adapters?: {
  openNative?(job: AIJob, submitSelection: boolean): Promise<void>;
  onSaved?(job: AIJob): Promise<void>;
}): {
  getSnapshot(): AIState; subscribe(listener: () => void): () => void; hasUnsavedChanges(): boolean;
  refresh(): Promise<void>; select(kind: string, id: string): void; begin(kind: string, id: string, version: number, selection?: AISourceSelection | null): Promise<boolean>;
  openConversation(): Promise<boolean>; collect(): Promise<boolean>; preview(variant?: string): Promise<boolean>;
  confirm(): Promise<{ ok: boolean }>; persistForLeave(): Promise<{ ok: boolean }>;
  discardForLeave(): Promise<{ ok: boolean }>; cancel(): Promise<boolean>; dispose(): void;
};
export type CockpitAIClient = ReturnType<typeof createCockpitAIClient>;
