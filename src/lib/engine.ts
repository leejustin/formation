import {
  defaultTransition, POSES,
  type Dancer, type DancerPos, type Formation, type MoveType, type MusicInfo, type Pose, type Project,
  type StageInfo, type TransitionSpec,
} from './types';

// ---------- time ----------

export const secPerCount = (m: MusicInfo) => 60 / m.bpm;
export const countToSec = (c: number, m: MusicInfo) => m.offset + c * secPerCount(m);
export const secToCount = (s: number, m: MusicInfo) => (s - m.offset) / secPerCount(m);

/** "3·5" = eight 3, count 5. Half counts show as "&". */
export function formatCount(c: number): string {
  if (c < 0) return 'intro';
  const eight = Math.floor(c / 8) + 1;
  const within = c - (eight - 1) * 8;
  const beat = Math.floor(within + 1e-6) + 1;
  const amp = within - Math.floor(within + 1e-6) >= 0.5 - 1e-6 ? '&' : '';
  return `${eight}·${beat}${amp}`;
}

export function formatTime(s: number): string {
  const sign = s < 0 ? '-' : '';
  s = Math.abs(s);
  const m = Math.floor(s / 60);
  const sec = s - m * 60;
  return `${sign}${m}:${sec.toFixed(1).padStart(4, '0')}`;
}

export const snap = (v: number, step: number) => Math.round(v / step) * step;
export const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
const smooth = (t: number) => t * t * (3 - 2 * t);

export const formationEnd = (f: Formation) => f.start + f.length;

export function totalCounts(p: Project): number {
  const last = p.formations[p.formations.length - 1];
  const fromFormations = last ? formationEnd(last) + 16 : 64;
  const fromMusic = p.music.kind !== 'none' && p.music.duration > 0 ? secToCount(p.music.duration, p.music) : 0;
  return Math.max(64, Math.ceil(Math.max(fromFormations, fromMusic) / 8) * 8);
}

export type Where =
  | { kind: 'empty' }
  | { kind: 'hold'; index: number }
  | { kind: 'transition'; from: number; to: number; p: number };

export function locate(formations: Formation[], c: number): Where {
  const n = formations.length;
  if (n === 0) return { kind: 'empty' };
  if (c < formations[0].start) return { kind: 'hold', index: 0 };
  for (let i = 0; i < n; i++) {
    const f = formations[i];
    if (c >= f.start && c < formationEnd(f)) return { kind: 'hold', index: i };
    const next = formations[i + 1];
    if (next && c >= formationEnd(f) && c < next.start) {
      const span = next.start - formationEnd(f);
      return { kind: 'transition', from: i, to: i + 1, p: span > 0 ? (c - formationEnd(f)) / span : 1 };
    }
  }
  return { kind: 'hold', index: n - 1 };
}

// ---------- geometry ----------

export interface Pt { x: number; y: number }

export function pathCtrl(a: Pt, b: Pt, bend: number): Pt {
  const dx = b.x - a.x, dy = b.y - a.y;
  // perpendicular, scaled by distance
  return { x: (a.x + b.x) / 2 - dy * bend, y: (a.y + b.y) / 2 + dx * bend };
}

export function bezier(a: Pt, c: Pt, b: Pt, t: number): Pt {
  const u = 1 - t;
  return { x: u * u * a.x + 2 * u * t * c.x + t * t * b.x, y: u * u * a.y + 2 * u * t * c.y + t * t * b.y };
}

function bezierTangent(a: Pt, c: Pt, b: Pt, t: number): Pt {
  return { x: 2 * (1 - t) * (c.x - a.x) + 2 * t * (b.x - c.x), y: 2 * (1 - t) * (c.y - a.y) + 2 * t * (b.y - c.y) };
}

export function bendFromCtrl(a: Pt, b: Pt, ctrl: Pt): number {
  const dx = b.x - a.x, dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-6) return 0;
  const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
  // project (ctrl - mid) onto perpendicular (-dy, dx)
  return ((ctrl.x - mx) * -dy + (ctrl.y - my) * dx) / len2;
}

/** facing (deg) for a travel direction; 0 = toward audience (−y) */
const headingOf = (d: Pt) => (Math.atan2(d.x, -d.y) * 180) / Math.PI;

function lerpAngle(a: number, b: number, t: number) {
  const d = ((b - a) % 360 + 540) % 360 - 180;
  return a + d * t;
}

export const isOffstage = (p: Pt, s: StageInfo) => Math.abs(p.x) > s.width / 2 + 0.05 || p.y > s.depth + 0.05 || p.y < -0.05;

// ---------- frames ----------

export interface DancerFrame {
  id: string;
  x: number;
  y: number;
  facing: number;
  pose: Pose;
  poseFrom: Pose;
  poseTo: Pose;
  poseT: number;
  moving: boolean;
  move?: MoveType;
  /** meters travelled in the current transition (drives gait cycles) */
  gait: number;
  action?: string;
  offstage: boolean;
}

const fallbackPos = (i: number, s: StageInfo): DancerPos => ({
  x: -(s.width / 2 + s.wing / 2), y: 1 + (i % 6) * 0.8, facing: 90, pose: 'stand',
});

export function posOf(f: Formation | undefined, id: string, i: number, s: StageInfo): DancerPos {
  return f?.positions[id] ?? fallbackPos(i, s);
}

export function transOf(f: Formation, id: string): TransitionSpec {
  return f.transitions[id] ?? defaultTransition();
}

export function frameAt(p: Project, c: number): DancerFrame[] {
  const { formations, dancers, stage } = p;
  const where = locate(formations, c);
  return dancers.map((d, i) => dancerFrame(d, i, where, formations, stage));
}

function dancerFrame(d: Dancer, i: number, where: Where, formations: Formation[], stage: StageInfo): DancerFrame {
  if (where.kind === 'empty') {
    const pos = fallbackPos(i, stage);
    return still(d.id, pos, stage);
  }
  if (where.kind === 'hold') return still(d.id, posOf(formations[where.index], d.id, i, stage), stage);

  const fa = formations[where.from], fb = formations[where.to];
  const A = posOf(fa, d.id, i, stage), B = posOf(fb, d.id, i, stage);
  const spec = transOf(fb, d.id);
  const span = Math.max(0.001, spec.end - spec.start);
  const local = clamp((where.p - spec.start) / span, 0, 1);
  const e = easeInOut(local);
  const ctrl = pathCtrl(A, B, spec.bend);
  const pt = bezier(A, ctrl, B, e);
  const dist = Math.hypot(B.x - A.x, B.y - A.y);
  const pathLen = dist * (1 + Math.abs(spec.bend) * 0.6);
  const moving = local > 0 && local < 1 && dist > 0.05;

  let facing = lerpAngle(A.facing, B.facing, e);
  const travelFacing = spec.move !== 'slide' && spec.move !== 'roll' && dist > 0.6;
  if (travelFacing && local > 0 && local < 1) {
    const h = headingOf(bezierTangent(A, ctrl, B, Math.max(0.02, Math.min(0.98, e))));
    const edge = 0.18;
    if (local < edge) facing = lerpAngle(A.facing, h, smooth(local / edge));
    else if (local > 1 - edge) facing = lerpAngle(h, B.facing, smooth((local - (1 - edge)) / edge));
    else facing = h;
  }

  return {
    id: d.id,
    x: pt.x,
    y: pt.y,
    facing,
    pose: local < 0.5 ? A.pose : B.pose,
    poseFrom: A.pose,
    poseTo: B.pose,
    poseT: smooth(local),
    moving,
    move: moving ? spec.move : undefined,
    gait: pathLen * e,
    action: local < 0.5 ? A.action : B.action,
    offstage: isOffstage(pt, stage),
  };
}

function still(id: string, pos: DancerPos, stage: StageInfo): DancerFrame {
  return {
    id, x: pos.x, y: pos.y, facing: pos.facing, pose: pos.pose, poseFrom: pos.pose, poseTo: pos.pose, poseT: 1,
    moving: false, gait: 0, action: pos.action, offstage: isOffstage(pos, stage),
  };
}

export const poseHeight = (p: Pose) => POSES.find((x) => x.id === p)?.height ?? 1;

// ---------- traffic / collision check ----------

export interface Collision {
  count: number;
  a: string;
  b: string;
  x: number;
  y: number;
  kind: 'path' | 'spot';
}

export function findCollisions(p: Project, minDist = 0.5): Collision[] {
  const out: Collision[] = [];
  const { formations, dancers, stage } = p;
  // static overlaps inside a formation
  formations.forEach((f) => {
    for (let i = 0; i < dancers.length; i++) for (let j = i + 1; j < dancers.length; j++) {
      const a = posOf(f, dancers[i].id, i, stage), b = posOf(f, dancers[j].id, j, stage);
      if (isOffstage(a, stage) || isOffstage(b, stage)) continue;
      if (Math.hypot(a.x - b.x, a.y - b.y) < minDist * 0.8)
        out.push({ count: f.start, a: dancers[i].id, b: dancers[j].id, x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, kind: 'spot' });
    }
  });
  // moving traffic between formations
  const SAMPLES = 40;
  for (let k = 0; k < formations.length - 1; k++) {
    const fa = formations[k], fb = formations[k + 1];
    const t0 = formationEnd(fa), t1 = fb.start;
    if (t1 - t0 <= 0) continue;
    const hit = new Set<string>();
    for (let s = 1; s < SAMPLES; s++) {
      const c = t0 + ((t1 - t0) * s) / SAMPLES;
      const where: Where = { kind: 'transition', from: k, to: k + 1, p: s / SAMPLES };
      const frames = dancers.map((d, i) => dancerFrame(d, i, where, formations, stage));
      for (let i = 0; i < frames.length; i++) for (let j = i + 1; j < frames.length; j++) {
        const a = frames[i], b = frames[j];
        if (a.offstage || b.offstage || (!a.moving && !b.moving)) continue;
        const key = a.id + b.id;
        if (hit.has(key)) continue;
        if (Math.hypot(a.x - b.x, a.y - b.y) < minDist) {
          hit.add(key);
          out.push({ count: c, a: a.id, b: b.id, x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, kind: 'path' });
        }
      }
    }
  }
  return out.sort((a, b) => a.count - b.count);
}

// ---------- human-readable spots ----------

/** Stage numbers along the front edge: C, then 2·4·6·8 out to each side. */
export function stageNumber(x: number, s: StageInfo): string {
  const n = (Math.abs(x) / (s.width / 2)) * 8;
  const r = Math.round(n * 2) / 2;
  if (r < 0.5) return 'C';
  return `${x > 0 ? 'SL' : 'SR'} ${r % 1 === 0 ? r : r.toFixed(1)}`;
}

export const toUnits = (m: number, s: StageInfo) => (s.units === 'ft' ? m * 3.28084 : m);
export const unitLabel = (s: StageInfo) => (s.units === 'ft' ? 'ft' : 'm');

export function describeSpot(pos: Pt, s: StageInfo): string {
  if (pos.x < -s.width / 2 - 0.05) return 'Off — SR wing';
  if (pos.x > s.width / 2 + 0.05) return 'Off — SL wing';
  const third = pos.y / s.depth;
  const zone = third < 0.34 ? 'Downstage' : third < 0.67 ? 'Midstage' : 'Upstage';
  return `${stageNumber(pos.x, s)} · ${zone} (${toUnits(pos.y, s).toFixed(1)}${unitLabel(s)} back)`;
}
