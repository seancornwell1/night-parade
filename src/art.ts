// Every generated image and sound the game ships, found at build time.
// Keys are paths under assets/day without the extension, e.g. "enemies/gaki", "audio/hit".

const images = import.meta.glob('../assets/day/**/*.png', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const sounds = import.meta.glob('../assets/day/audio/*.mp3', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;

import dayManifest from '../assets/day/day.json';

export interface SheetInfo {
  key: string;
  frameWidth: number;
  frameHeight: number;
  frames: number;
  anchor: [number, number];
}

/** Animation strips (assets/day/day.json "sheets"), loaded as spritesheets. */
export const SHEETS: Record<string, SheetInfo> = {};
for (const s of ((dayManifest as unknown as { sheets?: SheetInfo[] }).sheets ?? [])) SHEETS[s.key] = s;

const key = (path: string) => path.replace('../assets/day/', '').replace(/\.(png|mp3)$/, '');

export const IMAGES: Record<string, string> = {};
for (const [p, url] of Object.entries(images)) if (!p.endsWith('.mask.png')) IMAGES[key(p)] = url;

export const SOUNDS: Record<string, string> = {};
for (const [p, url] of Object.entries(sounds)) SOUNDS[key(p)] = url;

export function hasArt(k: string): boolean {
  return k in IMAGES;
}

export function hasSound(k: string): boolean {
  return k in SOUNDS;
}

/** Intro-then-loop points for music tracks ("loop": [start, end] seconds in day.json audio). */
export const MUSIC_LOOPS: Record<string, [number, number]> = {};
for (const a of ((dayManifest as unknown as { audio?: { file: string; loop?: [number, number] }[] }).audio ?? [])) {
  if (a.loop) MUSIC_LOOPS[a.file.replace(/\.mp3$/, '')] = a.loop;
}

/** One art pixel is two world units (docs/ART.md). */
export const ART_SCALE = 2;
