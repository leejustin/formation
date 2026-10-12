import { assignSpots, templateSpots, type TemplateId } from './templates';
import { DANCER_COLORS, type Dancer, type DancerPos, type Formation, type Pose, type Project, type StageInfo, type TransitionSpec } from './types';

export const uid = () => Math.random().toString(36).slice(2, 10);

export const defaultStage = (): StageInfo => ({ width: 12, depth: 9, wing: 3, units: 'ft' });

export function blankProject(): Project {
  const stage = defaultStage();
  const dancers: Dancer[] = Array.from({ length: 8 }, (_, i) => ({
    id: uid(), name: `Dancer ${i + 1}`, color: DANCER_COLORS[i % DANCER_COLORS.length],
  }));
  const spots = templateSpots('windows', dancers.length, stage);
  const positions: Record<string, DancerPos> = {};
  dancers.forEach((d, i) => (positions[d.id] = { ...spots[i], facing: 0, pose: 'stand' }));
  return {
    version: 1, id: uid(), name: 'Untitled set', dancers,
    formations: [{ id: uid(), name: 'Opening', start: 0, length: 8, positions, transitions: {} }],
    music: { kind: 'none', duration: 0, bpm: 96, offset: 0 },
    stage, updatedAt: Date.now(),
  };
}

/** A short hip hop showcase that demos entrances, levels, ripples and traffic. */
export function demoProject(): Project {
  const stage = defaultStage();
  const names = ['Maya', 'Jordan', 'Kai', 'Nia', 'Leo', 'Sky', 'Remy', 'Tess', 'Ari', 'Zo'];
  const dancers: Dancer[] = names.map((name, i) => ({
    id: uid(), name, color: DANCER_COLORS[i % DANCER_COLORS.length], group: i % 2 ? 'B' : 'A',
  }));
  const ids = dancers.map((d) => d.id);
  const formations: Formation[] = [];
  let prev: Record<string, DancerPos> | null = null;

  const add = (
    name: string, start: number, length: number,
    spots: Record<string, Partial<DancerPos> & { x: number; y: number }>,
    trans: (id: string, i: number) => Partial<TransitionSpec> = () => ({}),
    notes?: string,
  ) => {
    const positions: Record<string, DancerPos> = {};
    const transitions: Record<string, TransitionSpec> = {};
    ids.forEach((id, i) => {
      const s = spots[id];
      positions[id] = { facing: 0, pose: 'stand', ...s };
      transitions[id] = { bend: 0, start: 0, end: 1, move: 'walk', ...trans(id, i) };
    });
    formations.push({ id: uid(), name, start, length, positions, transitions, notes });
    prev = positions;
  };

  const fromTemplate = (t: TemplateId, pose: (i: number, y: number) => Pose = () => 'stand') => {
    const spots = templateSpots(t, ids.length, stage);
    const from = ids.map((id) => prev![id]);
    const a = assignSpots(from, spots);
    const out: Record<string, DancerPos> = {};
    ids.forEach((id, i) => {
      const s = spots[a[i]];
      out[id] = { x: s.x, y: s.y, facing: 0, pose: pose(i, s.y) };
    });
    return out;
  };

  // 0: everyone hidden in the wings
  const wing: Record<string, DancerPos> = {};
  ids.forEach((id, i) => {
    const side = i % 2 ? 1 : -1;
    wing[id] = { x: side * (stage.width / 2 + 0.7 + (i % 3) * 0.45), y: 1.5 + Math.floor(i / 2) * 1.3, facing: side * -90, pose: 'stand' };
  });
  add('Wings', 0, 4, wing, undefined, 'Lights down. Everyone in wings.');

  // 1: run in to a tight clump, ripple by distance
  const clump = templateSpots('clump', ids.length, stage).map((p) => ({ ...p, y: p.y - 0.8 }));
  const cA = assignSpots(ids.map((id) => wing[id]), clump);
  const clumpPos: Record<string, DancerPos> = {};
  ids.forEach((id, i) => (clumpPos[id] = { ...clump[cA[i]], facing: 0, pose: i === 0 ? 'stand' : 'crouch', action: i === 0 ? 'Lead pose' : undefined }));
  add('Clump hit', 8, 8, clumpPos, (_, i) => ({ move: 'run', start: (i % 5) * 0.08, end: 0.7 + (i % 5) * 0.06, bend: i % 2 ? 0.15 : -0.15 }), 'Run in on 1·5. Hit on 2·1, Maya pops up.');

  // 2: windows — front row kneels
  add('Windows', 20, 8, fromTemplate('windows', (_i, y) => (y < stage.depth * 0.42 ? 'kneel' : 'stand')),
    (_, i) => ({ start: i * 0.05, end: 0.6 + i * 0.04 }), 'Front row drops to knee on 3·8. Back row arms.');

  // 3: V with ripple
  const vPos = fromTemplate('v');
  add('V — ripple', 32, 8, vPos, (id) => ({ start: Math.abs(vPos[id].x) / (stage.width / 2) * 0.5, end: 1 }), 'Ripple from the point out.');

  // 4: floor section
  add('Floor work', 44, 8, fromTemplate('twoLines', (i) => (i % 2 ? 'floor' : 'sit')), (_, i) => ({ move: i % 2 ? 'roll' : 'slide', start: 0.1, end: 0.9 }), 'Canon on the floor, alternate counts.');

  // 5: cypher circle
  add('Cypher', 56, 12, fromTemplate('circle'), () => ({ move: 'run', bend: 0.25 }), 'Freestyle in the middle — Jordan, then Kai.');

  // 6: final pyramid hit
  add('Final hit', 72, 8, fromTemplate('pyramid', (_i, y) => (y < stage.depth * 0.3 ? 'jump' : y < stage.depth * 0.5 ? 'stand' : 'stand')),
    (_, i) => ({ move: 'run', start: 0, end: 0.75 + (i % 3) * 0.08 }), 'Last hit. Hold until blackout.');

  return {
    version: 1, id: uid(), name: 'Showcase demo', dancers, formations,
    music: { kind: 'none', duration: 0, bpm: 98, offset: 0 },
    stage, updatedAt: Date.now(),
  };
}
