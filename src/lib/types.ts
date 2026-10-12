// Core data model. Stage coordinates are in meters:
//   x: 0 = center, positive = audience's right (stage left)
//   y: 0 = downstage edge (closest to audience), positive = upstage
// Time on the timeline is measured in counts (beats). Music maps counts to seconds.

export type Pose = 'stand' | 'crouch' | 'kneel' | 'sit' | 'floor' | 'jump';

export type MoveType = 'walk' | 'run' | 'slide' | 'roll' | 'crawl' | 'jump';

export interface DancerPos {
  x: number;
  y: number;
  /** degrees; 0 = facing the audience, 90 = facing audience's right */
  facing: number;
  pose: Pose;
  /** short move/action label shown on stage, e.g. "Windmill", "Wave L→R" */
  action?: string;
}

/** How a dancer travels INTO a formation from the previous one. */
export interface TransitionSpec {
  /** perpendicular bend of the path relative to its length; 0 = straight */
  bend: number;
  /** fraction (0..1) of the transition window before this dancer starts moving */
  start: number;
  /** fraction (0..1) of the transition window when this dancer arrives */
  end: number;
  move: MoveType;
}

export interface Dancer {
  id: string;
  name: string;
  color: string;
  group?: string;
}

export interface Formation {
  id: string;
  name: string;
  /** count at which dancers are in place */
  start: number;
  /** how many counts the formation is held */
  length: number;
  positions: Record<string, DancerPos>;
  transitions: Record<string, TransitionSpec>;
  notes?: string;
}

export interface MusicInfo {
  kind: 'none' | 'file' | 'youtube';
  title?: string;
  youtubeId?: string;
  /** audio blob is stored in IndexedDB under this key */
  fileKey?: string;
  /** seconds */
  duration: number;
  bpm: number;
  /** seconds into the track where count 1 of eight 1 lands */
  offset: number;
  rightsConfirmed?: boolean;
}

export interface StageInfo {
  width: number; // meters
  depth: number; // meters
  wing: number; // meters of offstage area on each side
  units: 'm' | 'ft';
}

export interface Project {
  version: 1;
  id: string;
  name: string;
  dancers: Dancer[];
  formations: Formation[];
  music: MusicInfo;
  stage: StageInfo;
  updatedAt: number;
}

export const POSES: { id: Pose; label: string; key: string; height: number }[] = [
  { id: 'stand', label: 'Stand', key: 'S', height: 1 },
  { id: 'crouch', label: 'Crouch', key: 'C', height: 0.7 },
  { id: 'kneel', label: 'Kneel', key: 'K', height: 0.55 },
  { id: 'sit', label: 'Sit', key: 'T', height: 0.4 },
  { id: 'floor', label: 'Floor', key: 'F', height: 0.15 },
  { id: 'jump', label: 'Jump', key: 'J', height: 1.25 },
];

export const MOVES: { id: MoveType; label: string }[] = [
  { id: 'walk', label: 'Walk' },
  { id: 'run', label: 'Run' },
  { id: 'slide', label: 'Slide' },
  { id: 'roll', label: 'Roll' },
  { id: 'crawl', label: 'Crawl' },
  { id: 'jump', label: 'Leap' },
];

export const DANCER_COLORS = [
  '#ff3d7f', '#ffd23f', '#3dd6ff', '#7cff6b', '#b18cff', '#ff8a3d',
  '#ff5c5c', '#3dffc5', '#ff9de2', '#8ab4ff', '#e8ff3d', '#c58b5a',
];

export const defaultTransition = (): TransitionSpec => ({ bend: 0, start: 0, end: 1, move: 'walk' });
