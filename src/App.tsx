import { useEffect, useState } from 'react';
import { useStore, type Panel, type ViewMode } from './lib/store';
import { startClock, togglePlay } from './lib/playback';
import { syncMedia } from './lib/media';
import { readSharedFromHash } from './lib/io';
import { POSES, type Pose } from './lib/types';
import TopBar from './components/TopBar';
import Stage2D from './components/Stage2D';
import Stage3D from './components/Stage3D';
import Timeline from './components/Timeline';
import Transport from './components/Transport';
import FormationPanel from './components/FormationPanel';
import DancersPanel from './components/DancersPanel';
import MusicPanel from './components/MusicPanel';
import VideoPanel from './components/VideoPanel';
import Sheets from './components/Sheets';
import { Icon } from './components/Icon';

const useIsShort = () => {
  const [m, setM] = useState(() => window.innerHeight < 520);
  useEffect(() => {
    const on = () => setM(window.innerHeight < 520);
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  return m;
};

const useIsPhone = () => {
  const q = '(max-width: 820px), (max-height: 520px)';
  const [m, setM] = useState(() => window.matchMedia(q).matches);
  useEffect(() => {
    const mq = window.matchMedia(q);
    const on = () => setM(mq.matches);
    mq.addEventListener('change', on);
    window.addEventListener('resize', on);
    return () => { mq.removeEventListener('change', on); window.removeEventListener('resize', on); };
  }, []);
  return m;
};

function Welcome({ onClose }: { onClose: () => void }) {
  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal welcome" onClick={(e) => e.stopPropagation()}>
        <div className="welcome-dots"><i /><i /><i /></div>
        <h2>Your set, on beat.</h2>
        <p className="muted">A demo showcase is loaded. Hit <b>play</b> to watch dancers run in from the wings, drop to their knees, ripple, roll and hit the final pose — in 2D and 3D.</p>
        <ul className="welcome-list">
          <li><b>Counts, not seconds.</b> Everything snaps to 8-counts; attach a song or a YouTube link and it auto-finds the beat.</li>
          <li><b>Levels & travel.</b> Stand, crouch, kneel, sit, floor, jump. Walk, run, slide, roll — with curved paths and ripples.</li>
          <li><b>Traffic check.</b> Warns you when two dancers cross too close.</li>
          <li><b>Spotlight & cheat sheets.</b> Every dancer can see just their own path and counts.</li>
        </ul>
        <div className="modal-actions">
          <button className="btn" onClick={() => { useStore.getState().newProject(); onClose(); }}>Start blank</button>
          <button className="btn primary" onClick={() => { onClose(); togglePlay(); }}><Icon name="play" size={14} /> Play the demo</button>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const view = useStore((s) => s.view);
  const panel = useStore((s) => s.panel);
  const toast = useStore((s) => s.toast);
  const musicKey = useStore((s) => `${s.project.music.kind}|${s.project.music.fileKey ?? ''}|${s.project.id}`);
  const isPhone = useIsPhone();
  const isShort = useIsShort();
  const [sheets, setSheets] = useState<{ open: boolean; dancer: string | null }>({ open: false, dancer: null });
  const [welcome, setWelcome] = useState(() => { try { return !localStorage.getItem('formation:welcomed'); } catch { return true; } });

  useEffect(() => startClock(), []);
  useEffect(() => { syncMedia(); }, [musicKey]);

  useEffect(() => {
    readSharedFromHash().then((p) => {
      if (p && confirm(`Open shared set “${p.name}”? This replaces the set on this device.`)) {
        useStore.getState().load(p);
        setWelcome(false);
      }
    });
  }, []);

  useEffect(() => {
    const forced = new URLSearchParams(location.search).get('view') as ViewMode | null;
    if (forced) useStore.getState().set({ view: forced });
    else if (isPhone) useStore.getState().set({ view: window.innerHeight > window.innerWidth ? 'split' : '2d', panel: 'none' });
  }, [isPhone]);

  // keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT') return;
      const s = useStore.getState();
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? s.redo() : s.undo(); return; }
      if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); s.redo(); return; }
      if (mod && e.key.toLowerCase() === 'a') { e.preventDefault(); s.set({ selected: s.project.dancers.map((d) => d.id) }); return; }
      if (mod) return;
      const f = s.activeFormation();
      if (e.key === ' ') { e.preventDefault(); togglePlay(); return; }
      if (e.key === 'Escape') { s.set({ selected: [], spotlight: null }); return; }
      if (e.key.startsWith('Arrow') && s.selected.length && f) {
        e.preventDefault();
        const step = e.shiftKey ? 1 : 0.25;
        const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
        const dy = e.key === 'ArrowUp' ? step : e.key === 'ArrowDown' ? -step : 0;
        const flip = s.dancerView ? -1 : 1;
        const patch: Record<string, { x: number; y: number }> = {};
        s.selected.forEach((id) => { const p = f.positions[id]; if (p) patch[id] = { x: +(p.x + dx * flip).toFixed(3), y: +(p.y + dy * flip).toFixed(3) }; });
        s.movePositions(f.id, patch);
        return;
      }
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        const fs = s.project.formations;
        const target = e.key === 'ArrowRight' ? fs.find((x) => x.start > s.count + 0.01) : [...fs].reverse().find((x) => x.start < s.count - 0.01);
        if (target) s.seekFormation(target.id);
        return;
      }
      const k = e.key.toUpperCase();
      const pose = POSES.find((p) => p.key === k);
      if (pose && s.selected.length && f) {
        const patch: Record<string, { pose: Pose }> = {};
        s.selected.forEach((id) => (patch[id] = { pose: pose.id }));
        s.movePositions(f.id, patch);
        return;
      }
      if (k === 'N') s.addFormation();
      else if (k === 'D' && f) s.duplicateFormation(f.id);
      else if (k === 'M') s.mirror();
      else if (k === '1') s.set({ view: '2d' });
      else if (k === '2') s.set({ view: 'split' });
      else if (k === '3') s.set({ view: '3d' });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const closeWelcome = () => { setWelcome(false); try { localStorage.setItem('formation:welcomed', '1'); } catch { /* ignore */ } };

  const tabs: { id: Panel; icon: string; label: string }[] = [
    { id: 'formation', icon: 'layers', label: 'Formation' },
    { id: 'dancers', icon: 'users', label: 'Team' },
    { id: 'music', icon: 'music', label: 'Music' },
  ];
  const setPanel = (p: Panel) => useStore.getState().set({ panel: isPhone && panel === p ? 'none' : p });
  const panelBody = panel === 'dancers' ? <DancersPanel onCheatSheet={(id) => setSheets({ open: true, dancer: id })} />
    : panel === 'music' ? <MusicPanel /> : panel === 'formation' ? <FormationPanel /> : null;

  return (
    <div className={'app' + (isPhone ? ' phone' : '') + (isShort ? ' short' : '')}>
      <TopBar onSheets={() => setSheets({ open: true, dancer: null })} />
      <main className={'main view-' + view}>
        <section className="stage-area">
          {view !== '3d' && <Stage2D />}
          {view !== '2d' && <Stage3D />}
          <VideoPanel />
        </section>
        {!isPhone && (
          <aside className="inspector">
            <div className="tabs">
              {tabs.map((t) => (
                <button key={t.id} className={panel === t.id ? 'on' : ''} onClick={() => setPanel(t.id)}><Icon name={t.icon} size={15} /> {t.label}</button>
              ))}
            </div>
            <div className="inspector-body">{panelBody ?? <FormationPanel />}</div>
          </aside>
        )}
      </main>
      {isPhone && panel !== 'none' && (
        <div className="sheet-panel">
          <div className="sheet-grab" onClick={() => setPanel('none')}><span /></div>
          <div className="sheet-panel-body">{panelBody}</div>
        </div>
      )}
      <Transport />
      <Timeline compact={isShort} />
      {isPhone && (
        <nav className="phone-tabs">
          {tabs.map((t) => (
            <button key={t.id} className={panel === t.id ? 'on' : ''} onClick={() => setPanel(t.id)}><Icon name={t.icon} size={18} /><span>{t.label}</span></button>
          ))}
          <button onClick={() => setSheets({ open: true, dancer: null })}><Icon name="print" size={18} /><span>Sheets</span></button>
        </nav>
      )}
      {toast && <div className="toast">{toast}</div>}
      {sheets.open && <Sheets dancerId={sheets.dancer} onClose={() => setSheets({ open: false, dancer: null })} />}
      {welcome && <Welcome onClose={closeWelcome} />}
    </div>
  );
}
