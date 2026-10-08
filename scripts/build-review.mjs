// Copies generation/candidates into the built site so /review can show them.
import fs from 'node:fs';
import path from 'node:path';

const src = 'generation/candidates';
const out = 'dist/review';
const batches = [];
if (fs.existsSync(src)) {
  for (const name of fs.readdirSync(src)) {
    const dir = path.join(src, name);
    const manifest = path.join(dir, 'manifest.json');
    if (!fs.existsSync(manifest)) continue;
    fs.cpSync(dir, path.join(out, 'candidates', name), { recursive: true });
    const m = JSON.parse(fs.readFileSync(manifest, 'utf8'));
    batches.push({ batch: m.batch, note: m.note ?? '', created: m.created, updated: m.updated, counts: m.counts ?? {} });
  }
}
batches.sort((a, b) => (b.updated ?? '').localeCompare(a.updated ?? ''));
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'index.json'), JSON.stringify(batches, null, 2));
console.log(`review: ${batches.length} batch(es)`);
