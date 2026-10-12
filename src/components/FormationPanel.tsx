import { useMemo } from 'react';
import { useStore } from '../lib/store';
import { describeSpot, formatCount, formationEnd, locate, transOf } from '../lib/engine';
import { TEMPLATES, templateSpots, type TemplateId } from '../lib/templates';
import { MOVES, POSES, type Formation, type Pose } from '../lib/types';
import { Icon } from './Icon';

function TemplateIcon({ id }: { id: TemplateId }) {
  const pts = useMemo(() => templateSpots(id, 8, { width: 12, depth: 9, wing: 0, units: 'm' }), [id]);
  return (
    <svg viewBox="-6.5 -9.5 13 10" className="tpl-icon">
      {pts.map((p, i) => <circle key={i} cx={p.x} cy={-p.y} r={0.62} />)}
    </svg>
  );
}

const FACINGS = [
  { deg: 180, label: '↑', title: 'Face upstage (back to audience)' },
  { deg: -135, label: '↖', title: '' }, { deg: 135, label: '↗', title: '' },
  { deg: -90, label: '←', title: 'Face SR' }, { deg: 90, label: '→', title: 'Face SL' },
  { deg: -45, label: '↙', title: '' }, { deg: 45, label: '↘', title: '' },
  { deg: 0, label: '↓', title: 'Face audience' },
];

function TransitionControls({ into, ids, prev }: { into: Formation; ids: string[]; prev: Formation }) {
  const S = useStore.getState;
  const spec = transOf(into, ids[0]);
  const gapStart = formationEnd(prev), gap = into.start - gapStart;
  const setT = (patch: Parameters<ReturnType<typeof useStore.getState>['setTransitions']>[2]) => S().setTransitions(into.id, ids, patch);
  return (
    <div className="section">
      <div className="section-title"><Icon name="path" size={14} /> Traveling into “{into.name}” {ids.length > 1 && <span className="muted">· {ids.length} dancers</span>}</div>
      {gap <= 0 ? <p className="muted small">No transition time — dancers snap into place. Drag the block on the timeline to the right to make room.</p> : <>
        <div className="chips">
          {MOVES.map((m) => <button key={m.id} className={'chip' + (spec.move === m.id ? ' on' : '')} onClick={() => setT({ move: m.id })}>{m.label}</button>)}
        </div>
        <div className="row-label">Path</div>
        <div className="chips">
          <button className={'chip' + (Math.abs(spec.bend) < 0.02 ? ' on' : '')} onClick={() => setT({ bend: 0 })}>Straight</button>
          <button className={'chip' + (spec.bend > 0.02 ? ' on' : '')} onClick={() => setT({ bend: 0.3 })}>Curve ↶</button>
          <button className={'chip' + (spec.bend < -0.02 ? ' on' : '')} onClick={() => setT({ bend: -0.3 })}>Curve ↷</button>
        </div>
        <p className="muted small">Tip: drag the white dot on a selected dancer's path to shape it.</p>
        <div className="row-label">Leaves on <b>{formatCount(gapStart + spec.start * gap)}</b> · arrives <b>{formatCount(gapStart + spec.end * gap)}</b></div>
        <div className="dual-range">
          <input type="range" min={0} max={1} step={1 / Math.max(2, gap * 2)} value={spec.start}
            onChange={(e) => setT({ start: Math.min(+e.target.value, spec.end - 0.05) })} aria-label="Leave time" />
          <input type="range" min={0} max={1} step={1 / Math.max(2, gap * 2)} value={spec.end}
            onChange={(e) => setT({ end: Math.max(+e.target.value, spec.start + 0.05) })} aria-label="Arrive time" />
        </div>
      </>}
    </div>
  );
}

export default function FormationPanel() {
  const project = useStore((s) => s.project);
  const count = useStore((s) => s.count);
  const selected = useStore((s) => s.selected);
  const S = useStore.getState;
  const { formations, dancers, stage } = project;
  const where = locate(formations, count);
  if (where.kind === 'empty') return <div className="panel-empty">No formations yet.</div>;

  const idx = where.kind === 'hold' ? where.index : where.to;
  const f = formations[idx];
  const prev = formations[idx - 1];
  const inHold = where.kind === 'hold';
  const sel = selected.filter((id) => f.positions[id]);
  const first = sel[0] ? f.positions[sel[0]] : null;
  const setPos = (patch: Partial<{ pose: Pose; facing: number; action: string }>) => {
    const p: Record<string, typeof patch> = {};
    sel.forEach((id) => (p[id] = patch));
    S().movePositions(f.id, p);
  };

  return (
    <div className="panel">
      <div className="formation-head">
        <span className="f-index">{idx + 1}</span>
        <input className="title-input" value={f.name} onChange={(e) => S().mutate((p) => { p.formations[idx].name = e.target.value; })} aria-label="Formation name" />
      </div>
      <div className="f-meta">
        <span>{formatCount(f.start)} → {formatCount(formationEnd(f))}</span>
        <div className="stepper">
          <button onClick={() => { S().checkpoint(); S().setTiming(f.id, f.start, f.length - 1); }} aria-label="Shorter">−</button>
          <span>{f.length} cts</span>
          <button onClick={() => { S().checkpoint(); S().setTiming(f.id, f.start, f.length + 1); }} aria-label="Longer">+</button>
        </div>
      </div>
      {!inHold && <div className="callout">You're mid-transition. Settings below control how dancers travel into <b>{f.name}</b>. <button className="link" onClick={() => S().seekFormation(f.id)}>Jump to formation</button></div>}

      {inHold && sel.length > 0 && first && (
        <div className="section">
          <div className="section-title"><Icon name="users" size={14} /> {sel.length === 1 ? dancers.find((d) => d.id === sel[0])?.name : `${sel.length} dancers`}
            {sel.length === 1 && <span className="muted small spot">{describeSpot(first, stage)}</span>}
          </div>
          <div className="row-label">Level</div>
          <div className="chips">
            {POSES.map((p) => <button key={p.id} className={'chip' + (first.pose === p.id ? ' on' : '')} onClick={() => setPos({ pose: p.id })} title={`${p.label} (${p.key})`}>{p.label}</button>)}
          </div>
          <div className="facing-row">
            <div>
              <div className="row-label">Facing</div>
              <div className="compass">
                {FACINGS.map((x) => <button key={x.deg} className={Math.round(((first.facing % 360) + 360) % 360) === ((x.deg + 360) % 360) ? 'on' : ''} onClick={() => setPos({ facing: x.deg })} title={x.title}>{x.label}</button>)}
                <span className="compass-center" />
              </div>
            </div>
            <div className="grow">
              <div className="row-label">Move / action label</div>
              <input className="input" placeholder="e.g. Windmill, Wave L→R, Hit" value={sel.length === 1 ? first.action ?? '' : ''}
                onChange={(e) => setPos({ action: e.target.value })} />
              <div className="muted small" style={{ marginTop: 6 }}>Shows above their dot in this formation.</div>
            </div>
          </div>
        </div>
      )}

      {prev && (sel.length > 0 || !inHold) && <TransitionControls into={f} prev={prev} ids={sel.length ? sel : dancers.map((d) => d.id)} />}

      {inHold && <>
        <div className="section">
          <div className="section-title"><Icon name="wand" size={14} /> Instant formations <span className="muted small">· {selected.length > 1 ? `${selected.length} selected` : 'everyone'}</span></div>
          <div className="tpl-grid">
            {TEMPLATES.map((t) => (
              <button key={t.id} className="tpl" onClick={() => S().applyTemplate(t.id)} title={t.hint}>
                <TemplateIcon id={t.id} />
                <span>{t.label}</span>
              </button>
            ))}
          </div>
          <p className="muted small">Smart assign picks who goes where so the total travel is shortest — fewer collisions, cleaner transitions.</p>
        </div>

        <div className="section">
          <div className="section-title"><Icon name="align" size={14} /> Arrange</div>
          <div className="chips">
            <button className="chip" onClick={() => S().mirror()}><Icon name="mirror" size={14} /> Mirror</button>
            <button className="chip" onClick={() => S().swap()}>Swap 2</button>
            <button className="chip" onClick={() => S().align('y')}>Align row</button>
            <button className="chip" onClick={() => S().align('x')}>Align column</button>
            <button className="chip" onClick={() => S().distribute('x')}>Space ↔</button>
            <button className="chip" onClick={() => S().distribute('y')}>Space ↕</button>
          </div>
        </div>

        {prev && <div className="section">
          <div className="section-title"><Icon name="ripple" size={14} /> Ripple / canon into this formation</div>
          <div className="chips">
            <button className="chip" onClick={() => S().ripple('rl')}>SR → SL</button>
            <button className="chip" onClick={() => S().ripple('lr')}>SL → SR</button>
            <button className="chip" onClick={() => S().ripple('center')}>Center out</button>
            <button className="chip" onClick={() => S().ripple('front')}>Front → back</button>
            <button className="chip" onClick={() => S().ripple('clear')}>Together</button>
          </div>
        </div>}
      </>}

      <div className="section">
        <div className="row-label">Notes for the team</div>
        <textarea className="input" rows={3} placeholder="Counts, cues, who leads…" value={f.notes ?? ''}
          onChange={(e) => S().mutate((p) => { p.formations[idx].notes = e.target.value; })} />
      </div>

      <div className="section actions">
        <button className="btn" onClick={() => S().duplicateFormation(f.id)}><Icon name="copy" size={15} /> Duplicate</button>
        <button className="btn danger" onClick={() => S().deleteFormation(f.id)}><Icon name="trash" size={15} /> Delete</button>
      </div>
    </div>
  );
}
