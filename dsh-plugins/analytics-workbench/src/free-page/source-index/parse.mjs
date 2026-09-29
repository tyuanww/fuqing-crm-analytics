/** Source offsets for data-shine-* markers. No HTML parser dependency. */

const NODE_ATTR = /data-shine-node\s*=\s*(["'])([^"']+)\1/i;
const REGION_ATTR = /data-shine-region\s*=\s*(["'])([^"']+)\1/i;
const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);

export function isVoidHtmlTag(tag) {
  return VOID.has(String(tag || '').toLowerCase());
}

export function closeTagRange(html, tag, from) {
  return closeRange(html, String(tag || '').toLowerCase(), from);
}

function nextTagEnd(html, start) {
  let quote = null;
  for (let index = start; index < html.length; index += 1) {
    const char = html[index];
    if (quote) {
      if (char === quote) quote = null;
    } else if (char === '"' || char === "'") {
      quote = char;
    } else if (char === '>') {
      return index;
    }
  }
  return -1;
}

function skipRawBlock(html, start) {
  const tagEnd = nextTagEnd(html, start + 1);
  if (tagEnd < 0) return html.length;
  const open = html.slice(start, tagEnd + 1).match(/^<(script|style|template|textarea|title)\b/i);
  if (!open) return null;
  const close = new RegExp('</' + open[1] + '\\s*>', 'i').exec(html.slice(tagEnd + 1));
  return close ? tagEnd + 1 + close.index + close[0].length : html.length;
}

function nextTag(html, from) {
  let cursor = from;
  while (cursor < html.length) {
    const start = html.indexOf('<', cursor);
    if (start < 0) return null;
    if (html.startsWith('<!--', start)) {
      const commentEnd = html.indexOf('-->', start + 4);
      cursor = commentEnd < 0 ? html.length : commentEnd + 3;
      continue;
    }
    const skipped = skipRawBlock(html, start);
    if (skipped !== null) {
      cursor = skipped;
      continue;
    }
    const tagEnd = nextTagEnd(html, start + 1);
    if (tagEnd < 0) return null;
    const source = html.slice(start, tagEnd + 1);
    const match = source.match(/^<(\/?)([A-Za-z][\w:-]*)([\s\S]*?)(\/?)>$/);
    if (!match || source.startsWith('<!') || source.startsWith('<?')) {
      cursor = tagEnd + 1;
      continue;
    }
    return {
      start, end: tagEnd + 1, source, tag: match[2].toLowerCase(),
      attrs: match[3] ?? '', closing: match[1] === '/',
      selfClosing: match[4] === '/' || VOID.has(match[2].toLowerCase()),
    };
  }
  return null;
}

function closeRange(html, tag, from) {
  let depth = 1;
  let cursor = from;
  while (cursor < html.length) {
    const token = nextTag(html, cursor);
    if (!token) return null;
    cursor = token.end;
    if (token.tag !== tag) continue;
    if (token.closing) depth -= 1;
    else if (!token.selfClosing) depth += 1;
    if (depth === 0) return { inner_end: token.start, end: token.end };
  }
  return null;
}

export function scanShineMarkers(html) {
  if (typeof html !== 'string') return [];
  const found = [];
  let cursor = 0;
  while (cursor < html.length) {
    const token = nextTag(html, cursor);
    if (!token) break;
    cursor = token.end;
    if (token.closing) continue;
    const attrs = token.attrs;
    const node = attrs.match(NODE_ATTR);
    const region = attrs.match(REGION_ATTR);
    if (!node && !region) continue;
    const tag = token.tag;
    const start = token.start;
    const inner_start = token.end;
    const selfClosing = token.selfClosing;
    let inner_end = inner_start;
    let end = inner_start;
    if (selfClosing) {
      end = inner_start;
    } else {
      const closed = closeRange(html, tag, inner_start);
      if (!closed) continue;
      inner_end = closed.inner_end;
      end = closed.end;
    }
    if (node) {
      found.push(Object.freeze({
        attr: 'node',
        node_id: node[2],
        tag,
        start,
        inner_start,
        inner_end,
        end,
      }));
    }
    if (region) {
      found.push(Object.freeze({
        attr: 'region',
        node_id: region[2],
        tag,
        start,
        inner_start,
        inner_end,
        end,
      }));
    }
  }
  return found;
}

/**
 * Return element ranges for an unannotated HTML document. This is a small,
 * source-first scanner rather than a browser DOM parser: ranges point into the
 * original bytes and therefore can be kept in a sidecar without serialising a
 * mutated DOM back into the page package. It intentionally skips malformed or
 * unclosed elements and is safe to use as a best-effort historical-page index.
 */
export function scanHtmlElements(html) {
  if (typeof html !== 'string' || !html) return [];
  const starts = [];
  let cursor = 0;
  let token;
  while ((token = nextTag(html, cursor))) {
    cursor = token.end;
    if (token.closing) continue;
    const tag = token.tag;
    const selfClosing = token.selfClosing;
    const innerStart = token.end;
    let innerEnd = innerStart;
    let end = innerStart;
    if (!selfClosing) {
      const closed = closeRange(html, tag, innerStart);
      if (!closed) continue;
      innerEnd = closed.inner_end;
      end = closed.end;
    }
    starts.push({
      tag,
      start: token.start,
      inner_start: innerStart,
      inner_end: innerEnd,
      end,
    });
  }

  const sorted = starts.sort((a, b) => a.start - b.start || a.end - b.end);
  const completed = [];
  const siblingCounts = new Map();
  const stack = [];
  for (const item of sorted) {
    while (stack.length > 0 && stack[stack.length - 1].end <= item.start) stack.pop();
    const top = stack[stack.length - 1];
    const parent = top && top.start < item.start && top.end >= item.end ? top : null;
    const parentPath = parent?.path || '';
    const countKey = `${parentPath}>${item.tag}`;
    const sibling = siblingCounts.get(countKey) ?? 0;
    siblingCounts.set(countKey, sibling + 1);
    const path = `${parentPath ? `${parentPath}>` : ''}${item.tag}[${sibling}]`;
    const entry = Object.freeze({ ...item, depth: parent ? parent.depth + 1 : 0, path });
    completed.push(entry);
    stack.push(entry);
  }
  return completed;
}

export function parseCssRules(css) {
  if (typeof css !== 'string' || !css) return [];
  const rules = [];
  const stack = [];
  const segmentStarts = [0];
  let quote = null;
  let comment = false;
  for (let index = 0; index < css.length; index += 1) {
    const char = css[index];
    const next = css[index + 1];
    if (comment) {
      if (char === '*' && next === '/') { comment = false; index += 1; }
      continue;
    }
    if (quote) {
      if (char === '\\') index += 1;
      else if (char === quote) quote = null;
      continue;
    }
    if (char === '/' && next === '*') { comment = true; index += 1; continue; }
    if (char === '"' || char === "'") { quote = char; continue; }
    if (char === '{') {
      stack.push({ start: segmentStarts[segmentStarts.length - 1], open: index });
      segmentStarts.push(index + 1);
      continue;
    }
    if (char !== '}' || !stack.length) continue;
    const block = stack.pop();
    segmentStarts.pop();
    const selector = css.slice(block.start, block.open).trim();
    if (selector) rules.push(Object.freeze({
      selector,
      body: css.slice(block.open + 1, index),
      start: block.start,
      end: index + 1,
      text: css.slice(block.start, index + 1),
    }));
    segmentStarts[segmentStarts.length - 1] = index + 1;
  }
  return rules;
}

function braceBlock(css, from) {
  let depth = 0;
  let started = false;
  for (let i = from; i < css.length; i += 1) {
    if (css[i] === '{') {
      depth += 1;
      started = true;
    } else if (css[i] === '}') {
      depth -= 1;
      if (started && depth === 0) return css.slice(from, i + 1);
    }
  }
  return css.slice(from);
}

export function partitionCss(css) {
  const text = typeof css === 'string' ? css : '';
  const atBlocks = [];
  const remainder = [];
  const at = /@(media|supports|layer|keyframes|font-face)\b/gi;
  let last = 0;
  let match;
  while ((match = at.exec(text))) {
    remainder.push(text.slice(last, match.index));
    const block = braceBlock(text, match.index);
    atBlocks.push(block);
    last = match.index + block.length;
    at.lastIndex = last;
  }
  remainder.push(text.slice(last));
  return Object.freeze({
    atBlocks: Object.freeze(atBlocks),
    rules: parseCssRules(remainder.join('')),
  });
}

export function mergeRanges(ranges) {
  const sorted = [...ranges].filter(range => range && range.end > range.start)
    .sort((a, b) => a.start - b.start || a.end - b.end);
  const out = [];
  for (const range of sorted) {
    const last = out[out.length - 1];
    if (!last || range.start > last.end) out.push({ start: range.start, end: range.end });
    else last.end = Math.max(last.end, range.end);
  }
  return out;
}

export function unownedParts(source, ranges) {
  const merged = mergeRanges(ranges);
  const parts = [];
  let pos = 0;
  for (const range of merged) {
    parts.push(source.slice(pos, range.start));
    pos = range.end;
  }
  parts.push(source.slice(pos));
  return parts;
}

export function proposedKeepsUnowned(original, proposed, ranges) {
  if (original === proposed) return true;
  if (!ranges.length) return false;
  const parts = unownedParts(original, ranges);
  let rest = proposed;
  if (!rest.startsWith(parts[0])) return false;
  rest = rest.slice(parts[0].length);
  for (let i = 1; i < parts.length; i += 1) {
    const part = parts[i];
    if (part === '') {
      if (i === parts.length - 1) return true;
      continue;
    }
    const index = rest.indexOf(part);
    if (index < 0) return false;
    rest = rest.slice(index + part.length);
  }
  return rest === '';
}

export function jsMentions(js, needles) {
  if (typeof js !== 'string' || !js) return [];
  const ranges = [];
  for (const needle of needles) {
    if (!needle) continue;
    let from = 0;
    while (from < js.length) {
      const index = js.indexOf(needle, from);
      if (index < 0) break;
      let lineStart = js.lastIndexOf('\n', index - 1) + 1;
      let lineEnd = js.indexOf('\n', index);
      if (lineEnd < 0) lineEnd = js.length;
      ranges.push(Object.freeze({ start: lineStart, end: lineEnd, needle }));
      from = index + needle.length;
    }
  }
  return ranges;
}

export function replaceRange(source, start, end, next) {
  return source.slice(0, start) + next + source.slice(end);
}
