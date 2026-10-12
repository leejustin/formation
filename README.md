# Formation

Stage-formation planner built for hip hop teams. Plan every set on 8-counts, sync it to your song or a YouTube video, and watch it play back in 2D and 3D.

One codebase ships to **web, iOS and Android** (React + TypeScript, wrapped with Capacitor).

## What it does

- **Counts, not seconds.** Timeline is laid out in 8-counts (`3·5`, `2·7&`). Formations are blocks you drag and stretch; the gaps between them are transitions.
- **Music sync.** Upload a song (stays on the device) or paste a YouTube link. You confirm you have the rights first. Uploaded songs get a waveform and automatic BPM/downbeat detection; tap tempo, ½×/2×, fine nudges, and "make playhead 1·1" cover the rest.
- **Levels & facing.** Stand, crouch, kneel, sit, floor, jump, plus facing direction and a move label ("Windmill", "Hit") per dancer per formation.
- **Travel.** Walk / run / slide / roll / crawl / leap, curved paths you shape by dragging, and per-dancer leave/arrive timing for ripples and canons (one-tap SR→SL, center-out, front→back).
- **Instant formations.** Windows, V, wedge, pyramid, lines, block, diamond, circle, arc, diagonal, columns, clump. Smart assign gives each dancer the spot with the least total travel.
- **Traffic check.** Flags dancers who cross too close or share a spot, on the timeline and on stage.
- **3D preview.** Articulated dancers that actually kneel, hit the floor, run with a gait, and groove on the beat. Front-row, judges and overhead cameras.
- **Spotlight & cheat sheets.** Fade everyone but one dancer and draw their whole path. Print a team sheet or a per-dancer sheet with spots in stage numbers ("SL 4 · Midstage") and counts.
- **Share.** Share a set as a link (songs aren't included) or save/open `.formation.json` files. Undo/redo and autosave included.

## Run it

```bash
npm install
```

```bash
npm run dev
```

Keyboard (desktop): `Space` play · `←/→` prev/next formation (or nudge selected) · `S C K T F J` set level · `N` new formation · `D` duplicate · `M` mirror · `1/2/3` 2D/both/3D · `⌘Z` undo.

## Native apps

```bash
npm run ios
```

```bash
npm run android
```

Each builds the web app, syncs it into the native project and opens Xcode / Android Studio. Bundle id: `com.dinksf.formation`.

## Share links

Links need a hosted copy of the web build. Set `VITE_SHARE_BASE` to that URL (e.g. `https://formation.example.com/`) before building so links shared from the native apps point there.

## Layout

- `src/lib/engine.ts` – timing, interpolation, paths, traffic detection (no UI, reusable)
- `src/lib/templates.ts` – formation generators + optimal spot assignment
- `src/lib/audio.ts` – waveform, tempo/downbeat detection, on-device song storage
- `src/lib/player.ts` – one clock for silence / audio file / YouTube
- `src/components/` – 2D stage, 3D stage, timeline, panels, print sheets

## Notes

- The 3D floor grid is drawn with thin meshes, not WebGL line primitives; lines stalled rendering on the iOS 27 simulator.
- YouTube embeds can be blocked by the video owner, and some videos refuse to play inside apps. The app shows the reason when that happens.
