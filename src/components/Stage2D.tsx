import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../lib/store';
import {
  bendFromCtrl, bezier, findCollisions, frameAt, locate, pathCtrl, posOf, snap, transOf,
  type DancerFrame, type Pt,
} from '../lib/engine';
import type { Pose } from '../lib/types';

const R = 0.3; // token radius (m)
const POSE_BADGE: Record<Pose, string> = { stand: '', crouch: 'C', kneel: 'K', sit: 'S', floor: 'F', jump: 'J' };

interface View { zoom: number; px: number; py: number }

export default function Stage2D() {
  const project = useStore((s) => s.project);
  const count = useStore((s) => s.count);
  const selected = useStore((s) => s.selected);
  const spotlight = useStore((s) => s.spotlight);
  const dancerView = useStore((s) => s.dancerView);
  const showPaths = useStore((s) => s.showPaths);
  const showGhost = useStore((s) => s.showGhost);
  const showNames = useStore((s) => s.showNames);
  const snapGrid = useStore((s) => s.snapGrid);
  const playing = useStore((s) => s.playing);

  const { stage, formations, dancers } = project;
  const W = stage.width, D = stage.depth, WING = stage.wing;

  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState({ w: 800, h: 500 });
  const [view, setView] = useState<View>({ zoom: 1, px: 0, py: 0 });
  const [marquee, setMarquee] = useState<{ a: Pt; b: Pt } | null>(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ---- coordinate mapping (stage meters <-> svg units) ----
  const toS = (x: number, y: number): Pt => (dancerView ? { x: -x, y: y - D } : { x, y: -y });
  const fromS = (sx: number, sy: number): Pt => (dancerView ? { x: -sx, y: sy + D } : { x: sx, y: -sy });
  const facingRot = (deg: number) => (dancerView ? 180 - deg : -deg);

  // content box: stage + wings + labels, fitted to the container without letterboxing
  const portrait = size.w / Math.max(1, size.h) < 1.25;
  const wingShown = portrait ? Math.min(WING, 1.8) : WING;
  const box = { x: -W / 2 - wingShown, y: -D - 1.1, w: W + wingShown * 2, h: D + 2.2 };
  const coarse = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;
  const fit = Math.min(size.w / box.w, size.h / box.h) || 1;
  const vbW0 = size.w / fit, vbH0 = size.h / fit;
  const vbW = vbW0 / view.zoom, vbH = vbH0 / view.zoom;
  const cx = box.x + box.w / 2 + view.px, cy = box.y + box.h / 2 + view.py;
  const vb = { x: cx - vbW / 2, y: cy - vbH / 2, w: vbW, h: vbH };

  const clientToStage = (clientX: number, clientY: number): Pt => {
    const r = svgRef.current!.getBoundingClientRect();
    const sx = vb.x + ((clientX - r.left) / r.width) * vb.w;
    const sy = vb.y + ((clientY - r.top) / r.height) * vb.h;
    return fromS(sx, sy);
  };

  // ---- frames ----
  const where = locate(formations, count);
  const activeIdx = where.kind === 'hold' ? where.index : -1;
  const active = activeIdx >= 0 ? formations[activeIdx] : null;
  const prevF = activeIdx > 0 ? formations[activeIdx - 1] : null;
  const frames = useMemo(() => frameAt(project, count), [project, count]);
  const trail = useMemo(() => (playing || where.kind === 'transition' ? frameAt(project, count - 0.35) : null), [project, count, playing, where.kind]);
  const collisions = useMemo(() => findCollisions(project), [project]);
  const nearCollisions = collisions.filter((c) => Math.abs(c.count - count) < (c.kind === 'spot' ? 0.01 : 0.6) || (c.kind === 'spot' && active && c.count === active.start));
  const indexOf = useMemo(() => new Map(dancers.map((d, i) => [d.id, i])), [dancers]);

  // ---- interaction state ----
  const drag = useRef<
    | { kind: 'dancers'; start: Pt; orig: Record<string, Pt>; lead: string; moved: boolean; shift: boolean; id: string }
    | { kind: 'facing'; id: string }
    | { kind: 'bend'; id: string; A: Pt; B: Pt }
    | { kind: 'marquee'; start: Pt; moved: boolean }
    | { kind: 'pinch'; d0: number; view0: View; mid0: { x: number; y: number } }
    | { kind: 'pan'; last: { x: number; y: number } }
    | null
  >(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());

  const S = useStore.getState;

  const onDancerDown = (e: React.PointerEvent, id: string) => {
    e.stopPropagation();
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (S().playing) return;
    const shift = e.shiftKey || e.metaKey || e.ctrlKey;
    if (!active) {
      S().set({ selected: [id] });
      S().toastMsg('Mid-transition — tap a formation on the timeline to move spots');
      return;
    }
    let sel = S().selected;
    if (!sel.includes(id)) sel = shift ? [...sel, id] : [id];
    S().set({ selected: sel });
    const orig: Record<string, Pt> = {};
    sel.forEach((sid) => { const p = posOf(active, sid, indexOf.get(sid) ?? 0, stage); orig[sid] = { x: p.x, y: p.y }; });
    drag.current = { kind: 'dancers', start: clientToStage(e.clientX, e.clientY), orig, lead: id, moved: false, shift, id };
    svgRef.current?.setPointerCapture(e.pointerId);
  };

  const onBgDown = (e: React.PointerEvent) => {
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    svgRef.current?.setPointerCapture(e.pointerId);
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      drag.current = { kind: 'pinch', d0: Math.hypot(a.x - b.x, a.y - b.y), view0: view, mid0: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
      setMarquee(null);
      return;
    }
    if (e.button === 1 || e.altKey) { drag.current = { kind: 'pan', last: { x: e.clientX, y: e.clientY } }; return; }
    const p = clientToStage(e.clientX, e.clientY);
    drag.current = { kind: 'marquee', start: p, moved: false };
  };

  const onMove = (e: React.PointerEvent) => {
    if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const d = drag.current;
    if (!d) return;
    const p = clientToStage(e.clientX, e.clientY);
    if (d.kind === 'dancers' && active) {
      const dx = p.x - d.start.x, dy = p.y - d.start.y;
      if (!d.moved && Math.hypot(dx, dy) < 0.06) return;
      if (!d.moved) { S().checkpoint(); d.moved = true; }
      const lead = d.orig[d.lead];
      let nx = lead.x + dx, ny = lead.y + dy;
      if (snapGrid && !e.altKey) { nx = snap(nx, 0.25); ny = snap(ny, 0.25); }
      const ddx = nx - lead.x, ddy = ny - lead.y;
      const patch: Record<string, Pt> = {};
      for (const [id, o] of Object.entries(d.orig)) patch[id] = { x: +(o.x + ddx).toFixed(3), y: +(o.y + ddy).toFixed(3) };
      S().movePositions(active.id, patch, false);
    } else if (d.kind === 'facing' && active) {
      const c = active.positions[d.id];
      let deg = (Math.atan2(p.x - c.x, -(p.y - c.y)) * 180) / Math.PI;
      deg = e.altKey ? Math.round(deg) : snap(deg, 45);
      S().movePositions(active.id, { [d.id]: { facing: deg } }, false);
    } else if (d.kind === 'bend' && active) {
      // handle sits at the curve midpoint M = (A + 2C + B) / 4
      const C = { x: 2 * p.x - (d.A.x + d.B.x) / 2, y: 2 * p.y - (d.A.y + d.B.y) / 2 };
      let bend = bendFromCtrl(d.A, d.B, C);
      if (Math.abs(bend) < 0.04) bend = 0;
      S().mutate((pr) => {
        const f = pr.formations.find((x) => x.id === active.id)!;
        f.transitions[d.id] = { ...transOf(f, d.id), bend: +bend.toFixed(3) };
      }, { history: false });
    } else if (d.kind === 'marquee') {
      if (!d.moved && Math.hypot(p.x - d.start.x, p.y - d.start.y) < 0.15) return;
      d.moved = true;
      setMarquee({ a: d.start, b: p });
      const x0 = Math.min(d.start.x, p.x), x1 = Math.max(d.start.x, p.x);
      const y0 = Math.min(d.start.y, p.y), y1 = Math.max(d.start.y, p.y);
      const ids = frames.filter((f) => f.x >= x0 && f.x <= x1 && f.y >= y0 && f.y <= y1).map((f) => f.id);
      S().set({ selected: ids });
    } else if (d.kind === 'pinch' && pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const zoom = Math.min(5, Math.max(0.6, (d.view0.zoom * dist) / d.d0));
      const r = svgRef.current!.getBoundingClientRect();
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const unitsPerPx = vbW0 / zoom / r.width;
      setView({ zoom, px: d.view0.px - (mid.x - d.mid0.x) * unitsPerPx, py: d.view0.py - (mid.y - d.mid0.y) * unitsPerPx });
    } else if (d.kind === 'pan') {
      const r = svgRef.current!.getBoundingClientRect();
      const k = vb.w / r.width;
      setView((v) => ({ ...v, px: v.px - (e.clientX - d.last.x) * k, py: v.py - (e.clientY - d.last.y) * k }));
      d.last = { x: e.clientX, y: e.clientY };
    }
  };

  const onUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    const d = drag.current;
    if (d?.kind === 'marquee' && !d.moved) S().set({ selected: [] });
    if (d?.kind === 'dancers' && !d.moved && d.shift && S().selected.length > 1) {
      // shift-tap on an already-selected dancer toggles it off
      S().set({ selected: S().selected.filter((x) => x !== d.id) });
    }
    if (d?.kind === 'pinch' && pointers.current.size === 1) { drag.current = null; return; }
    drag.current = null;
    setMarquee(null);
  };

  const onWheel = (e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      const z = Math.min(5, Math.max(0.6, view.zoom * Math.exp(-e.deltaY * 0.01)));
      setView((v) => ({ ...v, zoom: z }));
    } else if (view.zoom > 1.01) {
      const r = svgRef.current!.getBoundingClientRect();
      const k = vb.w / r.width;
      setView((v) => ({ ...v, px: v.px + e.deltaX * k, py: v.py + e.deltaY * k }));
    }
  };

  const startFacing = (e: React.PointerEvent, id: string) => {
    e.stopPropagation();
    S().checkpoint();
    drag.current = { kind: 'facing', id };
    svgRef.current?.setPointerCapture(e.pointerId);
  };
  const startBend = (e: React.PointerEvent, id: string, A: Pt, B: Pt) => {
    e.stopPropagation();
    S().checkpoint();
    drag.current = { kind: 'bend', id, A, B };
    svgRef.current?.setPointerCapture(e.pointerId);
  };

  // ---- drawing helpers ----
  const pathD = (A: Pt, B: Pt, bend: number) => {
    const a = toS(A.x, A.y), b = toS(B.x, B.y);
    const c = pathCtrl(A, B, bend), cs = toS(c.x, c.y);
    return `M${a.x},${a.y} Q${cs.x},${cs.y} ${b.x},${b.y}`;
  };

  const stageNumbers = [];
  for (let k = -4; k <= 4; k++) {
    const x = (k * W) / 8;
    const p = toS(x, -0.45);
    stageNumbers.push(
      <text key={k} x={p.x} y={p.y} className="stage-num" textAnchor="middle" dominantBaseline="middle" fontSize={0.34}>
        {k === 0 ? 'C' : Math.abs(k) * 2}
      </text>,
    );
  }

  const gridLines = [];
  for (let k = -8; k <= 8; k++) {
    const x = (k * W) / 16;
    const a = toS(x, 0), b = toS(x, D);
    gridLines.push(<line key={'v' + k} x1={a.x} y1={a.y} x2={b.x} y2={b.y} className={k === 0 ? 'grid center' : k % 2 === 0 ? 'grid major' : 'grid'} />);
  }
  const rowStep = W / 16;
  for (let y = rowStep; y < D - 0.01; y += rowStep) {
    const a = toS(-W / 2, y), b = toS(W / 2, y);
    gridLines.push(<line key={'h' + y} x1={a.x} y1={a.y} x2={b.x} y2={b.y} className="grid" />);
  }

  const stageRect = (() => {
    const a = toS(-W / 2, 0), b = toS(W / 2, D);
    return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y) };
  })();
  const wingL = toS(-W / 2 - WING, 0), wingR = toS(W / 2 + WING, D);

  const label = (x: number, y: number, text: string, cls = 'stage-label', size = 0.3) => {
    const p = toS(x, y);
    return <text x={p.x} y={p.y} className={cls} textAnchor="middle" dominantBaseline="middle" fontSize={size}>{text}</text>;
  };

  // Spotlight journey for one dancer
  const journey = spotlight ? (() => {
    const i = indexOf.get(spotlight) ?? 0;
    const color = dancers[i]?.color ?? '#fff';
    const segs: JSX.Element[] = [];
    formations.forEach((f, k) => {
      const B = posOf(f, spotlight, i, stage);
      if (k > 0) {
        const A = posOf(formations[k - 1], spotlight, i, stage);
        segs.push(<path key={'p' + k} d={pathD(A, B, transOf(f, spotlight).bend)} className="journey" stroke={color} />);
      }
    });
    formations.forEach((f, k) => {
      const B = posOf(f, spotlight, i, stage), s = toS(B.x, B.y);
      segs.push(
        <g key={'w' + k} transform={`translate(${s.x},${s.y})`} className="waypoint">
          <circle r={0.2} fill="#0b0b10" stroke={color} strokeWidth={0.04} />
          <text fontSize={0.2} textAnchor="middle" dominantBaseline="central" fill={color}>{k + 1}</text>
        </g>,
      );
    });
    return segs;
  })() : null;

  const renderToken = (f: DancerFrame) => {
    const i = indexOf.get(f.id) ?? 0;
    const d = dancers[i];
    const s = toS(f.x, f.y);
    const isSel = selected.includes(f.id);
    const dim = (spotlight && spotlight !== f.id) ? 0.18 : f.offstage ? 0.45 : 1;
    const rot = facingRot(f.facing);
    const pose = f.pose;
    const jumpLift = pose === 'jump' ? 0.12 : 0;
    const body = (() => {
      switch (pose) {
        case 'floor': return <rect x={-R * 0.65} y={-R * 1.55} width={R * 1.3} height={R * 3.1} rx={R * 0.65} fill={d.color} />;
        case 'sit': return <rect x={-R * 0.9} y={-R * 0.9} width={R * 1.8} height={R * 1.8} rx={R * 0.45} fill={d.color} />;
        case 'kneel': return <circle r={R * 0.88} fill={d.color} />;
        case 'crouch': return <circle r={R * 0.94} fill={d.color} />;
        default: return <circle r={R} fill={d.color} />;
      }
    })();
    const tr = trail?.find((t) => t.id === f.id);
    return (
      <g key={f.id} opacity={dim} className="token-wrap">
        {tr && f.moving && (() => { const ts = toS(tr.x, tr.y); return <line x1={ts.x} y1={ts.y} x2={s.x} y2={s.y} stroke={d.color} strokeWidth={R * 1.2} strokeLinecap="round" opacity={0.25} />; })()}
        <g transform={`translate(${s.x},${s.y - jumpLift})`} onPointerDown={(e) => onDancerDown(e, f.id)} className="token">
          <circle r={coarse ? 0.62 : 0.4} fill="transparent" />
          {pose === 'jump' && <ellipse cx={0} cy={jumpLift + R * 0.2} rx={R * 0.9} ry={R * 0.35} fill="#000" opacity={0.45} />}
          {isSel && <circle r={R + 0.1} className="sel-ring" />}
          <g transform={`rotate(${rot})`}>
            {body}
            <path d={`M${-R * 0.42},${R * 0.62} L0,${R * 1.18} L${R * 0.42},${R * 0.62}Z`} fill={d.color} className="notch" />
            {pose === 'kneel' && <circle r={R * 0.88} fill="none" stroke="#0b0b10" strokeWidth={0.035} strokeDasharray="0.08 0.06" />}
            {pose === 'crouch' && <circle r={R * 0.6} fill="none" stroke="#0b0b10" strokeOpacity={0.45} strokeWidth={0.04} />}
          </g>
          <text className="token-num" fontSize={R * 0.95} textAnchor="middle" dominantBaseline="central">{i + 1}</text>
          {POSE_BADGE[pose] && (
            <g transform={`translate(${R * 0.85},${-R * 0.85})`}>
              <circle r={0.15} className="badge" />
              <text fontSize={0.17} textAnchor="middle" dominantBaseline="central" className="badge-text">{POSE_BADGE[pose]}</text>
            </g>
          )}
          {showNames && <text y={R + 0.3} className="token-name" fontSize={0.24} textAnchor="middle">{d.name}</text>}
          {f.action && <g transform={`translate(0,${-R - 0.32})`}>
            <rect x={-f.action.length * 0.075 - 0.12} y={-0.17} width={f.action.length * 0.15 + 0.24} height={0.34} rx={0.17} className="action-pill" />
            <text fontSize={0.2} textAnchor="middle" dominantBaseline="central" className="action-text">{f.action}</text>
          </g>}
          {f.moving && f.move && f.move !== 'walk' && <text y={R + (showNames ? 0.58 : 0.32)} className="move-tag" fontSize={0.17} textAnchor="middle">{f.move.toUpperCase()}</text>}
        </g>
      </g>
    );
  };

  // Paths + ghosts for the transition into the active formation (or the current one mid-transition)
  const pathPair = active && prevF ? { A: prevF, B: active } : where.kind === 'transition' ? { A: formations[where.from], B: formations[where.to] } : null;

  const single = selected.length === 1 && active ? selected[0] : null;
  const singlePos = single && active ? active.positions[single] : null;

  return (
    <div ref={wrapRef} className="stage2d">
      <svg
        ref={svgRef}
        viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
        onPointerDown={onBgDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onWheel={onWheel}
        onDoubleClick={(e) => { if (e.target === svgRef.current || (e.target as Element).classList.contains('floor')) setView({ zoom: 1, px: 0, py: 0 }); }}
      >
        <defs>
          <pattern id="hatch" width="0.4" height="0.4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="0.4" stroke="rgba(255,255,255,0.045)" strokeWidth="0.06" />
          </pattern>
          <radialGradient id="floorGlow" cx="50%" cy={dancerView ? '30%' : '70%'} r="75%">
            <stop offset="0%" stopColor="var(--floor-hi)" />
            <stop offset="100%" stopColor="var(--floor)" />
          </radialGradient>
          <marker id="arrow" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" fill="context-stroke" />
          </marker>
        </defs>

        <rect x={Math.min(wingL.x, wingR.x)} y={Math.min(wingL.y, wingR.y)} width={Math.abs(wingR.x - wingL.x)} height={Math.abs(wingR.y - wingL.y)} fill="url(#hatch)" className="wings" />
        <rect x={stageRect.x} y={stageRect.y} width={stageRect.w} height={stageRect.h} fill="url(#floorGlow)" className="floor" rx={0.08} />
        {gridLines}
        <rect x={stageRect.x} y={stageRect.y} width={stageRect.w} height={stageRect.h} className="stage-edge" rx={0.08} />
        {(() => { const a = toS(-W / 2, 0), b = toS(W / 2, 0); return <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} className="front-edge" />; })()}
        {stageNumbers}
        {label(0, -0.95, 'AUDIENCE', 'stage-label strong', 0.28)}
        {label(0, D + 0.5, 'UPSTAGE', 'stage-label', 0.26)}
        {label(-W / 2 - WING / 2, D / 2, 'SR WING', 'stage-label', 0.26)}
        {label(W / 2 + WING / 2, D / 2, 'SL WING', 'stage-label', 0.26)}

        {journey}

        {pathPair && showPaths && !spotlight && dancers.map((d, i) => {
          const A = posOf(pathPair.A, d.id, i, stage), B = posOf(pathPair.B, d.id, i, stage);
          if (Math.hypot(A.x - B.x, A.y - B.y) < 0.05) return null;
          const sel = selected.includes(d.id);
          return <path key={'path' + d.id} d={pathD(A, B, transOf(pathPair.B, d.id).bend)} className={'travel' + (sel ? ' sel' : '')} stroke={d.color} markerEnd="url(#arrow)" />;
        })}

        {active && prevF && showGhost && !spotlight && dancers.map((d, i) => {
          const A = posOf(prevF, d.id, i, stage);
          const B = posOf(active, d.id, i, stage);
          if (Math.hypot(A.x - B.x, A.y - B.y) < 0.05) return null;
          const s = toS(A.x, A.y);
          return <circle key={'g' + d.id} cx={s.x} cy={s.y} r={R * 0.8} className="ghost" stroke={d.color} />;
        })}

        {nearCollisions.map((c, k) => {
          const s = toS(c.x, c.y);
          return (
            <g key={'c' + k} transform={`translate(${s.x},${s.y})`} className="collision">
              <circle r={0.6} />
              <text fontSize={0.36} textAnchor="middle" dominantBaseline="central">!</text>
            </g>
          );
        })}

        {frames.map(renderToken)}

        {/* path bend handles for selected dancers */}
        {active && prevF && !playing && dancers.filter((d) => selected.includes(d.id)).map((d) => {
          const i = indexOf.get(d.id) ?? 0;
          const A = posOf(prevF, d.id, i, stage), B = posOf(active, d.id, i, stage);
          if (Math.hypot(A.x - B.x, A.y - B.y) < 0.4) return null;
          const m = bezier(A, pathCtrl(A, B, transOf(active, d.id).bend), B, 0.5), s = toS(m.x, m.y);
          return <circle key={'b' + d.id} cx={s.x} cy={s.y} r={0.16} className="bend-handle" onPointerDown={(e) => startBend(e, d.id, A, B)} />;
        })}

        {/* facing handle */}
        {single && singlePos && !playing && (() => {
          const rad = (singlePos.facing * Math.PI) / 180;
          const hx = singlePos.x + Math.sin(rad) * 0.85, hy = singlePos.y - Math.cos(rad) * 0.85;
          const c = toS(singlePos.x, singlePos.y), h = toS(hx, hy);
          return (
            <g>
              <line x1={c.x} y1={c.y} x2={h.x} y2={h.y} className="facing-line" />
              <circle cx={h.x} cy={h.y} r={0.15} className="facing-handle" onPointerDown={(e) => startFacing(e, single)} />
            </g>
          );
        })()}

        {marquee && (() => {
          const a = toS(marquee.a.x, marquee.a.y), b = toS(marquee.b.x, marquee.b.y);
          return <rect x={Math.min(a.x, b.x)} y={Math.min(a.y, b.y)} width={Math.abs(b.x - a.x)} height={Math.abs(b.y - a.y)} className="marquee" />;
        })()}
      </svg>
      {where.kind === 'transition' && !playing && (
        <div className="stage-hint">Transition → <b>{formations[where.to].name}</b> · {Math.round(where.p * 100)}%</div>
      )}
      {view.zoom !== 1 && <button className="chip fit-btn" onClick={() => setView({ zoom: 1, px: 0, py: 0 })}>Fit stage</button>}
    </div>
  );
}
