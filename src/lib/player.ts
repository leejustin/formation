// One clock for three sources: silent metronome, an uploaded audio file, or a YouTube video.

/* eslint-disable @typescript-eslint/no-explicit-any */
declare global {
  interface Window { YT?: any; onYouTubeIframeAPIReady?: () => void }
}

type Source = 'none' | 'file' | 'youtube';

class Player {
  source: Source = 'none';
  audio: HTMLAudioElement | null = null;
  yt: any = null;
  ytReady = false;
  private rate = 1;
  private playing = false;
  // internal clock
  private anchorSec = 0;
  private anchorPerf = 0;
  private lastRaw = -1;
  onEnded: (() => void) | null = null;
  onYouTubeState: ((s: { ready: boolean; duration: number; title?: string; error?: number }) => void) | null = null;

  useNone() {
    this.teardown();
    this.source = 'none';
  }

  useFile(url: string) {
    this.teardown();
    this.source = 'file';
    const a = new Audio(url);
    a.preload = 'auto';
    a.playbackRate = this.rate;
    (a as any).preservesPitch = true;
    a.addEventListener('ended', () => this.onEnded?.());
    this.audio = a;
  }

  async useYouTube(videoId: string, host: HTMLElement) {
    this.teardown();
    this.source = 'youtube';
    await loadYouTubeApi();
    const el = document.createElement('div');
    host.innerHTML = '';
    host.appendChild(el);
    this.ytReady = false;
    this.yt = new window.YT.Player(el, {
      videoId,
      width: '100%',
      height: '100%',
      playerVars: { playsinline: 1, rel: 0, modestbranding: 1, controls: 0, disablekb: 1 },
      events: {
        onReady: () => {
          this.ytReady = true;
          this.yt.setPlaybackRate?.(this.rate);
          const data = this.yt.getVideoData?.() ?? {};
          this.onYouTubeState?.({ ready: true, duration: this.yt.getDuration?.() ?? 0, title: data.title });
        },
        onStateChange: (e: any) => {
          if (e.data === 0) this.onEnded?.();
        },
        onError: (e: any) => this.onYouTubeState?.({ ready: false, duration: 0, error: e.data }),
      },
    });
  }

  private teardown() {
    this.pause();
    if (this.audio) { this.audio.src = ''; this.audio = null; }
    if (this.yt) { try { this.yt.destroy(); } catch { /* gone */ } this.yt = null; }
    this.ytReady = false;
  }

  setRate(r: number) {
    const t = this.time();
    this.rate = r;
    if (this.audio) this.audio.playbackRate = r;
    if (this.yt && this.ytReady) this.yt.setPlaybackRate(r);
    this.anchorSec = t;
    this.anchorPerf = performance.now();
  }

  play(fromSec: number) {
    this.playing = true;
    this.anchorSec = fromSec;
    this.anchorPerf = performance.now();
    this.lastRaw = -1;
    if (this.source === 'file' && this.audio) {
      this.audio.currentTime = Math.max(0, fromSec);
      if (fromSec >= 0) this.audio.play().catch(() => { /* autoplay blocked */ });
    } else if (this.source === 'youtube' && this.yt && this.ytReady) {
      this.yt.seekTo(Math.max(0, fromSec), true);
      if (fromSec >= 0) this.yt.playVideo();
      else this.yt.pauseVideo();
    }
  }

  pause() {
    this.playing = false;
    this.audio?.pause();
    if (this.yt && this.ytReady) this.yt.pauseVideo();
  }

  seek(sec: number) {
    if (this.playing) this.play(sec);
    else if (this.source === 'youtube' && this.yt && this.ytReady && sec >= 0) this.yt.seekTo(sec, true);
    else if (this.audio && sec >= 0) this.audio.currentTime = sec;
  }

  /** seconds into the track */
  time(): number {
    const now = performance.now();
    const predicted = this.anchorSec + ((now - this.anchorPerf) / 1000) * this.rate;
    if (!this.playing) return this.anchorSec;
    // pre-roll before the track starts (negative time) uses the internal clock
    if (predicted < 0) return predicted;
    if (this.source === 'file' && this.audio) {
      if (this.audio.paused && this.audio.readyState >= 2) this.audio.play().catch(() => {});
      return this.audio.currentTime;
    }
    if (this.source === 'youtube' && this.yt && this.ytReady) {
      if (this.yt.getPlayerState?.() !== 1 && predicted >= 0 && this.lastRaw < 0) this.yt.playVideo();
      const raw = this.yt.getCurrentTime?.() ?? 0;
      // YouTube reports time in coarse steps; smooth it with the local clock
      if (raw !== this.lastRaw) {
        this.lastRaw = raw;
        if (Math.abs(raw - predicted) > 0.25) { this.anchorSec = raw; this.anchorPerf = now; return raw; }
      }
      return predicted;
    }
    return predicted;
  }
}

let ytPromise: Promise<void> | null = null;
function loadYouTubeApi(): Promise<void> {
  if (window.YT?.Player) return Promise.resolve();
  if (ytPromise) return ytPromise;
  ytPromise = new Promise((res, rej) => {
    window.onYouTubeIframeAPIReady = () => res();
    const s = document.createElement('script');
    s.src = 'https://www.youtube.com/iframe_api';
    s.onerror = () => { ytPromise = null; rej(new Error('Could not load YouTube')); };
    document.head.appendChild(s);
  });
  return ytPromise;
}

export const player = new Player();
