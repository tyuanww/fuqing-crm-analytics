import type { TextNode } from './html-selection-bridge.mjs';
export type ElementKey = { attribute: 'id' | 'data-node' | 'data-page-block' | 'data-page-field' | 'class' | 'text'; value: string };
export type RenderedLocator = { anchor: ElementKey; path: Array<{ tag: string; key?: ElementKey }>; package_hash: string; html: string };
export function renderedPackageHash(pkg: any): string;
export function validRenderedLocator(value: unknown): boolean;
export function renderedTextPreview(pkg: any, node: TextNode, replacement: string, manifest?: any): any;
