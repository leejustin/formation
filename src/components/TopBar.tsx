import { useMemo, useRef, useState } from 'react';
import { useStore, type ViewMode } from '../lib/store';
import { findCollisions } from '../lib/engine';
import { exportFile, importFile, shareLink } from '../lib/io';
import { player } from '../lib/player';
import { Icon } from './Icon';

export default function TopBar({ onSheets }: { onSheets: () => void }) {
  const project = useStore((s) => s.project);
  const view = useStore((s) => s.view);
  const past = useStore((s) => s.past.length);
  const future = useStore((s) => s.future.length);
  const showPaths = useStore((s) => s.showPaths);
  const showGhost = useStore((s) => s.showGhost);
  const showNames = useStore((s) => s.showNames);
  const dancerView = useStore((s) => s.dancerView);
  const snapGrid = useStore((s) => s.snapGrid);
  const S = useStore.getState;
  const [menu, setMenu] = useState<'file' | 'view' | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const collisions = useMemo(() => findCollisions(project), [project]);

  const views: { id: ViewMode; icon: string; label: string }[] = [
    { id: '2d', icon: 'square', label: '2D' },
    { id: 'split', icon: 'split', label: 'Both' },
    { id: '3d', icon: 'cube', label: '3D' },
  ];

  const toggle = (k: 'showPaths' | 'showGhost' | 'showNames' | 'dancerView' | 'snapGrid', v: boolean, label: string) => (
    <label className="menu-toggle"><input type="checkbox" checked={v} onChange={(e) => S().set({ [k]: e.target.checked })} /><span>{label}</span></label>
  );

  return (
    <header className="topbar">
      <div className="brand" aria-label="Formation">
        <svg viewBox="0 0 64 64" width="26" height="26"><circle cx="20" cy="40" r="8" fill="#ff3d7f" /><circle cx="32" cy="22" r="8" fill="#ffd23f" /><circle cx="44" cy="40" r="8" fill="#3dd6ff" /></svg>
        <span className="brand-word hide-sm">FORMATION</span>
      </div>
      <input className="project-name" value={project.name} onChange={(e) => S().mutate((p) => { p.name = e.target.value; })} aria-label="Set name" />

      <div className="tb-group">
        <button className="icon-btn" disabled={!past} onClick={() => S().undo()} aria-label="Undo"><Icon name="undo" /></button>
        <button className="icon-btn" disabled={!future} onClick={() => S().redo()} aria-label="Redo"><Icon name="redo" /></button>
      </div>

      {collisions.length > 0 && (
        <button className="traffic" onClick={() => { const c = collisions[0]; S().set({ count: c.count, selected: [c.a, c.b], playing: false }); player.pause(); }} title="Dancers passing too close — tap to jump there">
          <Icon name="alert" size={14} /> <span>{collisions.length}<span className="hide-sm"> traffic</span></span>
        </button>
      )}

      <div className="seg">
        {views.map((v) => (
          <button key={v.id} className={view === v.id ? 'on' : ''} onClick={() => S().set({ view: v.id })} aria-label={v.label}>
            <Icon name={v.icon} size={15} /><span className="hide-sm">{v.label}</span>
          </button>
        ))}
      </div>

      <div className="tb-group menus">
        <div className="menu-wrap hide-sm">
          <button className="icon-btn" onClick={() => setMenu(menu === 'view' ? null : 'view')} aria-label="View options"><Icon name="eye" /></button>
          {menu === 'view' && (
            <div className="menu" onMouseLeave={() => setMenu(null)}>
              {toggle('showPaths', showPaths, 'Travel paths')}
              {toggle('showGhost', showGhost, 'Ghost of previous spots')}
              {toggle('showNames', showNames, 'Names')}
              {toggle('snapGrid', snapGrid, 'Snap to grid')}
              {toggle('dancerView', dancerView, 'Dancer’s view (audience at top)')}
            </div>
          )}
        </div>
        <button className="btn hide-sm" onClick={onSheets}><Icon name="print" size={15} /> Sheets</button>
        <button className="btn primary hide-sm" onClick={shareLink}><Icon name="share" size={15} /> Share</button>
        <div className="menu-wrap">
          <button className="icon-btn" onClick={() => setMenu(menu === 'file' ? null : 'file')} aria-label="More"><Icon name="more" /></button>
          {menu === 'file' && (
            <div className="menu right" onMouseLeave={() => setMenu(null)}>
              <button className="show-sm" onClick={() => { setMenu(null); shareLink(); }}><Icon name="share" size={14} /> Share link</button>
              <div className="show-sm">
                {toggle('showPaths', showPaths, 'Travel paths')}
                {toggle('showGhost', showGhost, 'Ghost of previous spots')}
                {toggle('showNames', showNames, 'Names')}
                {toggle('snapGrid', snapGrid, 'Snap to grid')}
                {toggle('dancerView', dancerView, 'Dancer’s view')}
                <hr />
              </div>
              <button onClick={() => { setMenu(null); if (confirm('Start a new blank set? (Your current set is replaced — save it first if needed.)')) S().newProject(); }}>New blank set</button>
              <button onClick={() => { setMenu(null); S().loadDemo(); }}>Load demo set</button>
              <hr />
              <button onClick={() => { setMenu(null); fileRef.current?.click(); }}><Icon name="upload" size={14} /> Open set file…</button>
              <button onClick={() => { setMenu(null); exportFile(); }}><Icon name="download" size={14} /> Save set file</button>
              <button onClick={() => { setMenu(null); onSheets(); }}><Icon name="print" size={14} /> Formation sheets & cheat sheets</button>
            </div>
          )}
        </div>
      </div>
      <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) importFile(f); e.target.value = ''; }} />
    </header>
  );
}
