import { useStore } from './store';
import { countToSec, secToCount, totalCounts } from './engine';
import { player } from './player';

let actx: AudioContext | null = null;
function ctx() {
  if (!actx) {
    const C = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    actx = new C();
  }
  if (actx.state === 'suspended') actx.resume();
  return actx;
}

function click(accent: boolean) {
  const a = ctx();
  const o = a.createOscillator(), g = a.createGain();
  o.frequency.value = accent ? 1760 : 1175;
  g.gain.setValueAtTime(accent ? 0.35 : 0.18, a.currentTime);
  g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + 0.06);
  o.connect(g).connect(a.destination);
  o.start();
  o.stop(a.currentTime + 0.07);
}

export function togglePlay() {
  const s = useStore.getState();
  if (s.playing) {
    player.pause();
    s.set({ playing: false });
    return;
  }
  ctx(); // unlock audio on the user gesture (iOS)
  let c = s.count;
  if (c >= totalCounts(s.project) - 0.5) c = 0;
  if (s.loop && (c < s.loop[0] || c >= s.loop[1])) c = s.loop[0];
  player.setRate(s.rate);
  player.play(countToSec(c, s.project.music));
  s.set({ playing: true, count: c });
}

export function startClock() {
  let lastBeat = Number.NaN;
  let raf = 0;
  const tick = () => {
    raf = requestAnimationFrame(tick);
    const s = useStore.getState();
    if (!s.playing) { lastBeat = Number.NaN; return; }
    const m = s.project.music;
    let c = secToCount(player.time(), m);
    if (s.loop && c >= s.loop[1]) {
      c = s.loop[0];
      player.play(countToSec(c, m));
    }
    const end = totalCounts(s.project);
    if (c >= end) { player.pause(); s.set({ playing: false, count: end }); return; }
    const beat = Math.floor(c);
    if (beat !== lastBeat && !Number.isNaN(lastBeat) && s.metronome) click(((beat % 8) + 8) % 8 === 0);
    lastBeat = beat;
    s.set({ count: c });
  };
  raf = requestAnimationFrame(tick);
  const unsub = useStore.subscribe((st, prev) => { if (st.rate !== prev.rate) player.setRate(st.rate); });
  player.onEnded = () => { useStore.getState().set({ playing: false }); };
  return () => { cancelAnimationFrame(raf); unsub(); };
}
