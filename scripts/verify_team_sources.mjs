import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

const root = path.resolve(import.meta.dirname, '..');
const sources = ['research', 'outputs', 'Sevaro Track.zip', 'Sevaro_Challenge_1_Standalone_Build_Plan.md'];
const entries = [];
function visit(relative) {
  const file = path.join(root, relative);
  if (fs.statSync(file).isDirectory()) {
    for (const child of fs.readdirSync(file).sort()) {
      if (['node_modules', '__pycache__', '.venv', '.pnpm-store'].includes(child)) continue;
      visit(path.join(relative, child));
    }
    return;
  }
  const bytes = fs.readFileSync(file);
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const original = path.resolve(root, '..', relative);
  if (fs.existsSync(original)) {
    const originalHash = createHash('sha256').update(fs.readFileSync(original)).digest('hex');
    if (sha256 !== originalHash) throw new Error(`Original source differs: ${relative}`);
  }
  entries.push({ path: relative.replaceAll('\\', '/'), bytes: bytes.length, sha256 });
}
for (const source of sources) visit(source);
const manifest = { description: 'Unmodified user-supplied challenge and research files included in team handoff', files: entries.length, bytes: entries.reduce((sum, item) => sum + item.bytes, 0), entries };
fs.writeFileSync(path.join(root, 'reports/team-source-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(`Verified ${manifest.files} original files (${manifest.bytes} bytes).`);
