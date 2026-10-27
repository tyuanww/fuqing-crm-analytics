import { scanHtmlElements } from '../free-page/source-index/parse.mjs';

const ATTRIBUTE = /(?:^|\s)([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;

export function pageAttributesAreReadonly(attributes) {
  for (const match of String(attributes ?? '').matchAll(ATTRIBUTE)) {
    const name = match[1].toLowerCase();
    const value = match[2] ?? match[3] ?? match[4] ?? '';
    if (name === 'data-page-readonly') return true;
    if (name === 'data-sp-bindable' && value.toLowerCase() === 'database') return true;
  }
  return false;
}

export function pageSourceIsReadonly(source) {
  return scanHtmlElements(String(source ?? '')).some(node => pageAttributesAreReadonly(node.attrs));
}

export function pageSourceRangeIsReadonly(source, start, end) {
  return scanHtmlElements(String(source ?? '')).some(node => (
    node.start <= start && node.end >= end && pageAttributesAreReadonly(node.attrs)
  ));
}
