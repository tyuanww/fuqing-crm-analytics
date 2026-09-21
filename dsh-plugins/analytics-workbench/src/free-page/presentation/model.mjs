/** Declarative edits: identity and presentation data, never user-authored executable code. */
import { sha256Hex } from '../hash.mjs';
export const STYLE_PROPERTIES = new Set(('color background-color font-size font-weight font-style font-family line-height letter-spacing text-align text-decoration white-space border border-color border-width border-style border-radius padding padding-top padding-right padding-bottom padding-left margin margin-top margin-right margin-bottom margin-left display gap row-gap column-gap grid-template-columns flex-direction flex-wrap align-items justify-content order max-width min-width width').split(' '));
const KEYS = new Set(['id', 'data-node', 'data-page-block', 'data-page-field', 'class', 'text']);
export function sourceHash(pkg) { return sha256Hex(JSON.stringify([pkg.html, pkg.css ?? '', pkg.js ?? ''])); }
export function targetId(target) {
  const key = value => value ? [value.attribute, value.value] : null;
  return JSON.stringify([key(target.anchor), target.path.map(part => [part.tag, key(part.key)])]);
}
export function validTarget(target) {
  const key = k => k && Object.keys(k).length === 2 && KEYS.has(k.attribute) && typeof k.value === 'string'
    && (k.attribute === 'text' ? k.value.length <= 2000 && k.value.trim() : /^[A-Za-z][A-Za-z0-9_.:-]{0,159}$/.test(k.value));
  return Boolean(target && key(target.anchor) && !['class', 'text'].includes(target.anchor.attribute) && Array.isArray(target.path) && target.path.length <= 64
    && target.path.every(p => p && Object.keys(p).every(k => ['tag', 'key'].includes(k)) && typeof p.tag === 'string' && p.tag.length <= 80
      && /^[a-z][a-z0-9-]*$/.test(p.tag) && (p.key == null || key(p.key))));
}
export function validatePresentation(value, pkg) {
  if (value == null) return true;
  // Pydantic accepts omitted defaults. Frozen AI candidates retain the input
  // bytes, so previews must accept those same optional fields before saving.
  const edits = value.edits === undefined ? [] : value.edits;
  if (!value || Object.keys(value).some(k => !['version','source_hash','edits'].includes(k)) || (value.version === undefined ? 1 : value.version) !== 1 || value.source_hash !== sourceHash(pkg)
    || !Array.isArray(edits) || edits.length > 2000) return false;
  const ids = new Set();
  return edits.every(edit => {
    if (!edit || Object.keys(edit).some(k => !['target','text','style'].includes(k)) || !validTarget(edit.target)
      || !edit.target || Object.keys(edit.target).some(k => !['anchor','path'].includes(k)) || ids.has(targetId(edit.target))) return false;
    ids.add(targetId(edit.target));
    if (edit.text != null && (typeof edit.text !== 'string' || edit.text.length > 20000)) return false;
    const style = edit.style === undefined ? {} : edit.style;
    if (!style || Array.isArray(style) || typeof style !== 'object' || Object.keys(style).length > 32) return false;
    if (edit.text == null && !Object.keys(style).length) return false;
    return Object.entries(style).every(([k,v]) => STYLE_PROPERTIES.has(k) && typeof v === 'string' && v.length > 0 && v.length <= 160
      && /^[A-Za-z0-9#.,%() /+\-]+$/.test(v) && !/url|expression|var\s*\(|!important/i.test(v));
  });
}
