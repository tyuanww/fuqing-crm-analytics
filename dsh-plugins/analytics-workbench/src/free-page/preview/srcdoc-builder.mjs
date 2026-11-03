import { presentationRuntime } from '../presentation/runtime.mjs';
import { validatePresentation } from '../presentation/model.mjs';
import { FREE_PAGE_CSP } from '../runtime/isolation-policy.mjs';
import { pageBridgeBootstrap } from '../runtime/message-channel.mjs';
import { bytesToBase64 } from '../resource/bytes.mjs';
import { previewDocumentContent } from './document-content.mjs';

function neutralizeWrapperBreakout(html) {
  return String(html)
    .replace(/<\/(?=(?:html|head|body)(?:\s|>))/gi, '&lt;/')
    .replace(/<meta\b/gi, '&lt;meta');
}

function neutralizeStyle(css) {
  return String(css ?? '').replace(/<\/style/gi, '&lt;/style');
}

function neutralizeScript(js) {
  return String(js ?? '')
    .replace(/<\/script/gi, '<\\/script')
    .replace(/<\/(?=(?:html|head|body)(?:\s|>))/gi, '<\\/')
    .replace(/<meta\b/gi, '\\u003cmeta');
}

function safeMime(value, fallback = 'application/octet-stream') {
  if (typeof value === 'string' && /^[a-z0-9.+-]+\/[a-z0-9.+-]+$/i.test(value)) return value;
  return fallback;
}

function resourceHref(resource) {
  if (resource.href) return resource.href;
  const mime = safeMime(resource.mime);
  const base64 = resource.content_base64 || bytesToBase64(resource.bytes || new Uint8Array());
  return `data:${mime};base64,${base64}`;
}

function rewriteResources(source, resources) {
  let next = String(source ?? '');
  for (const resource of resources) {
    const href = resourceHref(resource);
    next = next.split(`resource:${resource.resource_id}`).join(href);
  }
  return next;
}

export function buildSrcdoc({
  html, css, js, presentation = null, resources = [], instanceId, pageId, version, nonce, allowScripts = true,
} = {}) {
  if (!validatePresentation(presentation, { html, css, js })) throw new Error('文案修改与页面来源不匹配。');
  const presentationScript = presentation?.edits?.length ? '<script>(' + presentationRuntime.toString() + ')(' + JSON.stringify(presentation.edits).replace(/</g, '\\u003c') + ');</script>' : '';
  const document = previewDocumentContent(html);
  const htmlTag = neutralizeWrapperBreakout(rewriteResources(document.htmlTag, resources));
  const bodyTag = neutralizeWrapperBreakout(rewriteResources(document.bodyTag, resources));
  const rewrittenHtml = neutralizeWrapperBreakout(rewriteResources(document.content, resources));
  const rewrittenCss = neutralizeStyle(rewriteResources(css, resources));
  const rewrittenJs = neutralizeScript(rewriteResources(js, resources));
  const bootstrap = pageBridgeBootstrap({ instanceId, pageId, version, nonce });
  const previewLinks = resources
    .filter((row) => row.preview && (row.type === 'style' || row.type === 'font'))
    .map((row) => (row.type === 'style'
      ? `<link rel="stylesheet" href="${resourceHref(row)}">`
      : `<style>@font-face{font-family:'fp-${row.resource_id}';src:url(${resourceHref(row)});}</style>`))
    .join('');
  const srcdoc = `<!doctype html>${htmlTag}<head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${FREE_PAGE_CSP}"><title>自由页面预览</title>${previewLinks}<style>${rewrittenCss}</style><script>${bootstrap}<\/script></head>${bodyTag}${rewrittenHtml}<script>${rewrittenJs}<\/script>${presentationScript}</body></html>`;
  if (!allowScripts && presentation?.edits?.length) {
    const Parser = globalThis.DOMParser ?? globalThis.window?.DOMParser;
    if (!Parser) throw new Error('Static presentation requires DOMParser');
    const projected = new Parser().parseFromString(srcdoc, 'text/html');
    presentationRuntime(presentation.edits, projected);
    return '<!doctype html>' + projected.documentElement.outerHTML;
  }
  return srcdoc;
}

export function previewResourceUrls(resources, createObjectUrl) {
  if (typeof createObjectUrl !== 'function') {
    return resources.map((row) => ({ ...row, href: resourceHref(row) }));
  }
  return resources.map((row) => {
    const blob = new Blob([row.bytes], { type: safeMime(row.mime) });
    return { ...row, href: createObjectUrl(blob), blob };
  });
}
