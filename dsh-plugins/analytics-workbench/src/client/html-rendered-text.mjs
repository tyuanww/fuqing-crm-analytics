/** Compatibility entry for the versioned presentation model. */
import { sha256Hex } from '../free-page/hash.mjs';
import { sourceHash, validTarget, targetId, validatePresentation } from '../free-page/presentation/model.mjs';
export const renderedPackageHash = pkg => sha256Hex(JSON.stringify([pkg.html, pkg.css ?? '', pkg.js ?? '', pkg.presentation ?? null]));
export const validRenderedLocator = validTarget;
export function renderedTextPreview(pkg, node, replacement, manifest) {
  if (manifest?.bindings?.length || manifest?.result_refs?.length || !validTarget(node?.runtime)
    || node.runtime.package_hash !== renderedPackageHash(pkg) || node.editableText !== true
    || typeof replacement !== 'string' || replacement.length > 20000 || !validatePresentation(pkg.presentation, pkg)) {
    throw new Error('选区或内容来源已变化，请重新选择。');
  }
  const { anchor, path } = node.runtime, target = { anchor, path };
  const edits = structuredClone(pkg.presentation?.edits ?? []);
  const prior = edits.find(edit => targetId(edit.target) === targetId(target));
  if (prior) prior.text = replacement; else edits.push({ target, text: replacement, style: {} });
  const presentation = { version: 1, source_hash: sourceHash(pkg), edits };
  if (!validatePresentation(presentation, pkg)) throw new Error('文案修改超过上限或定位无效。');
  return { ...pkg, presentation };
}
