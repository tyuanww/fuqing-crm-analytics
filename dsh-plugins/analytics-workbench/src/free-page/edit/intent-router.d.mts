export const EDIT_INTENTS: readonly ['presentation', 'source_range', 'manual'];
export type EditIntentRoute = {
  intent: 'presentation' | 'source_range' | 'manual';
  mode: 'structured' | 'source' | 'manual' | 'readonly';
  reason: string;
  can_save: boolean;
};
export function routeEditIntent(input?: {
  instruction?: string;
  allowed_scope?: string;
  binding_state?: string;
  whole_page?: boolean;
}): EditIntentRoute;
