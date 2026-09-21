/** Unique slots for CRM board drafts. Layout is display-only; facts stay on the snapshot. */
export function nextBlockId(ids) {
  const used = new Set(ids);
  let n = 1;
  while (used.has(`m${n}`)) n += 1;
  return `m${n}`;
}

function overlap(left, right) {
  return !(left.x + left.w <= right.x || right.x + right.w <= left.x
    || left.y + left.h <= right.y || right.y + right.h <= left.y);
}

export function nextLayout(boxes) {
  for (let i = 0; i < 30; i++) {
    const layout = { x: (i % 3) * 4, y: Math.floor(i / 3) * 4, w: 4, h: 4 };
    if (layout.y + layout.h > 40) break;
    if (!boxes.some(box => overlap(layout, box))) return layout;
  }
  const bottom = boxes.reduce((max, box) => Math.max(max, box.y + box.h), 0);
  return { x: 0, y: Math.min(36, bottom), w: 4, h: 4 };
}
