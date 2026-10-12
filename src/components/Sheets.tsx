import { useState } from 'react';
import { useStore } from '../lib/store';
import { describeSpot, formatCount, formationEnd, posOf, transOf } from '../lib/engine';
import { MOVES, POSES, type Formation, type Project } from '../lib/types';
import { Icon } from './Icon';

function facingWord(deg: number) {
  const d = ((Math.round(deg / 45) * 45) % 360 + 360) % 360;
  return ({ 0: 'Front', 45: 'Front-SL', 90: 'SL', 135: 'Back-SL', 180: 'Back', 225: 'Back-SR', 270: 'SR', 315: 'Front-SR' } as Record<number, string>)[d];
}

function MiniStage({ f, p, highlight }: { f: Formation; p: Project; highlight?: string }) {
  const { width: W, depth: D } = p.stage;
  return (
    <svg className="mini-stage" viewBox={`${-W / 2 - 0.4} ${-D - 0.4} ${W + 0.8} ${D + 1.3}`}>
      <rect x={-W / 2} y={-D} width={W} height={D} className="ms-floor" />
      {Array.from({ length: 9 }, (_, k) => <line key={k} x1={((k - 4) * W) / 8} x2={((k - 4) * W) / 8} y1={-D} y2={0} className="ms-grid" />)}
      {Array.from({ length: 9 }, (_, k) => (
        <text key={'n' + k} x={((k - 4) * W) / 8} y={0.6} className="ms-num" textAnchor="middle" fontSize={0.4}>{k === 4 ? 'C' : Math.abs(k - 4) * 2}</text>
      ))}
      {p.dancers.map((d, i) => {
        const pos = posOf(f, d.id, i, p.stage);
        if (Math.abs(pos.x) > W / 2 + 0.05) return null;
        const dim = highlight && highlight !== d.id;
        return (
          <g key={d.id} transform={`translate(${pos.x},${-pos.y})`} opacity={dim ? 0.25 : 1}>
            <circle r={highlight === d.id ? 0.42 : 0.33} fill={d.color} stroke={highlight === d.id ? '#000' : 'none'} strokeWidth={0.08} />
            <text fontSize={0.32} textAnchor="middle" dominantBaseline="central" className="ms-label">{i + 1}</text>
          </g>
        );
      })}
    </svg>
  );
}

export default function Sheets({ dancerId, onClose }: { dancerId: string | null; onClose: () => void }) {
  const project = useStore((s) => s.project);
  const [who, setWho] = useState<string | null>(dancerId);
  const { formations, dancers, stage } = project;
  const dancer = dancers.find((d) => d.id === who);
  const di = dancers.findIndex((d) => d.id === who);

  return (
    <div className="sheet-back">
      <div className="sheet-bar no-print">
        <select className="input" value={who ?? ''} onChange={(e) => setWho(e.target.value || null)}>
          <option value="">All formations (team sheet)</option>
          {dancers.map((d) => <option key={d.id} value={d.id}>Cheat sheet: {d.name}</option>)}
        </select>
        <button className="btn primary" onClick={() => window.print()}><Icon name="print" size={15} /> Print / PDF</button>
        <button className="icon-btn" onClick={onClose} aria-label="Close"><Icon name="close" /></button>
      </div>
      <div className="sheet">
        <header className="sheet-head">
          <h1>{project.name}</h1>
          <div>{dancer ? <>Cheat sheet for <b style={{ color: dancer.color }}>{dancer.name}</b> (#{di + 1})</> : `${dancers.length} dancers · ${formations.length} formations`}{project.music.title ? ` · ♪ ${project.music.title}` : ''} · {project.music.bpm} BPM</div>
        </header>
        {!dancer && (
          <div className="legend">
            {dancers.map((d, i) => <span key={d.id}><i style={{ background: d.color }}>{i + 1}</i>{d.name}</span>)}
          </div>
        )}
        {!dancer ? (
          <div className="sheet-grid">
            {formations.map((f, k) => (
              <div className="sheet-card" key={f.id}>
                <div className="sc-head"><b>{k + 1}. {f.name}</b><span>{formatCount(f.start)}–{formatCount(formationEnd(f))}</span></div>
                <MiniStage f={f} p={project} />
                {f.notes && <p className="sc-notes">{f.notes}</p>}
              </div>
            ))}
          </div>
        ) : (
          <table className="cheat">
            <thead><tr><th>#</th><th>Map</th><th>Formation & counts</th><th>Your spot</th><th>Getting there</th></tr></thead>
            <tbody>
              {formations.map((f, k) => {
                const pos = posOf(f, dancer.id, di, stage);
                const t = transOf(f, dancer.id);
                const prev = formations[k - 1];
                const gap = prev ? f.start - formationEnd(prev) : 0;
                const from = prev ? posOf(prev, dancer.id, di, stage) : null;
                const moved = from && Math.hypot(from.x - pos.x, from.y - pos.y) > 0.1;
                return (
                  <tr key={f.id}>
                    <td className="big">{k + 1}</td>
                    <td><MiniStage f={f} p={project} highlight={dancer.id} /></td>
                    <td><b>{f.name}</b><div>{formatCount(f.start)} → {formatCount(formationEnd(f))}</div>{f.notes && <div className="sc-notes">{f.notes}</div>}</td>
                    <td>
                      <b>{describeSpot(pos, stage)}</b>
                      <div>{POSES.find((x) => x.id === pos.pose)?.label} · facing {facingWord(pos.facing)}</div>
                      {pos.action && <div className="pill">{pos.action}</div>}
                    </td>
                    <td>{!prev ? 'Start here' : !moved ? 'Stay' : <>
                      {MOVES.find((m) => m.id === t.move)?.label}{Math.abs(t.bend) > 0.02 ? ' (curved)' : ''}
                      <div>leave {formatCount(formationEnd(prev) + t.start * gap)}, arrive {formatCount(formationEnd(prev) + t.end * gap)}</div>
                    </>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        <footer className="sheet-foot">Made with Formation</footer>
      </div>
    </div>
  );
}
