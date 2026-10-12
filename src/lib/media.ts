import { useStore } from './store';
import { analyzeAudio, getBlob, putBlob } from './audio';
import { countToSec } from './engine';
import { player } from './player';

let currentUrl: string | null = null;

/** Hook the player up to whatever music the project has. YouTube is wired by the VideoPanel. */
export async function syncMedia() {
  const s = useStore.getState();
  const m = s.project.music;
  if (m.kind === 'file' && m.fileKey) {
    const blob = await getBlob(m.fileKey).catch(() => undefined);
    if (!blob) {
      s.toastMsg('Song file not on this device — re-attach it in Music');
      player.useNone();
      return;
    }
    setFile(blob);
    const analysis = await analyzeAudio(await blob.arrayBuffer()).catch(() => null);
    useStore.getState().set({ analysis });
  } else if (m.kind === 'none') {
    player.useNone();
    useStore.getState().set({ analysis: null, audioUrl: null });
  }
}

function setFile(blob: Blob) {
  if (currentUrl) URL.revokeObjectURL(currentUrl);
  currentUrl = URL.createObjectURL(blob);
  player.useFile(currentUrl);
  useStore.getState().set({ audioUrl: currentUrl });
}

export async function attachAudioFile(file: File) {
  const s = useStore.getState();
  const key = `audio:${s.project.id}`;
  s.toastMsg('Analyzing song — finding the beat…');
  await putBlob(key, file);
  setFile(file);
  const analysis = await analyzeAudio(await file.arrayBuffer());
  const st = useStore.getState();
  st.set({ analysis, playing: false, metronome: false });
  st.setMusic({
    kind: 'file', title: file.name.replace(/\.[^.]+$/, ''), fileKey: key, youtubeId: undefined,
    duration: analysis.duration, bpm: analysis.bpm, offset: +analysis.offset.toFixed(3), rightsConfirmed: true,
  });
  st.toastMsg(`Locked to ${analysis.bpm} BPM — adjust in Music if the counts feel off`);
}

export async function redetectBeat() {
  const a = useStore.getState().analysis;
  if (!a) return;
  useStore.getState().setMusic({ bpm: a.bpm, offset: +a.offset.toFixed(3) });
}

export function attachYouTube(id: string) {
  const st = useStore.getState();
  st.set({ analysis: null, playing: false, metronome: false });
  st.setMusic({ kind: 'youtube', youtubeId: id, fileKey: undefined, title: 'YouTube video', duration: 0, bpm: 96, offset: 0, rightsConfirmed: true });
  st.toastMsg('Tap tempo along with the song to set the BPM');
}

export function removeMusic() {
  const st = useStore.getState();
  st.setMusic({ kind: 'none', youtubeId: undefined, fileKey: undefined, title: undefined, duration: 0, offset: 0, rightsConfirmed: false });
  st.set({ metronome: true });
}

/** Make the current playhead moment become count 1 of eight 1. */
export function setDownbeatHere() {
  const st = useStore.getState();
  const sec = countToSec(st.count, st.project.music);
  st.setMusic({ offset: +Math.max(0, sec).toFixed(3) });
  st.set({ count: 0 });
  player.seek(Math.max(0, sec));
}
