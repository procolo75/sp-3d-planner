// Copia i decoder e le risorse di pdf.js in public/pdfjs (servono per PDF con immagini JBIG2/JPEG2000, font non incorporati, ecc.)
import { cpSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'node_modules', 'pdfjs-dist');
const dst = join(root, 'public', 'pdfjs');
mkdirSync(dst, { recursive: true });
for (const d of ['wasm', 'cmaps', 'standard_fonts', 'iccs']) cpSync(join(src, d), join(dst, d), { recursive: true });
console.log('pdf.js copiato in public/pdfjs');
