// Genera las variantes web a partir de los originales del kit de marca (_originales/).
// Reproducible: npm run images. No modifica los originales.
// Salida: assets/img/*.avif|webp|png|jpg + assets/img/manifest.json (medidas y pesos).
import sharp from 'sharp';
import { mkdir, writeFile, stat, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, '_originales');
const OUT = path.join(ROOT, 'assets', 'img');

const FOOD = ['empanadas', 'sandwich_milanesa_carne', 'sandwich_milanesa_pollo', 'papas_mediana_caja'];
const FOOD_WIDTHS = [480, 768, 1024];
const HERO_WIDTHS = [640, 1024, 1440, 1672];

const manifest = { generado: new Date().toISOString().slice(0, 10), imagenes: {} };

async function size(file) {
  return (await stat(file)).size;
}

async function variants(input, name, widths, { alpha = false, quality = { avif: 50, webp: 74 } } = {}) {
  const meta = await sharp(input).metadata();
  const entry = { original: path.relative(ROOT, input).replaceAll('\\', '/'), originalBytes: await size(input), ancho: meta.width, alto: meta.height, salidas: [] };
  for (const w of widths) {
    const h = Math.round((meta.height * w) / meta.width);
    const base = sharp(input).resize({ width: w, withoutEnlargement: true });
    const avif = path.join(OUT, `${name}-${w}.avif`);
    const webp = path.join(OUT, `${name}-${w}.webp`);
    await base.clone().avif({ quality: quality.avif, effort: 6 }).toFile(avif);
    await base.clone().webp({ quality: quality.webp, effort: 6, alphaQuality: alpha ? 90 : 100 }).toFile(webp);
    entry.salidas.push({ ancho: w, alto: h, avif: await size(avif), webp: await size(webp) });
  }
  manifest.imagenes[name] = entry;
}

await rm(OUT, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });

// Portada (hero): comida a la derecha, espacio oscuro a la izquierda.
await variants(path.join(SRC, 'menu_inicial', 'portada_menu_inicial.png'), 'portada', HERO_WIDTHS, { quality: { avif: 48, webp: 72 } });
// Fichas de producto.
for (const name of FOOD) await variants(path.join(SRC, 'menu_inicial', `${name}.png`), name, FOOD_WIDTHS);
// Lomito: imagen ilustrativa del kit (carpeta de próxima etapa); el producto ya está en la carta.
await variants(path.join(SRC, 'proxima_etapa', 'lomito_concepto_futuro.png'), 'lomito', FOOD_WIDTHS);

// Logo principal (sello completo, transparencia exterior). Se muestra a >= 240 px CSS.
const logo = path.join(SRC, 'marca', 'el_buen_sabor_logo_principal.png');
await variants(logo, 'logo-principal', [320, 560], { alpha: true, quality: { avif: 70, webp: 88 } });
await sharp(logo).resize(560).png({ compressionLevel: 9, palette: false }).toFile(path.join(OUT, 'logo-principal-560.png'));

// Perfil simplificado: avatar (>= 96 px CSS) e íconos de sistema.
const simple = path.join(SRC, 'marca', 'el_buen_sabor_perfil_simplificado.png');
await variants(simple, 'logo-simplificado', [192], { quality: { avif: 70, webp: 88 } });
await sharp(simple).resize(180).png({ compressionLevel: 9 }).toFile(path.join(OUT, 'apple-touch-icon.png'));
await sharp(simple).resize(192).png({ compressionLevel: 9 }).toFile(path.join(OUT, 'icono-192.png'));

// Imagen para compartir (Open Graph 1200x630), sin texto incrustado.
await sharp(path.join(SRC, 'menu_inicial', 'portada_menu_inicial.png'))
  .resize({ width: 1200, height: 630, fit: 'cover', position: 'right' })
  .jpeg({ quality: 78, mozjpeg: true })
  .toFile(path.join(OUT, 'compartir-1200x630.jpg'));

const extras = {};
for (const f of await readdir(OUT)) if (/\.(png|jpg)$/.test(f)) extras[f] = await size(path.join(OUT, f));
manifest.extras = extras;
await writeFile(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');

let before = 0, after = 0;
for (const e of Object.values(manifest.imagenes)) {
  before += e.originalBytes;
  for (const s of e.salidas) after += s.avif + s.webp;
}
console.log(`Originales: ${(before / 1e6).toFixed(2)} MB -> variantes AVIF+WebP: ${(after / 1e6).toFixed(2)} MB (todas las medidas).`);
for (const [k, e] of Object.entries(manifest.imagenes)) {
  console.log(k.padEnd(26), e.salidas.map((s) => `${s.ancho}w avif ${(s.avif / 1024).toFixed(0)}K webp ${(s.webp / 1024).toFixed(0)}K`).join(' | '));
}
console.log(extras);
