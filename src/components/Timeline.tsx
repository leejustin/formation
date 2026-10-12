import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../lib/store';
import { countToSec, findCollisions, formationEnd, secToCount, snap, totalCounts } from '../lib/engine';
import { player } from '../lib/player';
import type { Formation, Project } from '../lib/types';

const PAD = 14;
const LANE = 12;
const dims = (compact: boolean) => {
  const RULER = compact ? 18 : 22, WAVE = compact ? 20 : 38, BLOCK_H = compact ? 34 : 46;
  const BLOCK_TOP = RULER + WAVE + 4;
  return { RULER, WAVE, BLOCK_H, BLOCK_TOP, H: BLOCK_TOP + BLOCK_H + LANE + 6 };
};

function Thumb({ f, p }: { f: Formation; p: Project }) {
  const { width: W, depth: D } = p.stage;
  return (
    <svg className="thumb" viewBox={`${-W / 2 - 0.5} ${-D - 0.3} ${W + 1} ${D + 0.6}`} preserveAspectRatio="xMidYMid meet">
      <rect x={-W / 2} y={-D} width={W} height={D} className="thumb-floor" />
      {p.dancers.map((d) => {
        const pos = f.positions[d.id];
        if (!pos || Math.abs(pos.x) > W / 2 + 0.05) return null;
        return <circle key={d.id} cx={pos.x} cy={-pos.y} r={0.42} fill={d.color} />;
      })}
    </svg>
  );
}

export default function Timeline({ compact = false }: { compact?: boolean }) {
  const { RULER, WAVE, BLOCK_H, BLOCK_TOP, H: TIMELINE_H } = dims(compact);
  const project = useStore((s) => s.project);
  const count = useStore((s) => s.count);
  const zoom = useStore((s) => s.zoom);
  const playing = useStore((s) => s.playing);
  const analysis = useStore((s) => s.analysis);
  const loop = useStore((s) => s.loop);
  const S = useStore.getState;

  const scrollRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [scroll, setScroll] = useState(0);
  const [vw, setVw] = useState(800);

  const { music, formations } = project;
  const minC = music.kind !== 'none' ? Math.min(0, Math.floor(secToCount(0, music) / 8) * 8) : 0;
  const total = totalCounts(project);
  const innerW = (total - minC) * zoom + PAD * 2;
  const X = (c: number) => (c - minC) * zoom + PAD;
  const C = (x: number) => (x - PAD) / zoom + minC;

  const collisions = useMemo(() => findCollisions(project), [project]);

  useEffect(() => {
    const el = scrollRef.current!;
    const ro = new ResizeObserver(() => setVw(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // follow playhead
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !playing) return;
    const x = X(count);
    if (x > el.scrollLeft + el.clientWidth * 0.8 || x < el.scrollLeft) el.scrollLeft = x - el.clientWidth * 0.25;
  });

  // ruler + waveform canvas (only the visible slice is drawn)
  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const h = RULER + WAVE;
    cv.width = vw * dpr; cv.height = h * dpr;
    cv.style.width = vw + 'px'; cv.style.height = h + 'px';
    const ctx = cv.getContext('2d')!;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, vw, h);
    const css = getComputedStyle(document.documentElement);
    const fg = css.getPropertyValue('--muted').trim() || '#888';
    const accent = css.getPropertyValue('--accent').trim() || '#ff3d7f';
    const c0 = Math.floor(C(scroll)) - 1, c1 = Math.ceil(C(scroll + vw)) + 1;

    // intro shade
    if (minC < 0) {
      ctx.fillStyle = 'rgba(255,255,255,0.03)';
      ctx.fillRect(X(minC) - scroll, 0, (0 - minC) * zoom, h);
    }

    ctx.font = '600 10px Inter, system-ui, sans-serif';
    ctx.textBaseline = 'middle';
    for (let c = Math.max(minC, c0); c <= c1; c++) {
      const x = X(c) - scroll;
      const isEight = ((c % 8) + 8) % 8 === 0;
      if (isEight) {
        ctx.fillStyle = 'rgba(255,255,255,0.14)';
        ctx.fillRect(x, 0, 1, h);
        ctx.fillStyle = c < 0 ? fg : '#fff';
        ctx.fillText(c < 0 ? 'intro' : String(c / 8 + 1), x + 4, 8);
      } else {
        ctx.fillStyle = 'rgba(255,255,255,0.12)';
        ctx.fillRect(x, RULER - 6, 1, 6);
        const beat = (((c % 8) + 8) % 8) + 1;
        if (zoom >= 16 || (zoom >= 9 && beat === 5)) {
          ctx.fillStyle = fg;
          ctx.font = '500 9px Inter, system-ui, sans-serif';
          ctx.fillText(String(beat), x + 2, 15);
          ctx.font = '600 10px Inter, system-ui, sans-serif';
        }
      }
    }

    // waveform
    const mid = RULER + WAVE / 2;
    if (analysis && music.kind === 'file') {
      const grad = ctx.createLinearGradient(0, RULER, 0, RULER + WAVE);
      grad.addColorStop(0, accent);
      grad.addColorStop(0.5, '#b18cff');
      grad.addColorStop(1, accent);
      ctx.fillStyle = grad;
      const { peaks, peaksPerSec } = analysis;
      for (let px = 0; px < vw; px += 2) {
        const sA = countToSec(C(px + scroll), music), sB = countToSec(C(px + scroll + 2), music);
        const i0 = Math.max(0, Math.floor(sA * peaksPerSec)), i1 = Math.min(peaks.length, Math.ceil(sB * peaksPerSec));
        let m = 0;
        for (let i = i0; i < i1; i++) if (peaks[i] > m) m = peaks[i];
        const ph = Math.max(1, Math.min(1, m * 1.4) * (WAVE / 2 - 2));
        ctx.globalAlpha = sA < 0 ? 0.2 : 0.85;
        ctx.fillRect(px, mid - ph, 1.4, ph * 2);
      }
      ctx.globalAlpha = 1;
    } else {
      // stylised beat pulses so you can still "see" the counts
      for (let c = Math.max(minC, c0); c <= c1; c++) {
        const x = X(c) - scroll;
        const strong = ((c % 8) + 8) % 8 === 0 ? 1 : ((c % 2) + 2) % 2 === 0 ? 0.55 : 0.35;
        ctx.fillStyle = `rgba(177,140,255,${0.25 + strong * 0.35})`;
        const ph = (WAVE / 2 - 6) * strong;
        ctx.beginPath();
        ctx.roundRect(x - 1.5, mid - ph, 3, ph * 2, 1.5);
        ctx.fill();
      }
    }
  }, [scroll, vw, zoom, analysis, music, minC, RULER, WAVE]);

  // ---- scrubbing ----
  const scrub = useRef(false);
  const seekTo = (clientX: number, shift: boolean) => {
    const r = scrollRef.current!.getBoundingClientRect();
    let c = C(clientX - r.left + scrollRef.current!.scrollLeft);
    c = Math.max(minC, shift ? c : snap(c, 0.5));
    S().set({ count: c });
    if (S().playing) player.seek(countToSec(c, S().project.music));
  };

  // ---- block drag ----
  const bd = useRef<{ id: string; mode: 'move' | 'l' | 'r'; x0: number; start: number; length: number; moved: boolean } | null>(null);
  const onBlockDown = (e: React.PointerEvent, f: Formation, mode: 'move' | 'l' | 'r') => {
    e.stopPropagation();
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    bd.current = { id: f.id, mode, x0: e.clientX, start: f.start, length: f.length, moved: false };
  };
  const onBlockMove = (e: React.PointerEvent) => {
    const d = bd.current;
    if (!d) return;
    const dx = e.clientX - d.x0;
    if (!d.moved && Math.abs(dx) < 4) return;
    if (!d.moved) { S().checkpoint(); d.moved = true; }
    const step = zoom >= 24 ? 0.5 : 1;
    const dc = snap(dx / zoom, step);
    if (d.mode === 'move') S().setTiming(d.id, d.start + dc, d.length);
    else if (d.mode === 'r') S().setTiming(d.id, d.start, Math.max(step, d.length + dc));
    else {
      const ns = Math.min(d.start + d.length - step, d.start + dc);
      S().setTiming(d.id, ns, d.start + d.length - ns);
    }
  };
  const onBlockUp = () => {
    const d = bd.current;
    bd.current = null;
    if (d && !d.moved) { S().seekFormation(d.id); if (S().playing) S().set({ playing: false }); player.pause(); }
  };

  // ---- pinch / ctrl-wheel zoom ----
  const onWheel = (e: React.WheelEvent) => {
    if (!(e.ctrlKey || e.metaKey)) return;
    const el = scrollRef.current!;
    const r = el.getBoundingClientRect();
    const anchorC = C(e.clientX - r.left + el.scrollLeft);
    const z = Math.min(60, Math.max(3, zoom * Math.exp(-e.deltaY * 0.01)));
    S().set({ zoom: z });
    requestAnimationFrame(() => { el.scrollLeft = (anchorC - minC) * z + PAD - (e.clientX - r.left); });
  };
  const pinch = useRef<{ pts: Map<number, number>; d0: number; z0: number } | null>(null);
  const onTouchPointer = (e: React.PointerEvent, phase: 'down' | 'move' | 'up') => {
    if (e.pointerType !== 'touch') return false;
    pinch.current ??= { pts: new Map(), d0: 0, z0: zoom };
    const p = pinch.current;
    if (phase === 'up') { p.pts.delete(e.pointerId); return p.pts.size > 0; }
    p.pts.set(e.pointerId, e.clientX);
    if (p.pts.size === 2) {
      const [a, b] = [...p.pts.values()];
      if (phase === 'down') { p.d0 = Math.abs(a - b) || 1; p.z0 = zoom; scrub.current = false; }
      else S().set({ zoom: Math.min(60, Math.max(3, (p.z0 * Math.abs(a - b)) / p.d0)) });
      return true;
    }
    return false;
  };

  const loopX = loop ? { l: X(loop[0]), w: (loop[1] - loop[0]) * zoom } : null;

  return (
    <div className="timeline" style={{ height: TIMELINE_H }}>
      <div
        className="tl-scroll"
        ref={scrollRef}
        onScroll={(e) => setScroll(e.currentTarget.scrollLeft)}
        onWheel={onWheel}
      >
        <div className="tl-content" style={{ width: innerW, height: TIMELINE_H }}>
          <canvas
            ref={canvasRef}
            className="tl-canvas"
            onPointerDown={(e) => {
              if (onTouchPointer(e, 'down')) return;
              scrub.current = true;
              (e.target as Element).setPointerCapture(e.pointerId);
              seekTo(e.clientX, e.shiftKey);
            }}
            onPointerMove={(e) => { if (onTouchPointer(e, 'move')) return; if (scrub.current) seekTo(e.clientX, e.shiftKey); }}
            onPointerUp={(e) => { onTouchPointer(e, 'up'); scrub.current = false; }}
            onPointerCancel={(e) => { onTouchPointer(e, 'up'); scrub.current = false; }}
          />
          {loopX && <div className="tl-loop" style={{ left: loopX.l, width: loopX.w }} />}

          {formations.map((f, i) => {
            const next = formations[i + 1];
            const gap = next ? next.start - formationEnd(f) : 0;
            return (
              <div key={f.id}>
                <div
                  className={'tl-block' + (count >= f.start && count < formationEnd(f) ? ' on' : '')}
                  style={{ left: X(f.start), width: Math.max(6, f.length * zoom), top: BLOCK_TOP, height: BLOCK_H }}
                  onPointerDown={(e) => onBlockDown(e, f, 'move')}
                  onPointerMove={onBlockMove}
                  onPointerUp={onBlockUp}
                  onPointerCancel={onBlockUp}
                >
                  {f.length * zoom > 70 && !compact && <Thumb f={f} p={project} />}
                  <div className="tl-block-text">
                    <span className="tl-num">{i + 1}</span>
                    {f.length * zoom > 44 && <span className="tl-name">{f.name}</span>}
                    {f.length * zoom > 44 && <span className="tl-len">{f.length} cts</span>}
                  </div>
                  <div className="tl-handle l" onPointerDown={(e) => onBlockDown(e, f, 'l')} onPointerMove={onBlockMove} onPointerUp={onBlockUp} />
                  <div className="tl-handle r" onPointerDown={(e) => onBlockDown(e, f, 'r')} onPointerMove={onBlockMove} onPointerUp={onBlockUp} />
                </div>
                {next && gap > 0 && (
                  <div
                    className={'tl-gap' + (count >= formationEnd(f) && count < next.start ? ' on' : '')}
                    style={{ left: X(formationEnd(f)), width: gap * zoom, top: BLOCK_TOP + 10, height: BLOCK_H - 20 }}
                    onPointerDown={(e) => { e.stopPropagation(); S().set({ count: formationEnd(f) + gap / 2, playing: false }); player.pause(); }}
                    title="Transition — tap to edit how dancers travel"
                  >
                    {gap * zoom > 34 && <span>{+gap.toFixed(1)} cts</span>}
                  </div>
                )}
              </div>
            );
          })}

          {collisions.map((c, k) => (
            <div
              key={k}
              className={'tl-collision' + (c.kind === 'spot' ? ' spot' : '')}
              style={{ left: X(c.count) - 5, top: BLOCK_TOP + BLOCK_H + 3 }}
              title={`${project.dancers.find((d) => d.id === c.a)?.name} & ${project.dancers.find((d) => d.id === c.b)?.name} ${c.kind === 'path' ? 'cross too close' : 'share a spot'}`}
              onPointerDown={(e) => { e.stopPropagation(); S().set({ count: c.count, selected: [c.a, c.b], playing: false }); player.pause(); }}
            />
          ))}

          <div className="tl-playhead" style={{ left: X(count) }} />
        </div>
      </div>
    </div>
  );
}
