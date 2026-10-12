import { create } from 'zustand';
import { clamp, formationEnd, frameAt, locate, snap } from './engine';
import { assignSpots, templateSpots, type TemplateId } from './templates';
import { blankProject, demoProject, uid } from './demo';
import type { Analysis } from './audio';
import {
  DANCER_COLORS, defaultTransition,
  type Dancer, type DancerPos, type Formation, type MusicInfo, type Project, type StageInfo, type TransitionSpec,
} from './types';

export type ViewMode = '2d' | '3d' | 'split';
export type Panel = 'formation' | 'dancers' | 'music' | 'none';
export type CamPreset = 'audience' | 'top' | 'orbit' | 'judge';

interface UI {
  count: number;
  playing: boolean;
  rate: number;
  loop: [number, number] | null;
  metronome: boolean;
  selected: string[];
  spotlight: string | null;
  view: ViewMode;
  cam: CamPreset;
  dancerView: boolean; // flip stage so upstage is at the bottom
  showPaths: boolean;
  showGhost: boolean;
  showNames: boolean;
  snapGrid: boolean;
  zoom: number; // px per count
  panel: Panel;
  analysis: Analysis | null;
  audioUrl: string | null;
  toast: string | null;
}

interface State extends UI {
  project: Project;
  past: Project[];
  future: Project[];

  set: (patch: Partial<UI>) => void;
  toastMsg: (msg: string) => void;
  /** apply a change; `history: false` for live drags after a checkpoint() */
  mutate: (fn: (p: Project) => void, opts?: { history?: boolean }) => void;
  checkpoint: () => void;
  undo: () => void;
  redo: () => void;
  load: (p: Project) => void;
  newProject: () => void;
  loadDemo: () => void;

  activeFormation: () => Formation | null;
  seekFormation: (id: string) => void;
  addFormation: () => void;
  duplicateFormation: (id: string) => void;
  deleteFormation: (id: string) => void;
  setTiming: (id: string, start: number, length: number) => void;
  movePositions: (fid: string, patch: Record<string, Partial<DancerPos>>, history?: boolean) => void;
  setTransitions: (fid: string, ids: string[], patch: Partial<TransitionSpec>) => void;
  applyTemplate: (t: TemplateId, ids?: string[]) => void;
  mirror: () => void;
  align: (axis: 'x' | 'y') => void;
  distribute: (axis: 'x' | 'y') => void;
  ripple: (dir: 'lr' | 'rl' | 'center' | 'front' | 'clear') => void;
  swap: () => void;
  addDancer: () => void;
  updateDancer: (id: string, patch: Partial<Dancer>) => void;
  removeDancer: (id: string) => void;
  setMusic: (patch: Partial<MusicInfo>) => void;
  setStage: (patch: Partial<StageInfo>) => void;
}

const STORAGE_KEY = 'formation:project';

function initialProject(): Project {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as Project;
  } catch { /* storage blocked */ }
  return demoProject();
}

const sortF = (p: Project) => p.formations.sort((a, b) => a.start - b.start);
const clone = <T,>(v: T): T => structuredClone(v);

/** shift every formation starting after `after` so the first one starts no earlier than `minStart` */
function pushLater(p: Project, after: number, minStart: number) {
  const later = p.formations.filter((f) => f.start > after);
  if (later.length && later[0].start < minStart) {
    const d = minStart - later[0].start;
    later.forEach((f) => (f.start += d));
  }
}

export const useStore = create<State>((set, get) => ({
  project: initialProject(),
  past: [],
  future: [],
  count: 0,
  playing: false,
  rate: 1,
  loop: null,
  metronome: true,
  selected: [],
  spotlight: null,
  view: 'split',
  cam: 'audience',
  dancerView: false,
  showPaths: true,
  showGhost: true,
  showNames: true,
  snapGrid: true,
  zoom: 14,
  panel: 'formation',
  analysis: null,
  audioUrl: null,
  toast: null,

  set: (patch) => set(patch),
  toastMsg: (msg) => {
    set({ toast: msg });
    setTimeout(() => get().toast === msg && set({ toast: null }), 2200);
  },

  mutate: (fn, opts) => {
    const { project, past } = get();
    const next = clone(project);
    fn(next);
    sortF(next);
    next.updatedAt = Date.now();
    if (opts?.history === false) set({ project: next });
    else set({ project: next, past: [...past.slice(-99), project], future: [] });
  },
  checkpoint: () => set((s) => ({ past: [...s.past.slice(-99), s.project], future: [] })),
  undo: () => {
    const { past, project, future } = get();
    if (!past.length) return;
    set({ project: past[past.length - 1], past: past.slice(0, -1), future: [project, ...future] });
  },
  redo: () => {
    const { past, project, future } = get();
    if (!future.length) return;
    set({ project: future[0], future: future.slice(1), past: [...past, project] });
  },
  load: (p) => set({ project: p, past: [], future: [], count: 0, selected: [], spotlight: null, analysis: null, playing: false }),
  newProject: () => get().load(blankProject()),
  loadDemo: () => get().load(demoProject()),

  activeFormation: () => {
    const { project, count } = get();
    const w = locate(project.formations, count);
    return w.kind === 'hold' ? project.formations[w.index] : null;
  },

  seekFormation: (id) => {
    const f = get().project.formations.find((x) => x.id === id);
    if (f) set({ count: f.start, playing: false });
  },

  addFormation: () => {
    const { project, count } = get();
    const fs = project.formations;
    const w = locate(fs, count);
    let start = Math.max(0, snap(count, 1));
    if (w.kind === 'hold') start = formationEnd(fs[w.index]) + 4;
    const length = 8;
    const frames = frameAt(project, w.kind === 'hold' ? formationEnd(fs[w.index]) - 0.001 : count);
    const positions: Record<string, DancerPos> = {};
    frames.forEach((f) => (positions[f.id] = { x: +f.x.toFixed(3), y: +f.y.toFixed(3), facing: Math.round(f.facing), pose: f.pose }));
    const id = uid();
    get().mutate((p) => {
      pushLater(p, w.kind === 'hold' ? fs[w.index].start : start - 0.001, start + length + 4);
      p.formations.push({ id, name: `Formation ${p.formations.length + 1}`, start, length, positions, transitions: {} });
    });
    set({ count: start, playing: false });
    get().toastMsg('Formation added — drag dancers to set spots');
  },

  duplicateFormation: (id) => {
    const src = get().project.formations.find((f) => f.id === id);
    if (!src) return;
    const nid = uid();
    const start = formationEnd(src) + 4;
    get().mutate((p) => {
      pushLater(p, src.start, start + src.length + 4);
      p.formations.push({ ...clone(src), id: nid, name: `${src.name} copy`, start, transitions: {} });
    });
    set({ count: start });
  },

  deleteFormation: (id) => {
    if (get().project.formations.length <= 1) return get().toastMsg('A set needs at least one formation');
    get().mutate((p) => { p.formations = p.formations.filter((f) => f.id !== id); });
  },

  setTiming: (id, start, length) => {
    get().mutate((p) => {
      const i = p.formations.findIndex((f) => f.id === id);
      const prev = p.formations[i - 1], next = p.formations[i + 1];
      const lo = prev ? formationEnd(prev) : 0;
      const L = Math.max(0.5, length);
      const hi = next ? next.start - L : Infinity;
      const f = p.formations[i];
      f.start = clamp(start, lo, Math.max(lo, hi));
      f.length = next ? Math.min(L, next.start - f.start) : L;
    }, { history: false });
  },

  movePositions: (fid, patch, history = true) => {
    get().mutate((p) => {
      const f = p.formations.find((x) => x.id === fid);
      if (!f) return;
      for (const [id, v] of Object.entries(patch)) {
        const cur = f.positions[id] ?? { x: 0, y: 0, facing: 0, pose: 'stand' };
        f.positions[id] = { ...cur, ...v };
      }
    }, { history });
  },

  setTransitions: (fid, ids, patch) => {
    get().mutate((p) => {
      const f = p.formations.find((x) => x.id === fid);
      if (!f) return;
      ids.forEach((id) => (f.transitions[id] = { ...(f.transitions[id] ?? defaultTransition()), ...patch }));
    });
  },

  applyTemplate: (t, ids) => {
    const { project, selected } = get();
    const f = get().activeFormation();
    if (!f) return get().toastMsg('Move the playhead onto a formation first');
    const target = ids ?? (selected.length > 1 ? selected : project.dancers.map((d) => d.id));
    const spots = templateSpots(t, target.length, project.stage);
    const from = target.map((id) => f.positions[id] ?? { x: 0, y: 0 });
    const a = assignSpots(from, spots);
    const patch: Record<string, Partial<DancerPos>> = {};
    target.forEach((id, i) => (patch[id] = { x: +spots[a[i]].x.toFixed(3), y: +spots[a[i]].y.toFixed(3) }));
    get().movePositions(f.id, patch);
    get().toastMsg('Spots assigned for the shortest total travel');
  },

  mirror: () => {
    const f = get().activeFormation();
    if (!f) return;
    const ids = get().selected.length ? get().selected : Object.keys(f.positions);
    const patch: Record<string, Partial<DancerPos>> = {};
    ids.forEach((id) => { const p = f.positions[id]; if (p) patch[id] = { x: -p.x, facing: -p.facing }; });
    get().movePositions(f.id, patch);
  },

  align: (axis) => {
    const f = get().activeFormation();
    const ids = get().selected;
    if (!f || ids.length < 2) return get().toastMsg('Select 2+ dancers to align');
    const avg = ids.reduce((s, id) => s + (f.positions[id]?.[axis] ?? 0), 0) / ids.length;
    const patch: Record<string, Partial<DancerPos>> = {};
    ids.forEach((id) => (patch[id] = { [axis]: +avg.toFixed(3) }));
    get().movePositions(f.id, patch);
  },

  distribute: (axis) => {
    const f = get().activeFormation();
    const ids = [...get().selected];
    if (!f || ids.length < 3) return get().toastMsg('Select 3+ dancers to space evenly');
    ids.sort((a, b) => f.positions[a][axis] - f.positions[b][axis]);
    const lo = f.positions[ids[0]][axis], hi = f.positions[ids[ids.length - 1]][axis];
    const patch: Record<string, Partial<DancerPos>> = {};
    ids.forEach((id, i) => (patch[id] = { [axis]: +(lo + ((hi - lo) * i) / (ids.length - 1)).toFixed(3) }));
    get().movePositions(f.id, patch);
  },

  ripple: (dir) => {
    const f = get().activeFormation();
    if (!f) return;
    const ids = get().selected.length > 1 ? get().selected : get().project.dancers.map((d) => d.id);
    if (dir === 'clear') return get().setTransitions(f.id, ids, { start: 0, end: 1 });
    const key = (id: string) => {
      const p = f.positions[id];
      if (!p) return 0;
      return dir === 'lr' ? p.x : dir === 'rl' ? -p.x : dir === 'center' ? Math.abs(p.x) : p.y;
    };
    const sorted = [...ids].sort((a, b) => key(a) - key(b));
    const n = sorted.length;
    get().mutate((p) => {
      const ff = p.formations.find((x) => x.id === f.id)!;
      sorted.forEach((id, i) => {
        const s = n > 1 ? (i / (n - 1)) * 0.5 : 0;
        ff.transitions[id] = { ...(ff.transitions[id] ?? defaultTransition()), start: +s.toFixed(3), end: +(s + 0.5).toFixed(3) };
      });
    });
    get().toastMsg('Ripple set on the transition into this formation');
  },

  swap: () => {
    const f = get().activeFormation();
    const [a, b] = get().selected;
    if (!f || !a || !b || get().selected.length !== 2) return get().toastMsg('Select exactly 2 dancers to swap');
    const pa = f.positions[a], pb = f.positions[b];
    get().movePositions(f.id, { [a]: { x: pb.x, y: pb.y }, [b]: { x: pa.x, y: pa.y } });
  },

  addDancer: () => {
    const { project } = get();
    const n = project.dancers.length;
    const id = uid();
    get().mutate((p) => {
      p.dancers.push({ id, name: `Dancer ${n + 1}`, color: DANCER_COLORS[n % DANCER_COLORS.length] });
      p.formations.forEach((f) => {
        f.positions[id] = { x: -(p.stage.width / 2 + 1), y: 1 + (n % 6) * 1, facing: 90, pose: 'stand' };
      });
    });
    set({ selected: [id] });
  },
  updateDancer: (id, patch) => get().mutate((p) => {
    const d = p.dancers.find((x) => x.id === id);
    if (d) Object.assign(d, patch);
  }),
  removeDancer: (id) => {
    get().mutate((p) => {
      p.dancers = p.dancers.filter((d) => d.id !== id);
      p.formations.forEach((f) => { delete f.positions[id]; delete f.transitions[id]; });
    });
    set((s) => ({ selected: s.selected.filter((x) => x !== id), spotlight: s.spotlight === id ? null : s.spotlight }));
  },
  setMusic: (patch) => get().mutate((p) => { p.music = { ...p.music, ...patch }; }),
  setStage: (patch) => get().mutate((p) => { p.stage = { ...p.stage, ...patch }; }),
}));

// autosave
let saveTimer: number | undefined;
useStore.subscribe((s, prev) => {
  if (s.project === prev.project) return;
  clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s.project)); } catch { /* quota */ }
  }, 400);
});
