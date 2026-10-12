import { useStore } from '../lib/store';
import { describeSpot, locate, posOf } from '../lib/engine';
import { Icon } from './Icon';

export default function DancersPanel({ onCheatSheet }: { onCheatSheet: (id: string) => void }) {
  const project = useStore((s) => s.project);
  const count = useStore((s) => s.count);
  const selected = useStore((s) => s.selected);
  const spotlight = useStore((s) => s.spotlight);
  const S = useStore.getState;
  const { dancers, formations, stage } = project;
  const where = locate(formations, count);
  const f = where.kind === 'hold' ? formations[where.index] : where.kind === 'transition' ? formations[where.to] : undefined;

  return (
    <div className="panel">
      <div className="section-title big">
        <Icon name="users" size={16} /> Team <span className="muted">· {dancers.length}</span>
        <button className="btn sm primary push" onClick={() => S().addDancer()}><Icon name="plus" size={14} /> Add</button>
      </div>
      <p className="muted small">Tap the eye to <b>spotlight</b> a dancer — everyone else fades and their full path through the set is drawn with numbered stops. Perfect for learning your spots.</p>
      <ul className="dancer-list">
        {dancers.map((d, i) => {
          const pos = posOf(f, d.id, i, stage);
          const on = selected.includes(d.id);
          return (
            <li key={d.id} className={(on ? 'on ' : '') + (spotlight === d.id ? 'spot' : '')} onClick={() => S().set({ selected: [d.id] })}>
              <label className="swatch" style={{ background: d.color }} onClick={(e) => e.stopPropagation()}>
                <span>{i + 1}</span>
                <input type="color" value={d.color} onChange={(e) => S().updateDancer(d.id, { color: e.target.value })} aria-label="Color" />
              </label>
              <div className="dancer-main">
                <input className="name-input" value={d.name} onClick={(e) => e.stopPropagation()} onChange={(e) => S().updateDancer(d.id, { name: e.target.value })} aria-label="Name" />
                <div className="muted small">{describeSpot(pos, stage)}</div>
              </div>
              <input className="group-input" placeholder="Grp" value={d.group ?? ''} onClick={(e) => e.stopPropagation()} onChange={(e) => S().updateDancer(d.id, { group: e.target.value })} aria-label="Group" />
              <button className={'icon-btn' + (spotlight === d.id ? ' on' : '')} title="Spotlight path" onClick={(e) => { e.stopPropagation(); S().set({ spotlight: spotlight === d.id ? null : d.id }); }}><Icon name="eye" size={16} /></button>
              <button className="icon-btn" title="Cheat sheet" onClick={(e) => { e.stopPropagation(); onCheatSheet(d.id); }}><Icon name="file" size={16} /></button>
              <button className="icon-btn danger" title="Remove" onClick={(e) => { e.stopPropagation(); if (confirm(`Remove ${d.name} from every formation?`)) S().removeDancer(d.id); }}><Icon name="trash" size={16} /></button>
            </li>
          );
        })}
      </ul>
      {(() => {
        const groups = [...new Set(dancers.map((d) => d.group).filter(Boolean))] as string[];
        if (!groups.length) return null;
        return (
          <div className="section">
            <div className="row-label">Select group</div>
            <div className="chips">
              {groups.map((g) => <button key={g} className="chip" onClick={() => S().set({ selected: dancers.filter((d) => d.group === g).map((d) => d.id) })}>Group {g}</button>)}
              <button className="chip" onClick={() => S().set({ selected: dancers.map((d) => d.id) })}>Everyone</button>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
