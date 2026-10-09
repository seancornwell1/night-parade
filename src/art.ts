// Every generated image and sound the game ships, found at build time.
// Keys are paths under assets/day without the extension, e.g. "enemies/gaki", "audio/hit".

const images = import.meta.glob('../assets/day/**/*.png', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const sounds = import.meta.glob('../assets/day/audio/*.mp3', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;

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

/** One art pixel is two world units (docs/ART.md). */
export const ART_SCALE = 2;
