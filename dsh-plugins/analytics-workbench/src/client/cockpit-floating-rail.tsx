import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
export type RailPlacement = { x: number; y: number; width: number; height: number };

export function useFloatingRail({ saved, dockWidth, onCommit }: {
  saved?: RailPlacement | null; dockWidth: number; onCommit(value: RailPlacement | null): void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [layout, setLayout] = useState<RailPlacement | null>(saved ?? null);
  const [bounds, setBounds] = useState({ width: 1440, height: 800 });
  const drag = useRef<{ id: number; x: number; y: number; initial: RailPlacement; previous: RailPlacement | null; next: RailPlacement; resize: boolean; moved: boolean; target: HTMLElement } | null>(null);
  useEffect(() => { if (!drag.current) setLayout(saved ?? null); }, [JSON.stringify(saved)]);
  useEffect(() => {
    const parent = ref.current?.parentElement;
    if (!parent || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(entries => setBounds({ width: entries[0].contentRect.width, height: entries[0].contentRect.height }));
    observer.observe(parent); return () => observer.disconnect();
  }, []);
  const clamp = (value: RailPlacement) => {
    const width = Math.round(Math.max(180, Math.min(480, bounds.width - 18, value.width)));
    const height = Math.round(Math.max(240, Math.min(1000, bounds.height - 12, value.height)));
    return { width, height, x: Math.round(Math.max(0, Math.min(bounds.width - width - 6, value.x))),
      y: Math.round(Math.max(0, Math.min(bounds.height - height, value.y))) };
  };
  const finish = (save: boolean) => {
    const current = drag.current; if (!current) return;
    drag.current = null;
    ref.current?.closest('.sm-library-workspace')?.removeAttribute('data-resizing');
    ref.current?.closest('.sm-library-workspace')?.removeAttribute('data-rail-moving');
    if (current.target.hasPointerCapture?.(current.id)) current.target.releasePointerCapture(current.id);
    if (save && current.moved) { setLayout(current.next); onCommit(current.next); }
    else setLayout(current.previous);
  };
  useEffect(() => {
    const parent = ref.current?.closest('.sm-library-workspace');
    const cancel = () => finish(false);
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape' && drag.current) { event.preventDefault(); cancel(); } };
    window.addEventListener('blur', cancel); window.addEventListener('keydown', escape, true);
    return () => { parent?.removeAttribute('data-resizing'); parent?.removeAttribute('data-rail-moving'); window.removeEventListener('blur', cancel); window.removeEventListener('keydown', escape, true); };
  }, []);
  const pointer = (resize: boolean) => ({
    onPointerDown(event: ReactPointerEvent<HTMLElement>) {
      if (event.button !== 0 || bounds.width < 760) return;
      event.preventDefault(); event.currentTarget.focus();
      const initial = layout ? clamp(layout) : clamp({ x: 0, y: 0, width: dockWidth, height: Math.min(560, bounds.height) });
      drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY, initial, previous: layout, next: initial, resize, moved: false, target: event.currentTarget };
      ref.current?.closest('.sm-library-workspace')?.setAttribute('data-resizing', 'true');
      if (!resize) ref.current?.closest('.sm-library-workspace')?.setAttribute('data-rail-moving', 'true');
      event.currentTarget.setPointerCapture?.(event.pointerId);
    },
    onPointerMove(event: ReactPointerEvent<HTMLElement>) {
      const current = drag.current; if (!current || current.id !== event.pointerId) return;
      if (!event.buttons) { finish(false); return; }
      const dx = event.clientX - current.x, dy = event.clientY - current.y;
      if (!current.moved && Math.hypot(dx, dy) < 4) return;
      current.moved = true;
      current.next = clamp(current.resize ? { ...current.initial, width: current.initial.width + dx, height: current.initial.height + dy }
        : { ...current.initial, x: current.initial.x + dx, y: current.initial.y + dy });
      setLayout(current.next);
    },
    onPointerUp() { finish(true); }, onPointerCancel() { finish(false); }, onLostPointerCapture() { finish(false); },
  });
  const actual = layout ? clamp(layout) : null;
  return {
    ref, layout: actual, width: actual?.width ?? dockWidth, move: pointer(false), resize: pointer(true),
    style: actual ? { left: actual.x, top: actual.y, height: actual.height } as CSSProperties : undefined,
    dock() { setLayout(null); onCommit(null); },
    resizeWidth(width: number) { if (actual) { const next = clamp({ ...actual, width }); setLayout(next); onCommit(next); } },
    nudge(key: string, shift: boolean, resize = false) {
      const delta = shift ? 40 : 10;
      const base = actual ?? clamp({ x: 0, y: 0, width: dockWidth, height: 560 });
      const dx = key === 'ArrowLeft' ? -delta : key === 'ArrowRight' ? delta : 0;
      const dy = key === 'ArrowUp' ? -delta : key === 'ArrowDown' ? delta : 0;
      const next = clamp(resize ? { ...base, width: base.width + dx, height: base.height + dy } : { ...base, x: base.x + dx, y: base.y + dy });
      setLayout(next); onCommit(next);
    },
  };
}
