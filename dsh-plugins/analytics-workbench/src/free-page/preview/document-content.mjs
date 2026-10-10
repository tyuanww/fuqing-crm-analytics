import { scanHtmlElements } from '../source-index/parse.mjs';

const commentsAndSpace = /^(?:\s|<!--[\s\S]*?-->)*$/;
const documentPrefix = /^(?:\s|<!--[\s\S]*?-->|<!doctype\s+html\s*>)*$/i;

/**
 * Project a complete document into the trusted preview wrapper without
 * serializing a DOM or rewriting the stored package/ranges/hash. Fragments and
 * malformed wrappers retain the existing breakout neutralization path.
 */
export function previewDocumentContent(value) {
  const html = String(value ?? '');
  if (!/^\s*(?:(?:<!--[\s\S]*?-->|<!doctype\s+html\s*>)\s*)*<html(?:\s|>)/i.test(html)) {
    return { htmlTag: '<html>', bodyTag: '<body>', content: html };
  }
  const elements = scanHtmlElements(html);
  const roots = elements.filter(node => node.tag === 'html' && node.depth === 0);
  const root = roots.length === 1 ? roots[0] : null;
  if (!root || !documentPrefix.test(html.slice(0, root.start)) || !commentsAndSpace.test(html.slice(root.end))) {
    return { htmlTag: '<html>', bodyTag: '<body>', content: html };
  }
  const children = elements.filter(node => node.depth === 1 && node.start > root.start && node.end < root.end);
  const bodies = children.filter(node => node.tag === 'body'), heads = children.filter(node => node.tag === 'head');
  if (bodies.length !== 1 || heads.length > 1 || children.some(node => !['head', 'body'].includes(node.tag))) {
    return { htmlTag: '<html>', bodyTag: '<body>', content: html };
  }
  const body = bodies[0], head = heads[0];
  if (head && head.end > body.start) return { htmlTag: '<html>', bodyTag: '<body>', content: html };
  const outside = html.slice(root.inner_start, head?.start ?? body.start)
    + html.slice(head?.end ?? body.start, body.start) + html.slice(body.end, root.inner_end);
  if (!commentsAndSpace.test(outside)) return { htmlTag: '<html>', bodyTag: '<body>', content: html };
  let headContent = head ? html.slice(head.inner_start, head.inner_end) : '';
  // Metadata belongs to the host wrapper. Ignore actual metadata tokens only;
  // the scanner skips comments and raw script/style/textarea/title bodies.
  const metadata = scanHtmlElements(headContent).filter(node => ['meta', 'base'].includes(node.tag));
  for (const node of metadata.sort((a, b) => b.start - a.start)) {
    headContent = headContent.slice(0, node.start) + headContent.slice(node.end);
  }
  return {
    htmlTag: html.slice(root.start, root.inner_start),
    bodyTag: html.slice(body.start, body.inner_start),
    content: headContent + html.slice(body.inner_start, body.inner_end),
  };
}
