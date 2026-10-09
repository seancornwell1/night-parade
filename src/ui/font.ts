// Pixel font: DotGothic16 (SIL Open Font License 1.1), bundled from @fontsource so it works offline.
// Not generated: an approved exception for testing and minor assets (CLAUDE.md); swap it here if asked.
import '@fontsource/dotgothic16/latin-400.css';

export const PIXEL_FONT = '"DotGothic16", system-ui, sans-serif';

/** Wait for the font so the first text Phaser draws isn't in the fallback font. */
export async function fontReady(): Promise<void> {
  try {
    await document.fonts.load('16px "DotGothic16"');
  } catch {
    // Fall back to the system font.
  }
}
