import type { Pt } from './engine';
import type { StageInfo } from './types';

export type TemplateId =
  | 'line' | 'twoLines' | 'windows' | 'v' | 'wedge' | 'pyramid' | 'diamond'
  | 'circle' | 'arc' | 'block' | 'diagonal' | 'clump' | 'columns';

export const TEMPLATES: { id: TemplateId; label: string; hint: string }[] = [
  { id: 'windows', label: 'Windows', hint: 'Staggered rows so every face shows' },
  { id: 'v', label: 'V', hint: 'Point downstage — leader in front' },
  { id: 'wedge', label: 'Wedge', hint: 'Point upstage — opens to the crowd' },
  { id: 'pyramid', label: 'Pyramid', hint: '1-2-3-4 rows from the front' },
  { id: 'line', label: 'Line', hint: 'Single row across' },
  { id: 'twoLines', label: '2 Lines', hint: 'Two even rows' },
  { id: 'block', label: 'Block', hint: 'Tight grid, army style' },
  { id: 'diamond', label: 'Diamond', hint: 'Diamond outline' },
  { id: 'circle', label: 'Circle', hint: 'Cypher circle' },
  { id: 'arc', label: 'Arc', hint: 'Semicircle open to audience' },
  { id: 'diagonal', label: 'Diagonal', hint: 'Corner to corner' },
  { id: 'columns', label: 'Columns', hint: 'Files going upstage' },
  { id: 'clump', label: 'Clump', hint: 'Tight pack' },
];

const row = (n: number, y: number, gap: number, offset = 0): Pt[] =>
  Array.from({ length: n }, (_, i) => ({ x: (i - (n - 1) / 2) * gap + offset, y }));

function rows(counts: number[], gap: number, rowGap: number, stagger = false): Pt[] {
  const out: Pt[] = [];
  const total = (counts.length - 1) * rowGap;
  counts.forEach((c, r) => {
    const off = stagger && r % 2 === 1 && counts[r] === counts[0] ? gap / 2 : 0;
    out.push(...row(c, -total / 2 + r * rowGap, gap, off));
  });
  return out;
}

function splitRows(n: number, perRow: number): number[] {
  const r = Math.ceil(n / perRow);
  const base = Math.floor(n / r), extra = n % r;
  return Array.from({ length: r }, (_, i) => base + (i < extra ? 1 : 0));
}

function raw(id: TemplateId, n: number, gap: number): Pt[] {
  switch (id) {
    case 'line': return row(n, 0, gap);
    case 'twoLines': return rows(splitRows(n, Math.ceil(n / 2)), gap, gap);
    case 'windows': {
      // front row has one more than back, back sits in the gaps
      const back = Math.floor(n / 2), front = n - back;
      return [...row(front, -gap / 2, gap), ...row(back, gap / 2, gap)];
    }
    case 'block': {
      const cols = Math.ceil(Math.sqrt(n * 1.6));
      return rows(splitRows(n, cols), gap, gap);
    }
    case 'pyramid': {
      const counts: number[] = [];
      let left = n, k = 1;
      while (left > 0) { counts.push(Math.min(k, left)); left -= k; k++; }
      return rows(counts, gap, gap * 0.85);
    }
    case 'v':
    case 'wedge': {
      const pts: Pt[] = [{ x: 0, y: 0 }];
      for (let i = 1; i < n; i++) {
        const k = Math.ceil(i / 2), side = i % 2 ? -1 : 1;
        pts.push({ x: side * k * gap * 0.75, y: k * gap * 0.75 });
      }
      const flip = id === 'wedge' ? -1 : 1;
      const maxY = Math.max(...pts.map((p) => p.y));
      return pts.map((p) => ({ x: p.x, y: flip * (p.y - maxY / 2) }));
    }
    case 'diamond': {
      if (n <= 4) return circle(n, gap * 0.9);
      const pts: Pt[] = [];
      const per = n; // walk around diamond perimeter
      for (let i = 0; i < per; i++) {
        const t = (i / per) * 4, seg = Math.floor(t), f = t - seg;
        const corners = [{ x: 0, y: -1 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }, { x: 0, y: -1 }];
        const a = corners[seg], b = corners[seg + 1];
        pts.push({ x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f });
      }
      const r = (gap * n) / 5.6;
      return pts.map((p) => ({ x: p.x * r, y: p.y * r }));
    }
    case 'circle': return circle(n, gap);
    case 'arc': {
      const r = Math.max(gap * 1.5, (gap * (n - 1)) / Math.PI);
      return Array.from({ length: n }, (_, i) => {
        const a = Math.PI * (n === 1 ? 0.5 : i / (n - 1));
        return { x: -Math.cos(a) * r, y: Math.sin(a) * r * 0.75 - r * 0.35 };
      });
    }
    case 'diagonal': return Array.from({ length: n }, (_, i) => ({ x: (i - (n - 1) / 2) * gap * 0.8, y: -(i - (n - 1) / 2) * gap * 0.6 }));
    case 'columns': {
      const cols = n <= 6 ? 2 : n <= 12 ? 3 : 4;
      const perCol = Math.ceil(n / cols);
      const pts: Pt[] = [];
      for (let i = 0; i < n; i++) {
        const c = Math.floor(i / perCol), r = i % perCol;
        pts.push({ x: (c - (cols - 1) / 2) * gap * 1.6, y: (r - (perCol - 1) / 2) * gap * 0.8 });
      }
      return pts;
    }
    case 'clump': {
      // hex packing spiral
      const pts: Pt[] = [{ x: 0, y: 0 }];
      const g = gap * 0.6;
      for (let ring = 1; pts.length < n; ring++) {
        for (let k = 0; k < 6 * ring && pts.length < n; k++) {
          const a = (k / (6 * ring)) * Math.PI * 2;
          pts.push({ x: Math.cos(a) * ring * g, y: Math.sin(a) * ring * g * 0.85 });
        }
      }
      return pts;
    }
  }
}

function circle(n: number, gap: number): Pt[] {
  const r = Math.max(gap * 0.8, (gap * n) / (2 * Math.PI));
  return Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2 + Math.PI / 2;
    return { x: Math.cos(a) * r, y: Math.sin(a) * r };
  });
}

/** Template spots fitted to the stage. y is measured from the downstage edge. */
export function templateSpots(id: TemplateId, n: number, stage: StageInfo, spacing = 1.5): Pt[] {
  if (n === 0) return [];
  let pts = raw(id, n, spacing);
  const minX = Math.min(...pts.map((p) => p.x)), maxX = Math.max(...pts.map((p) => p.x));
  const minY = Math.min(...pts.map((p) => p.y)), maxY = Math.max(...pts.map((p) => p.y));
  const w = maxX - minX || 1, h = maxY - minY || 1;
  const scale = Math.min(1, (stage.width * 0.86) / w, (stage.depth * 0.8) / h);
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
  const centerY = stage.depth * 0.45;
  pts = pts.map((p) => ({ x: (p.x - cx) * scale, y: centerY + (p.y - cy) * scale }));
  return pts;
}

/**
 * Optimal assignment (Hungarian algorithm) — gives each dancer the spot that
 * minimizes total travel so transitions stay clean.
 */
export function assignSpots(from: Pt[], spots: Pt[]): number[] {
  const n = from.length;
  const INF = 1e18;
  const cost = (i: number, j: number) => {
    const d = Math.hypot(from[i].x - spots[j].x, from[i].y - spots[j].y);
    return d * d; // squared distance discourages crossings
  };
  const u = new Array(n + 1).fill(0), v = new Array(n + 1).fill(0);
  const p = new Array(n + 1).fill(0), way = new Array(n + 1).fill(0);
  for (let i = 1; i <= n; i++) {
    p[0] = i;
    let j0 = 0;
    const minv = new Array(n + 1).fill(INF);
    const used = new Array(n + 1).fill(false);
    do {
      used[j0] = true;
      const i0 = p[j0];
      let delta = INF, j1 = 0;
      for (let j = 1; j <= n; j++) {
        if (used[j]) continue;
        const cur = cost(i0 - 1, j - 1) - u[i0] - v[j];
        if (cur < minv[j]) { minv[j] = cur; way[j] = j0; }
        if (minv[j] < delta) { delta = minv[j]; j1 = j; }
      }
      for (let j = 0; j <= n; j++) {
        if (used[j]) { u[p[j]] += delta; v[j] -= delta; } else minv[j] -= delta;
      }
      j0 = j1;
    } while (p[j0] !== 0);
    do { const j1 = way[j0]; p[j0] = p[j1]; j0 = j1; } while (j0);
  }
  const result = new Array(n).fill(0);
  for (let j = 1; j <= n; j++) if (p[j]) result[p[j] - 1] = j - 1;
  return result;
}
