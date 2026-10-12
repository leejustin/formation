// Audio analysis: waveform peaks + tempo/beat-offset estimation, and IndexedDB blob storage.

export interface Analysis {
  peaks: Float32Array; // max abs amplitude per bucket
  peaksPerSec: number;
  duration: number;
  bpm: number;
  offset: number; // seconds of first strong downbeat
}

export async function analyzeAudio(buf: ArrayBuffer): Promise<Analysis> {
  const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new Ctx();
  const audio = await ctx.decodeAudioData(buf.slice(0));
  ctx.close();
  const sr = audio.sampleRate;
  const ch0 = audio.getChannelData(0);
  const ch1 = audio.numberOfChannels > 1 ? audio.getChannelData(1) : ch0;

  const peaksPerSec = 100;
  const hop = Math.floor(sr / peaksPerSec);
  const nb = Math.floor(ch0.length / hop);
  const peaks = new Float32Array(nb);
  const energy = new Float32Array(nb);
  for (let b = 0; b < nb; b++) {
    let mx = 0, e = 0;
    const s0 = b * hop;
    for (let i = s0; i < s0 + hop; i += 2) {
      const v = (ch0[i] + ch1[i]) * 0.5;
      const a = v < 0 ? -v : v;
      if (a > mx) mx = a;
      e += v * v;
    }
    peaks[b] = mx;
    energy[b] = Math.sqrt(e / (hop / 2));
  }

  const { bpm, offset } = estimateTempo(energy, peaksPerSec);
  return { peaks, peaksPerSec, duration: audio.duration, bpm, offset };
}

/** Onset envelope -> autocorrelation for tempo, then phase search for the downbeat. */
function estimateTempo(energy: Float32Array, fps: number): { bpm: number; offset: number } {
  const n = energy.length;
  const onset = new Float32Array(n);
  for (let i = 1; i < n; i++) {
    const d = Math.log1p(energy[i] * 100) - Math.log1p(energy[i - 1] * 100);
    onset[i] = d > 0 ? d : 0;
  }
  // subtract local mean
  const w = 16;
  const flux = new Float32Array(n);
  let run = 0;
  for (let i = 0; i < n; i++) {
    run += onset[i];
    if (i >= w) run -= onset[i - w];
    flux[i] = Math.max(0, onset[i] - run / Math.min(i + 1, w));
  }

  // analyse up to ~90s from the busiest part
  const len = Math.min(n, fps * 90);
  const minLag = Math.floor((60 / 180) * fps), maxLag = Math.ceil((60 / 70) * fps);
  const scores: number[] = [];
  const minL = Math.floor((60 / 200) * fps), maxL = Math.ceil((60 / 55) * fps);
  for (let lag = minL; lag <= maxL; lag++) {
    let s = 0;
    for (let i = lag; i < len; i++) s += flux[i] * flux[i - lag];
    scores[lag] = s / (len - lag);
  }
  // strongest raw periodicity inside the musical range
  let bestLag = Math.round((60 / 95) * fps), best = -1;
  for (let lag = minLag; lag <= maxLag; lag++) if (scores[lag] > best) { best = scores[lag]; bestLag = lag; }
  // octave choice only: half / double time, gently preferring hip-hop tempos
  const cands = [bestLag, bestLag * 2, bestLag / 2]
    .map((l) => Math.round(l)).filter((l) => l >= minL && l <= maxL);
  let pick = bestLag, pickScore = -1;
  for (const l of cands) {
    const bpm = (60 * fps) / l;
    const prior = Math.exp(-Math.pow(Math.log2(bpm / 100), 2) * 2);
    const sc = (scores[l] ?? 0) * (l === bestLag ? 1 : 0.9) * prior;
    if (sc > pickScore) { pickScore = sc; pick = l; }
  }
  bestLag = pick;
  const a = scores[bestLag - 1] ?? 0, b = scores[bestLag], c = scores[bestLag + 1] ?? 0;
  const shift = a - 2 * b + c !== 0 ? (0.5 * (a - c)) / (a - 2 * b + c) : 0;
  const period = bestLag + Math.max(-0.5, Math.min(0.5, shift));
  const raw = (60 * fps) / period;
  // produced tracks sit on whole-number tempos; snapping avoids drift over a full song
  const bpm = Math.abs(raw - Math.round(raw)) <= 0.4 ? Math.round(raw) : Math.round(raw * 10) / 10;
  // phase: choose offset within one beat that best aligns with onsets
  const periodFrames = (60 / bpm) * fps;
  let bestPhase = 0, bestPhaseScore = -1;
  for (let ph = 0; ph < periodFrames; ph++) {
    let s = 0;
    for (let t = ph; t < len; t += periodFrames) s += flux[Math.round(t)] ?? 0;
    if (s > bestPhaseScore) { bestPhaseScore = s; bestPhase = ph; }
  }
  // first beat with real sound after phase
  let peak = 0;
  for (let i = 0; i < len; i++) if (energy[i] > peak) peak = energy[i];
  const thresh = peak * 0.08;
  const loud = (f: number) => {
    let m = 0;
    for (let i = Math.max(0, Math.round(f) - 3); i <= Math.min(n - 1, Math.round(f) + 4); i++) m = Math.max(m, energy[i]);
    return m >= thresh;
  };
  let first = bestPhase;
  while (first < n && !loud(first)) first += periodFrames;
  return { bpm, offset: first / fps };
}

// ---------- IndexedDB blob store ----------

const DB = 'formation-media';
function db(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore('blobs');
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}

export async function putBlob(key: string, blob: Blob) {
  const d = await db();
  await new Promise<void>((res, rej) => {
    const tx = d.transaction('blobs', 'readwrite');
    tx.objectStore('blobs').put(blob, key);
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
}

export async function getBlob(key: string): Promise<Blob | undefined> {
  const d = await db();
  return new Promise((res, rej) => {
    const r = d.transaction('blobs').objectStore('blobs').get(key);
    r.onsuccess = () => res(r.result as Blob | undefined);
    r.onerror = () => rej(r.error);
  });
}

export function parseYouTubeId(input: string): string | null {
  const s = input.trim();
  if (/^[\w-]{11}$/.test(s)) return s;
  try {
    const u = new URL(s);
    if (u.hostname.includes('youtu.be')) return u.pathname.slice(1, 12) || null;
    if (u.searchParams.get('v')) return u.searchParams.get('v')!.slice(0, 11);
    const m = u.pathname.match(/\/(embed|shorts|live)\/([\w-]{11})/);
    if (m) return m[2];
  } catch { /* not a URL */ }
  return null;
}
