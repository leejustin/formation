import { useStore } from './store';
import type { Project } from './types';

const b64url = (bytes: Uint8Array) => {
  let s = '';
  bytes.forEach((b) => (s += String.fromCharCode(b)));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const fromB64url = (s: string) => {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
};

async function deflate(text: string): Promise<Uint8Array> {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
async function inflate(bytes: Uint8Array): Promise<string> {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Response(stream).text();
}

/** Projects shared by link carry everything except an uploaded audio file. */
function shareable(p: Project): Project {
  const music = p.music.kind === 'file' ? { ...p.music, kind: 'none' as const, fileKey: undefined, title: undefined } : p.music;
  return { ...p, music };
}

const SHARE_BASE = (import.meta.env.VITE_SHARE_BASE as string | undefined) || (location.protocol.startsWith('http') ? location.origin + location.pathname : '');

export async function shareLink(): Promise<void> {
  const st = useStore.getState();
  const data = b64url(await deflate(JSON.stringify(shareable(st.project))));
  if (!SHARE_BASE) return st.toastMsg('Set VITE_SHARE_BASE to your hosted URL to share links from the app');
  const url = `${SHARE_BASE}#set=${data}`;
  const note = st.project.music.kind === 'file' ? ' (song files stay on your device — teammates attach their own copy)' : '';
  if (navigator.share) {
    try { await navigator.share({ title: st.project.name, text: `Formations for ${st.project.name}`, url }); return; } catch { /* cancelled */ }
  }
  try {
    await navigator.clipboard.writeText(url);
    st.toastMsg('Link copied' + note);
  } catch {
    prompt('Copy this link', url);
  }
}

export async function readSharedFromHash(): Promise<Project | null> {
  const m = location.hash.match(/#set=([\w-]+)/);
  if (!m) return null;
  try {
    const p = JSON.parse(await inflate(fromB64url(m[1]))) as Project;
    history.replaceState(null, '', location.pathname);
    return p.version === 1 && Array.isArray(p.formations) ? p : null;
  } catch {
    return null;
  }
}

export async function exportFile() {
  const p = useStore.getState().project;
  const name = `${p.name.replace(/[^\w-]+/g, '_') || 'set'}.formation.json`;
  const file = new File([JSON.stringify(p, null, 1)], name, { type: 'application/json' });
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: p.name }); return; } catch { /* cancelled */ }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

export async function importFile(file: File) {
  const st = useStore.getState();
  try {
    const p = JSON.parse(await file.text()) as Project;
    if (p.version !== 1 || !Array.isArray(p.dancers)) throw new Error('bad');
    st.load(p);
    st.toastMsg(`Opened “${p.name}”`);
  } catch {
    st.toastMsg('That file is not a Formation set');
  }
}
