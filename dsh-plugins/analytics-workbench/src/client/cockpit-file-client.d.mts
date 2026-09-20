export type CabinetFile = { file_id: string; filename: string; kind: string; version: number; size: number; sha256: string;
  origin: { kind: string; session_id?: string; path?: string; session_title?: string } };
import type { RailPlacement } from './cockpit-floating-rail.tsx';
export type CabinetPreferences = { rail_layout?: RailPlacement | null; removed: string[]; order: string[]; rail_width: number };
export type FileClientState = { preferences?: CabinetPreferences; preferencesReady?: boolean; organizing?: boolean; files: CabinetFile[]; status: string; message: string; busy: boolean;
  editor: { file_id: string; edit_key: string; script_url: string; config: Record<string, unknown> } | null;
  dirty: boolean; confirmationUncertain: boolean };
export const MAX_COCKPIT_FILE_BYTES: number;
export function createCockpitFileClient(http?: PageHttpOptions | null): {
  getSnapshot(): FileClientState; subscribe(listener: () => void): () => void; hasUnsavedChanges(): boolean;
  organize(change: { remove?: string; restore?: string; order?: string[]; rail_width?: number; rail_layout?: RailPlacement | null }): Promise<boolean>;
  refresh(): Promise<void>; upload(file: File, origin?: CabinetFile['origin']): Promise<CabinetFile | null>;
  read(fileId: string): Promise<ArrayBuffer>; openEditor(fileId: string): Promise<boolean>;
  changed(dirty: boolean): void; reportError(message: string): void; clearMessage(): void; closeEditor(): Promise<boolean>;
  save(): Promise<{ ok: boolean; reason?: string }>; persistForLeave(): Promise<{ ok: boolean; reason?: string }>;
  discardForLeave(): Promise<{ ok: boolean; message?: string; reason?: string }>; dispose(): void;
};
export type CockpitFileClient = ReturnType<typeof createCockpitFileClient>;
import type { PageHttpOptions } from './free-html-library/page-http.mjs';
