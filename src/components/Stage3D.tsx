import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { useStore, type CamPreset } from '../lib/store';
import { frameAt, type DancerFrame } from '../lib/engine';
import type { Pose, Project } from '../lib/types';

// Joint angles in degrees, "forward" positive. hip = pelvis height (m). tilt = whole-body pitch (lying down).
interface Rig { hip: number; tilt: number; lean: number; thighL: number; shinL: number; thighR: number; shinR: number; armL: number; armR: number; spread: number }

const POSE_RIG: Record<Pose, Rig> = {
  stand: { hip: 0.92, tilt: 0, lean: 0, thighL: 0, shinL: 0, thighR: 0, shinR: 0, armL: 8, armR: 8, spread: 10 },
  crouch: { hip: 0.52, tilt: 0, lean: 32, thighL: 72, shinL: -112, thighR: 72, shinR: -112, armL: 35, armR: 35, spread: 18 },
  kneel: { hip: 0.5, tilt: 0, lean: 4, thighL: 90, shinL: -90, thighR: 0, shinR: -90, armL: 15, armR: 5, spread: 12 },
  sit: { hip: 0.12, tilt: 0, lean: -18, thighL: 88, shinL: -30, thighR: 88, shinR: -30, armL: -40, armR: -40, spread: 20 },
  floor: { hip: 0.14, tilt: -86, lean: 0, thighL: 0, shinL: 0, thighR: 4, shinR: -6, armL: 10, armR: 10, spread: 30 },
  jump: { hip: 1.3, tilt: 0, lean: 6, thighL: 40, shinL: -70, thighR: 40, shinR: -70, armL: 160, armR: 160, spread: 25 },
};

const lerpRig = (a: Rig, b: Rig, t: number): Rig => {
  const o = {} as Rig;
  (Object.keys(a) as (keyof Rig)[]).forEach((k) => (o[k] = a[k] + (b[k] - a[k]) * t));
  return o;
};

const DEG = Math.PI / 180;
const THIGH = 0.46, SHIN = 0.46, TORSO = 0.52, ARM = 0.62;

interface Figure {
  root: THREE.Group;
  pelvis: THREE.Group;
  torso: THREE.Group;
  thighL: THREE.Group; shinL: THREE.Group; thighR: THREE.Group; shinR: THREE.Group;
  armL: THREE.Group; armR: THREE.Group;
  shadow: THREE.Mesh;
  label: THREE.Sprite;
  ring: THREE.Mesh;
  color: string;
  name: string;
}

function limb(len: number, radius: number, mat: THREE.Material) {
  const g = new THREE.Group();
  const m = new THREE.Mesh(new THREE.CapsuleGeometry(radius, len - radius * 2, 4, 10), mat);
  m.position.y = -len / 2;
  m.castShadow = false;
  g.add(m);
  return g;
}

function makeLabel(text: string, color: string) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 64;
  const ctx = c.getContext('2d')!;
  ctx.font = '600 34px Inter, system-ui, sans-serif';
  const w = Math.min(250, ctx.measureText(text).width + 30);
  ctx.fillStyle = 'rgba(11,11,16,0.75)';
  ctx.beginPath();
  ctx.roundRect((256 - w) / 2, 8, w, 48, 24);
  ctx.fill();
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 128, 33);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  s.scale.set(1.1, 0.275, 1);
  s.renderOrder = 10;
  return s;
}

function makeFigure(color: string, name: string, shadowTex: THREE.Texture): Figure {
  const skin = new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.05 });
  const dark = new THREE.MeshStandardMaterial({ color: new THREE.Color(color).multiplyScalar(0.45), roughness: 0.8 });
  const root = new THREE.Group();
  const pelvis = new THREE.Group();
  root.add(pelvis);

  const torso = new THREE.Group();
  const chest = new THREE.Mesh(new THREE.CapsuleGeometry(0.16, TORSO - 0.2, 4, 12), skin);
  chest.position.y = TORSO / 2;
  chest.scale.set(1.15, 1, 0.75);
  torso.add(chest);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.12, 16, 12), skin);
  head.position.y = TORSO + 0.17;
  torso.add(head);
  // visor shows which way they face
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.05, 0.06), new THREE.MeshStandardMaterial({ color: '#111', roughness: 0.3 }));
  visor.position.set(0, TORSO + 0.19, 0.1);
  torso.add(visor);
  pelvis.add(torso);

  const thighL = limb(THIGH, 0.075, dark), thighR = limb(THIGH, 0.075, dark);
  const shinL = limb(SHIN, 0.065, dark), shinR = limb(SHIN, 0.065, dark);
  thighL.position.set(0.1, 0, 0); thighR.position.set(-0.1, 0, 0);
  shinL.position.y = -THIGH; shinR.position.y = -THIGH;
  thighL.add(shinL); thighR.add(shinR);
  pelvis.add(thighL, thighR);

  const armL = limb(ARM, 0.055, skin), armR = limb(ARM, 0.055, skin);
  armL.position.set(0.22, TORSO - 0.06, 0); armR.position.set(-0.22, TORSO - 0.06, 0);
  torso.add(armL, armR);

  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false, opacity: 0.7 }));
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.005;

  const ring = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.5, 40), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.9, depthWrite: false }));
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.01;
  ring.visible = false;

  const label = makeLabel(name, color);
  return { root, pelvis, torso, thighL, shinL, thighR, shinR, armL, armR, shadow, label, ring, color, name };
}

function poseFigure(fig: Figure, f: DancerFrame, count: number, playing: boolean, groove: boolean) {
  let rig = lerpRig(POSE_RIG[f.poseFrom], POSE_RIG[f.poseTo], f.poseT);
  let lift = 0, roll = 0;

  if (f.moving && f.move) {
    const stride = f.move === 'run' ? 1.5 : f.move === 'jump' ? 2.2 : 0.9;
    const ph = (f.gait / stride) * Math.PI * 2;
    const s = Math.sin(ph);
    if (f.move === 'walk' || f.move === 'run') {
      const amp = f.move === 'run' ? 42 : 24;
      rig = { ...rig, hip: Math.min(rig.hip, 0.92), tilt: 0, thighL: s * amp, thighR: -s * amp,
        shinL: -Math.max(0, -Math.cos(ph)) * amp * 1.6 - 6, shinR: -Math.max(0, Math.cos(ph)) * amp * 1.6 - 6,
        armL: -s * amp * 0.9, armR: s * amp * 0.9, lean: f.move === 'run' ? 14 : 3 };
      lift = f.move === 'run' ? Math.abs(Math.cos(ph)) * 0.07 : 0;
    } else if (f.move === 'jump') {
      lift = Math.abs(Math.sin(ph / 2)) * 0.55;
      rig = { ...rig, thighL: 50, shinL: -20, thighR: -30, shinR: -40, armL: 120, armR: 60, lean: 10 };
    } else if (f.move === 'slide') {
      rig = { ...rig, lean: 8, armL: 30, armR: 30, spread: 45 };
    } else if (f.move === 'roll') {
      rig = { ...POSE_RIG.floor };
      roll = ph;
    } else if (f.move === 'crawl') {
      rig = { ...rig, hip: 0.5, tilt: 0, lean: 75, thighL: 90 + s * 15, shinL: -90, thighR: 90 - s * 15, shinR: -90, armL: 75 - s * 15, armR: 75 + s * 15 };
    }
  } else if (playing && groove && f.pose !== 'floor' && f.pose !== 'sit') {
    // bounce on the beat
    const beat = count - Math.floor(count);
    const b = Math.pow(Math.sin(beat * Math.PI), 2);
    rig = { ...rig, hip: rig.hip - b * 0.05, thighL: rig.thighL + b * 8, thighR: rig.thighR + b * 8, shinL: rig.shinL - b * 14, shinR: rig.shinR - b * 14, lean: rig.lean + b * 5,
      armL: rig.armL + b * 10, armR: rig.armR + b * 10 };
  }

  fig.root.position.set(-f.x, 0, f.y);
  fig.root.rotation.y = f.facing * DEG + Math.PI;
  fig.pelvis.position.y = rig.hip + lift;
  fig.pelvis.rotation.set(rig.tilt * DEG, 0, roll);
  fig.torso.rotation.x = rig.lean * DEG;
  fig.thighL.rotation.x = -rig.thighL * DEG; fig.shinL.rotation.x = -rig.shinL * DEG;
  fig.thighR.rotation.x = -rig.thighR * DEG; fig.shinR.rotation.x = -rig.shinR * DEG;
  fig.armL.rotation.set(-rig.armL * DEG, 0, rig.spread * DEG);
  fig.armR.rotation.set(-rig.armR * DEG, 0, -rig.spread * DEG);

  const h = rig.hip + lift;
  const ss = Math.max(0.4, 1.0 - lift * 0.8) * (rig.tilt < -40 ? 1.6 : 0.9);
  fig.shadow.position.set(-f.x, 0.006, f.y);
  fig.shadow.scale.set(ss, ss, ss);
  fig.label.position.set(-f.x, Math.max(0.6, h + TORSO + 0.55), f.y);
}

function buildStage(scene: THREE.Scene, p: Project) {
  const { width: W, depth: D, wing } = p.stage;
  const g = new THREE.Group();
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(W, D),
    new THREE.MeshStandardMaterial({ color: '#2a2530', roughness: 0.6, metalness: 0.1 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, 0, D / 2);
  floor.receiveShadow = true;
  g.add(floor);

  const wingMat = new THREE.MeshStandardMaterial({ color: '#121016', roughness: 1 });
  [-1, 1].forEach((side) => {
    const w = new THREE.Mesh(new THREE.PlaneGeometry(wing, D), wingMat);
    w.rotation.x = -Math.PI / 2;
    w.position.set(side * (W / 2 + wing / 2), -0.002, D / 2);
    g.add(w);
    // wing curtains (legs)
    for (let k = 0; k < 3; k++) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.12, 5, 1.2), new THREE.MeshStandardMaterial({ color: '#0d0c12', roughness: 1 }));
      leg.position.set(side * (W / 2 + 0.4), 2.5, 1.2 + k * (D / 3));
      g.add(leg);
    }
  });

  // grid — built from thin flat strips (GL line primitives stall some iOS GPU drivers)
  const strips: number[] = [];
  const strip = (x0: number, z0: number, x1: number, z1: number, w: number) => {
    const dx = x1 - x0, dz = z1 - z0, len = Math.hypot(dx, dz) || 1;
    const nx = (-dz / len) * w / 2, nz = (dx / len) * w / 2;
    const y = 0.003;
    strips.push(x0 - nx, y, z0 - nz, x1 - nx, y, z1 - nz, x1 + nx, y, z1 + nz, x0 - nx, y, z0 - nz, x1 + nx, y, z1 + nz, x0 + nx, y, z0 + nz);
  };
  for (let k = -8; k <= 8; k++) { const x = (k * W) / 16; strip(x, 0, x, D, k % 2 === 0 ? 0.025 : 0.015); }
  for (let z = W / 16; z < D; z += W / 16) strip(-W / 2, z, W / 2, z, 0.015);
  const grid = new THREE.Mesh(
    new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(strips, 3)),
    new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.08, depthWrite: false, side: THREE.DoubleSide }),
  );
  g.add(grid);
  const center = new THREE.Mesh(new THREE.PlaneGeometry(0.03, D), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.25 }));
  center.rotation.x = -Math.PI / 2; center.position.set(0, 0.004, D / 2);
  g.add(center);

  // front edge lip + numbers
  const lip = new THREE.Mesh(new THREE.BoxGeometry(W, 0.9, 0.1), new THREE.MeshStandardMaterial({ color: '#16131b', roughness: 0.9 }));
  lip.position.set(0, -0.45, -0.05);
  g.add(lip);
  for (let k = -4; k <= 4; k++) {
    const s = makeNumber(k === 0 ? 'C' : String(Math.abs(k) * 2));
    s.position.set((-k * W) / 8, 0.01, -0.28);
    g.add(s);
  }

  // cyclorama
  const cyc = new THREE.Mesh(new THREE.PlaneGeometry(W + wing * 2 + 4, 8), new THREE.MeshBasicMaterial({ color: '#1b1430' }));
  cyc.position.set(0, 3.5, D + 0.6);
  cyc.rotation.y = Math.PI;
  g.add(cyc);
  scene.add(g);
  return g;
}

function makeNumber(t: string) {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 64;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.font = '700 40px Inter, system-ui, sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(t, 32, 34);
  const tex = new THREE.CanvasTexture(c);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.4), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
  m.rotation.x = -Math.PI / 2;
  m.rotation.z = Math.PI;
  return m;
}

function shadowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
  g.addColorStop(0, 'rgba(0,0,0,0.75)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

const CAMS: Record<Exclude<CamPreset, 'orbit'>, (D: number) => { pos: THREE.Vector3; target: THREE.Vector3 }> = {
  audience: (D) => ({ pos: new THREE.Vector3(0, 1.7, -9.5), target: new THREE.Vector3(0, 0.9, D * 0.45) }),
  judge: (D) => ({ pos: new THREE.Vector3(0, 6.5, -10), target: new THREE.Vector3(0, 0, D * 0.42) }),
  top: (D) => ({ pos: new THREE.Vector3(0, 17, D / 2 - 0.01), target: new THREE.Vector3(0, 0, D / 2) }),
};

export default function Stage3D() {
  const hostRef = useRef<HTMLDivElement>(null);
  const cam = useStore((s) => s.cam);
  const camRef = useRef<{ setPreset: (p: CamPreset) => void } | null>(null);

  useEffect(() => {
    const host = hostRef.current!;
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#0b0b10');
    scene.fog = new THREE.Fog('#0b0b10', 18, 40);

    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.maxPolarAngle = Math.PI / 2 - 0.03;
    controls.minDistance = 3;
    controls.maxDistance = 30;

    scene.add(new THREE.HemisphereLight('#b9a8ff', '#1a1220', 0.9));
    const key = new THREE.SpotLight('#fff2e0', 160, 40, Math.PI / 5, 0.6, 1.4);
    key.position.set(0, 12, -6);
    scene.add(key, key.target);
    const rimL = new THREE.SpotLight('#ff3d7f', 90, 30, Math.PI / 6, 0.7, 1.5);
    rimL.position.set(-9, 8, 8);
    const rimR = new THREE.SpotLight('#3dd6ff', 90, 30, Math.PI / 6, 0.7, 1.5);
    rimR.position.set(9, 8, 8);
    scene.add(rimL, rimR, rimL.target, rimR.target);

    const shadowTex = shadowTexture();
    let stageGroup: THREE.Group | null = null;
    let stageKey = '';
    const figs = new Map<string, Figure>();
    const figLayer = new THREE.Group();
    scene.add(figLayer);

    let tween: { from: THREE.Vector3; to: THREE.Vector3; tFrom: THREE.Vector3; tTo: THREE.Vector3; t0: number } | null = null;
    const setPreset = (p: CamPreset) => {
      if (p === 'orbit') return;
      const D = useStore.getState().project.stage.depth;
      const { pos, target } = CAMS[p](D);
      tween = { from: camera.position.clone(), to: pos, tFrom: controls.target.clone(), tTo: target, t0: performance.now() };
    };
    camRef.current = { setPreset };
    {
      const { pos, target } = CAMS.audience(useStore.getState().project.stage.depth);
      camera.position.copy(pos); controls.target.copy(target);
    }

    const resize = () => {
      const w = host.clientWidth, h = host.clientHeight;
      renderer.setSize(w, h);
      camera.aspect = w / Math.max(1, h);
      camera.fov = camera.aspect < 1 ? 62 : 45;
      camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(host);
    resize();

    let raf = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const s = useStore.getState();
      const p = s.project;
      const sk = `${p.stage.width}x${p.stage.depth}x${p.stage.wing}`;
      if (sk !== stageKey) { if (stageGroup) scene.remove(stageGroup); stageGroup = buildStage(scene, p); stageKey = sk; }

      // sync figures with dancers
      const ids = new Set(p.dancers.map((d) => d.id));
      for (const [id, f] of figs) if (!ids.has(id)) { figLayer.remove(f.root, f.shadow, f.label, f.ring); figs.delete(id); }
      p.dancers.forEach((d) => {
        let f = figs.get(d.id);
        if (f && (f.color !== d.color || f.name !== d.name)) { figLayer.remove(f.root, f.shadow, f.label, f.ring); f = undefined; }
        if (!f) { f = makeFigure(d.color, d.name, shadowTex); figs.set(d.id, f); figLayer.add(f.root, f.shadow, f.label, f.ring); }
      });

      const frames = frameAt(p, s.count);
      frames.forEach((fr) => {
        const f = figs.get(fr.id)!;
        poseFigure(f, fr, s.count, s.playing, true);
        const dim = s.spotlight && s.spotlight !== fr.id;
        f.root.visible = true;
        f.label.visible = s.showNames && !dim;
        f.ring.visible = s.selected.includes(fr.id) || s.spotlight === fr.id;
        f.ring.position.set(-fr.x, 0.012, fr.y);
        f.root.traverse((o) => {
          const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
          if (m && 'opacity' in m) { m.transparent = !!dim || fr.offstage; m.opacity = dim ? 0.15 : fr.offstage ? 0.45 : 1; }
        });
      });

      if (tween) {
        const t = Math.min(1, (performance.now() - tween.t0) / 700);
        const e = 1 - Math.pow(1 - t, 3);
        camera.position.lerpVectors(tween.from, tween.to, e);
        controls.target.lerpVectors(tween.tFrom, tween.tTo, e);
        if (t >= 1) tween = null;
      }
      controls.update();
      renderer.render(scene, camera);
    };
    loop();

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      controls.dispose();
      renderer.dispose();
      host.removeChild(renderer.domElement);
    };
  }, []);

  useEffect(() => { camRef.current?.setPreset(cam); }, [cam]);

  return (
    <div className="stage3d">
      <div ref={hostRef} className="three-host" />
      <div className="cam-presets">
        {(['audience', 'judge', 'top'] as CamPreset[]).map((c) => (
          <button key={c} className={'chip' + (cam === c ? ' on' : '')} onClick={() => { useStore.getState().set({ cam: c }); camRef.current?.setPreset(c); }}>
            {c === 'audience' ? 'Front row' : c === 'judge' ? 'Judges' : 'Overhead'}
          </button>
        ))}
      </div>
    </div>
  );
}
