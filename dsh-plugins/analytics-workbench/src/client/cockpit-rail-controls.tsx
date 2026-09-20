import { useEffect, useRef, useState } from 'react';

export function RailResize({ width, max, onCommit }: { width: number; max: number; onCommit(value: number): void }) {
  const [draft, setDraft] = useState<number | null>(null);
  const handle = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: number; x: number; width: number; value: number } | null>(null);
  const clamp = (value: number) => Math.round(Math.max(180, Math.min(max, value)));
  const finish = (save: boolean) => {
    const current = drag.current; if (!current) return;
    drag.current = null; setDraft(null);
    handle.current?.closest('.sm-library-workspace')?.removeAttribute('data-resizing');
    if (handle.current?.hasPointerCapture?.(current.id)) handle.current.releasePointerCapture(current.id);
    if (save) onCommit(current.value);
  };
  useEffect(() => {
    const cancel = () => finish(false);
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape' && drag.current) { event.preventDefault(); cancel(); } };
    window.addEventListener('blur', cancel); window.addEventListener('keydown', escape, true);
    return () => { handle.current?.closest('.sm-library-workspace')?.removeAttribute('data-resizing'); window.removeEventListener('blur', cancel); window.removeEventListener('keydown', escape, true); };
  }, []);
  useEffect(() => {
    const rail = handle.current?.previousElementSibling as HTMLElement | null;
    if (rail) rail.style.width = rail.style.flexBasis = `${clamp(draft ?? width)}px`;
    return () => { if (rail) { rail.style.width = ''; rail.style.flexBasis = ''; } };
  }, [draft, width, max]);
  return <div ref={handle} role="separator" tabIndex={0} className="cockpit-rail-resize" aria-label="调整产物侧栏宽度"
    aria-orientation="vertical" aria-valuemin={180} aria-valuemax={max} aria-valuenow={clamp(draft ?? width)}
    onDoubleClick={() => onCommit(248)}
    onPointerDown={event => { if (event.button !== 0) return; event.preventDefault(); event.currentTarget.focus();
      drag.current = { id: event.pointerId, x: event.clientX, width: clamp(width), value: clamp(width) }; event.currentTarget.closest('.sm-library-workspace')?.setAttribute('data-resizing', 'true'); setDraft(clamp(width)); event.currentTarget.setPointerCapture?.(event.pointerId); }}
    onPointerMove={event => { const current = drag.current; if (!current || current.id !== event.pointerId) return;
      if (!event.buttons) { finish(false); return; } current.value = clamp(current.width + event.clientX - current.x); setDraft(current.value); }}
    onPointerUp={() => finish(true)} onPointerCancel={() => finish(false)} onLostPointerCapture={() => finish(false)}
    onKeyDown={event => { const step = event.shiftKey ? 40 : 10;
      const next = event.key === 'ArrowLeft' ? width - step : event.key === 'ArrowRight' ? width + step : event.key === 'Home' ? 180 : event.key === 'End' ? max : null;
      if (next !== null) { event.preventDefault(); onCommit(clamp(next)); } }} />;
}
