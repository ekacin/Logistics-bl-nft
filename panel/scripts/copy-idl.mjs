// Her `npm run dev`/`npm run build` öncesi otomatik çalışır (predev/prebuild) — elle
// kopyalamayı unutup bayat IDL'le anlaşılmaz runtime hatası almayı önler (dış inceleme notu).
// target/ gitignore'da olduğu için panel kendi src/idl/ kopyasını commit'ler.
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const destDir = join(here, '..', 'src', 'idl');

const files = [
  [join(root, 'target', 'idl', 'logistics_bl_nft.json'), join(destDir, 'logistics_bl_nft.json')],
  [join(root, 'target', 'types', 'logistics_bl_nft.ts'), join(destDir, 'logistics_bl_nft.ts')],
];

mkdirSync(destDir, { recursive: true });

for (const [src, dest] of files) {
  if (existsSync(src)) {
    copyFileSync(src, dest);
    console.log(`[copy-idl] ${src} -> ${dest}`);
  } else {
    if (!existsSync(dest)) {
      console.warn(`[copy-idl] UYARI: ${src} yok ve ${dest} de yok — önce proje kökünde 'anchor build' çalıştır.`);
    } else {
      console.log(`[copy-idl] ${src} bulunamadı, mevcut kopya (${dest}) korunuyor.`);
    }
  }
}
