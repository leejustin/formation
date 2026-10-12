import { useEffect, useRef, useState } from 'react';
import { useStore } from '../lib/store';
import { player } from '../lib/player';
import { Icon } from './Icon';

const YT_ERRORS: Record<number, string> = {
  2: 'That YouTube link looks invalid.',
  5: 'This video can’t play in an embedded player.',
  100: 'Video not found (removed or private).',
  101: 'The owner doesn’t allow this video to be embedded.',
  150: 'The owner doesn’t allow this video to be embedded.',
  153: 'YouTube blocked the embed on this device.',
};

export default function VideoPanel() {
  const kind = useStore((s) => s.project.music.kind);
  const vid = useStore((s) => s.project.music.youtubeId);
  const hostRef = useRef<HTMLDivElement>(null);
  const [mini, setMini] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (kind !== 'youtube' || !vid || !hostRef.current) return;
    setErr(null);
    player.onYouTubeState = (st) => {
      if (st.error !== undefined) { setErr(YT_ERRORS[st.error] ?? `YouTube error ${st.error}`); return; }
      if (st.ready) {
        useStore.getState().mutate((p) => {
          p.music.duration = st.duration;
          if (st.title && (!p.music.title || p.music.title === 'YouTube video')) p.music.title = st.title;
        }, { history: false });
      }
    };
    player.useYouTube(vid, hostRef.current).catch(() => setErr('Couldn’t reach YouTube — check your connection.'));
  }, [kind, vid]);

  if (kind !== 'youtube') return null;
  return (
    <div className={'video-panel' + (mini ? ' mini' : '')}>
      <div className="vp-bar">
        <Icon name="youtube" size={14} />
        <span>Reference</span>
        <button className="icon-btn sm" onClick={() => setMini(!mini)} aria-label={mini ? 'Expand video' : 'Shrink video'}>
          <Icon name={mini ? 'plus' : 'minus'} size={14} />
        </button>
      </div>
      <div className="yt-wrap">
        <div ref={hostRef} className="yt-host" />
        {err && <div className="yt-err">{err}</div>}
      </div>
    </div>
  );
}
