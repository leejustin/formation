import { useStore } from '../lib/store';
import { countToSec, formatCount, formatTime, formationEnd, locate } from '../lib/engine';
import { togglePlay } from '../lib/playback';
import { Icon } from './Icon';

export default function Transport() {
  const count = useStore((s) => s.count);
  const playing = useStore((s) => s.playing);
  const rate = useStore((s) => s.rate);
  const loop = useStore((s) => s.loop);
  const zoom = useStore((s) => s.zoom);
  const music = useStore((s) => s.project.music);
  const formations = useStore((s) => s.project.formations);
  const S = useStore.getState;

  const where = locate(formations, count);
  const label = where.kind === 'hold' ? formations[where.index].name : where.kind === 'transition' ? `→ ${formations[where.to].name}` : '';
  const beat = Math.floor(((count % 8) + 8) % 8);

  const jump = (dir: -1 | 1) => {
    const fs = formations;
    if (!fs.length) return;
    const idx = dir > 0 ? fs.findIndex((f) => f.start > count + 0.01) : [...fs].reverse().findIndex((f) => f.start < count - 0.01);
    const target = dir > 0 ? fs[idx] : fs[fs.length - 1 - idx];
    if (target && idx >= 0) S().seekFormation(target.id);
    else if (dir < 0) S().set({ count: 0 });
  };

  const toggleLoop = () => {
    if (loop) return S().set({ loop: null });
    const w = locate(formations, count);
    if (w.kind === 'empty') return;
    const i = w.kind === 'hold' ? w.index : w.to;
    const from = i > 0 ? formationEnd(formations[i - 1]) : formations[i].start;
    S().set({ loop: [from, formationEnd(formations[i])] });
    S().toastMsg('Looping the transition + formation');
  };

  return (
    <div className="transport">
      <div className="tp-group">
        <button className="icon-btn" onClick={() => jump(-1)} aria-label="Previous formation"><Icon name="prev" /></button>
        <button className={'play-btn' + (playing ? ' on' : '')} onClick={togglePlay} aria-label={playing ? 'Pause' : 'Play'}>
          <Icon name={playing ? 'pause' : 'play'} size={22} />
        </button>
        <button className="icon-btn" onClick={() => jump(1)} aria-label="Next formation"><Icon name="next" /></button>
      </div>

      <div className="count-display">
        <div className="count-big">{(() => { const t = formatCount(count); return t.endsWith('&') ? <>{t.slice(0, -1)}<span className="amp">&amp;</span></> : t; })()}</div>
        <div className="count-dots">
          {Array.from({ length: 8 }, (_, i) => <i key={i} className={i === beat && count >= 0 ? 'on' : i < beat && count >= 0 ? 'past' : ''} />)}
        </div>
        <div className="count-sub">{formatTime(countToSec(count, music))} · <span className="count-where">{label}</span></div>
      </div>

      <div className="tp-group right">
        <select className="rate" value={rate} onChange={(e) => S().set({ rate: +e.target.value })} aria-label="Playback speed">
          {[0.5, 0.75, 1, 1.25].map((r) => <option key={r} value={r}>{r}×</option>)}
        </select>
        <button className={'icon-btn' + (loop ? ' on' : '')} onClick={toggleLoop} aria-label="Loop section" title="Loop this section"><Icon name="loop" /></button>
        <div className="zoom-btns hide-sm">
          <button className="icon-btn" onClick={() => S().set({ zoom: Math.max(3, zoom / 1.3) })} aria-label="Zoom out"><Icon name="minus" /></button>
          <button className="icon-btn" onClick={() => S().set({ zoom: Math.min(60, zoom * 1.3) })} aria-label="Zoom in"><Icon name="plus" /></button>
        </div>
        <button className="btn primary" onClick={() => S().addFormation()}>
          <Icon name="plus" /> <span className="hide-sm">Formation</span>
        </button>
      </div>
    </div>
  );
}
