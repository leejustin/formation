import { useRef, useState } from 'react';
import { useStore } from '../lib/store';
import { parseYouTubeId } from '../lib/audio';
import { attachAudioFile, attachYouTube, redetectBeat, removeMusic, setDownbeatHere } from '../lib/media';
import { toUnits } from '../lib/engine';
import { Icon } from './Icon';

function RightsGate({ kind, onOk, onCancel }: { kind: 'file' | 'youtube'; onOk: (v?: string) => void; onCancel: () => void }) {
  const [ok, setOk] = useState(false);
  const [url, setUrl] = useState('');
  const id = parseYouTubeId(url);
  return (
    <div className="modal-back" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>{kind === 'file' ? 'Upload a song' : 'Use a YouTube video'}</h3>
        {kind === 'youtube' && (
          <input className="input" autoFocus placeholder="Paste a YouTube link" value={url} onChange={(e) => setUrl(e.target.value)} />
        )}
        <label className="rights">
          <input type="checkbox" checked={ok} onChange={(e) => setOk(e.target.checked)} />
          <span>I confirm I own this music or have the rights/permission to use it for my team's rehearsals and performances.</span>
        </label>
        <p className="muted small">
          {kind === 'file'
            ? 'Your song stays on this device — it is never uploaded anywhere.'
            : 'The video plays through YouTube’s official player. Nothing is downloaded.'}
        </p>
        <div className="modal-actions">
          <button className="btn" onClick={onCancel}>Cancel</button>
          <button className="btn primary" disabled={!ok || (kind === 'youtube' && !id)} onClick={() => onOk(id ?? undefined)}>
            {kind === 'file' ? 'Choose file' : 'Attach video'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function MusicPanel() {
  const music = useStore((s) => s.project.music);
  const stage = useStore((s) => s.project.stage);
  const metronome = useStore((s) => s.metronome);
  const analysis = useStore((s) => s.analysis);
  const S = useStore.getState;
  const fileRef = useRef<HTMLInputElement>(null);
  const [gate, setGate] = useState<'file' | 'youtube' | null>(null);
  const taps = useRef<number[]>([]);
  const [tapBpm, setTapBpm] = useState<number | null>(null);

  const tap = () => {
    const now = performance.now();
    const t = taps.current;
    if (t.length && now - t[t.length - 1] > 2000) t.length = 0;
    t.push(now);
    if (t.length > 8) t.shift();
    if (t.length >= 4) {
      const iv = (t[t.length - 1] - t[0]) / (t.length - 1);
      const bpm = Math.round((60000 / iv) * 10) / 10;
      setTapBpm(bpm);
      S().setMusic({ bpm });
    }
  };

  const conv = stage.units === 'ft' ? 3.28084 : 1;

  return (
    <div className="panel">
      <div className="section-title big"><Icon name="music" size={16} /> Music</div>
      {music.kind === 'none' ? (
        <div className="music-pick">
          <button className="music-card" onClick={() => setGate('file')}>
            <Icon name="upload" size={22} />
            <b>Upload a song</b>
            <span>MP3, WAV, M4A · waveform + auto beat detection</span>
          </button>
          <button className="music-card" onClick={() => setGate('youtube')}>
            <Icon name="youtube" size={22} />
            <b>YouTube link</b>
            <span>Play your mix or a reference video in sync</span>
          </button>
        </div>
      ) : (
        <div className="music-current">
          <Icon name={music.kind === 'youtube' ? 'youtube' : 'music'} size={20} />
          <div className="grow">
            <div className="music-title">{music.title || 'Untitled'}</div>
            <div className="muted small">{music.kind === 'youtube' ? 'YouTube' : 'Audio file'} · rights confirmed</div>
          </div>
          <button className="icon-btn danger" onClick={removeMusic} title="Remove music"><Icon name="close" size={16} /></button>
        </div>
      )}
      <input ref={fileRef} type="file" accept="audio/*,.mp3,.m4a,.wav,.aac,.ogg" hidden onChange={(e) => {
        const f = e.target.files?.[0];
        if (f) attachAudioFile(f).catch(() => S().toastMsg('Could not read that audio file'));
        e.target.value = '';
      }} />

      <div className="section">
        <div className="section-title"><Icon name="metronome" size={14} /> Counts</div>
        <div className="field-row">
          <label className="field">
            <span>BPM</span>
            <input className="input" type="number" step={0.1} min={40} max={240} value={music.bpm} onChange={(e) => +e.target.value > 20 && S().setMusic({ bpm: +e.target.value })} />
          </label>
          <button className="btn tap" onClick={tap}><Icon name="tap" size={16} /> Tap {tapBpm ? `· ${tapBpm}` : ''}</button>
          <button className="btn sm" onClick={() => S().setMusic({ bpm: +(music.bpm / 2).toFixed(1) })}>½×</button>
          <button className="btn sm" onClick={() => S().setMusic({ bpm: +(music.bpm * 2).toFixed(1) })}>2×</button>
        </div>
        {music.kind !== 'none' && <>
          <div className="row-label">Count 1 starts at <b>{music.offset.toFixed(2)}s</b></div>
          <div className="chips">
            <button className="chip" onClick={() => S().setMusic({ offset: Math.max(0, +(music.offset - 0.05).toFixed(3)) })}>−0.05s</button>
            <button className="chip" onClick={() => S().setMusic({ offset: Math.max(0, +(music.offset - 0.01).toFixed(3)) })}>−0.01</button>
            <button className="chip" onClick={() => S().setMusic({ offset: +(music.offset + 0.01).toFixed(3) })}>+0.01</button>
            <button className="chip" onClick={() => S().setMusic({ offset: +(music.offset + 0.05).toFixed(3) })}>+0.05s</button>
          </div>
          <div className="chips">
            <button className="chip strong" onClick={setDownbeatHere}>Make playhead “1·1”</button>
            {analysis && <button className="chip" onClick={redetectBeat}>Re-detect beat</button>}
          </div>
          <p className="muted small">Play, pause right on the first “5,6,7,8 → <b>1</b>”, then hit <i>Make playhead 1·1</i>. Formations stay on their counts if you change the tempo.</p>
        </>}
        <label className="toggle">
          <input type="checkbox" checked={metronome} onChange={(e) => S().set({ metronome: e.target.checked })} />
          <span>Count click (metronome)</span>
        </label>
      </div>

      <div className="section">
        <div className="section-title"><Icon name="stage" size={14} /> Stage</div>
        <div className="field-row">
          <label className="field"><span>Width ({stage.units})</span>
            <input className="input" type="number" min={3} step={1} value={Math.round(stage.width * conv)} onChange={(e) => +e.target.value >= 3 && S().setStage({ width: +e.target.value / conv })} />
          </label>
          <label className="field"><span>Depth ({stage.units})</span>
            <input className="input" type="number" min={3} step={1} value={Math.round(stage.depth * conv)} onChange={(e) => +e.target.value >= 3 && S().setStage({ depth: +e.target.value / conv })} />
          </label>
        </div>
        <div className="chips">
          <button className={'chip' + (stage.units === 'ft' ? ' on' : '')} onClick={() => S().setStage({ units: 'ft' })}>Feet</button>
          <button className={'chip' + (stage.units === 'm' ? ' on' : '')} onClick={() => S().setStage({ units: 'm' })}>Meters</button>
          <button className="chip" onClick={() => S().setStage({ width: 12.19, depth: 9.14 })}>Competition 40×30ft</button>
          <button className="chip" onClick={() => S().setStage({ width: 9.14, depth: 6.1 })}>Studio 30×20ft</button>
        </div>
        <p className="muted small">Currently {toUnits(stage.width, stage).toFixed(0)} × {toUnits(stage.depth, stage).toFixed(0)} {stage.units}. Front-edge numbers run C · 2 · 4 · 6 · 8 out to each side.</p>
      </div>

      {gate && (
        <RightsGate kind={gate} onCancel={() => setGate(null)} onOk={(id) => {
          setGate(null);
          if (gate === 'file') fileRef.current?.click();
          else if (id) attachYouTube(id);
        }} />
      )}
    </div>
  );
}
