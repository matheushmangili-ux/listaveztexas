// scripts/gen-icons.mjs
// Gera PWA icons + og-image a partir do chevron primário.
// Uso: node scripts/gen-icons.mjs

import { Resvg } from '@resvg/resvg-js';
import { writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

// ─── Chevron SVG com fundo sólido (para app icons + splash) ───
function chevronWithBg(bgColor, strokeColor, padding = 18) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120">
  <rect width="120" height="120" fill="${bgColor}" rx="20"/>
  <g fill="none" stroke="${strokeColor}" stroke-linejoin="miter" stroke-width="12" transform="translate(${padding - 18} 0)">
    <path d="M 18 42 L 38 60 L 18 78" opacity=".35"/>
    <path d="M 42 42 L 62 60 L 42 78" opacity=".7"/>
    <path d="M 66 42 L 86 60 L 66 78"/>
  </g>
</svg>`;
}

// ─── OG Image 1200x630 (share social) ───
function ogImage() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#1a1538"/>
      <stop offset="1" stop-color="#0a0614"/>
    </linearGradient>
    <radialGradient id="halo" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="#a78bfa" stop-opacity="0.22"/>
      <stop offset="1" stop-color="#a78bfa" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#bg)"/>
  <rect width="1200" height="630" fill="url(#halo)"/>
  <g transform="translate(420 165) scale(2.5)" fill="none" stroke="#c4b5fd" stroke-linejoin="miter" stroke-width="14">
    <path d="M 18 42 L 38 60 L 18 78" opacity=".35"/>
    <path d="M 42 42 L 62 60 L 42 78" opacity=".7"/>
    <path d="M 66 42 L 86 60 L 66 78"/>
  </g>
  <text x="600" y="540" text-anchor="middle" fill="#f5f0ff" font-family="Inter Tight, system-ui, sans-serif" font-size="72" font-weight="500" letter-spacing="-3">minha<tspan fill="#a78bfa">vez</tspan></text>
  <text x="600" y="580" text-anchor="middle" fill="#7a6e99" font-family="Inter Tight, system-ui, sans-serif" font-size="20" letter-spacing="2">CADA PESSOA NO SEU TEMPO</text>
</svg>`;
}

function render(svgString, width, outPath) {
  const resvg = new Resvg(svgString, {
    fitTo: { mode: 'width', value: width },
    font: { loadSystemFonts: true }
  });
  const data = resvg.render().asPng();
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, data);
  console.log(`  ✓ ${outPath.replace(ROOT, '.')} (${width}px, ${data.length} bytes)`);
}

console.log('Gerando PWA icons...');

// Filled icon (background solid purple-700, chevron purple-300)
const filled = chevronWithBg('#6d28d9', '#ffffff');
render(filled, 16, resolve(ROOT, 'assets/icons/favicon-16.png'));
render(filled, 32, resolve(ROOT, 'assets/icons/favicon-32.png'));
render(filled, 180, resolve(ROOT, 'assets/icons/apple-touch-icon-180.png'));
render(filled, 192, resolve(ROOT, 'assets/icons/icon-192.png'));
render(filled, 512, resolve(ROOT, 'assets/icons/icon-512.png'));

// Maskable (safe-zone 10% padding conform W3C spec)
const maskable = chevronWithBg('#6d28d9', '#ffffff', 28);
render(maskable, 192, resolve(ROOT, 'assets/icons/icon-192-maskable.png'));
render(maskable, 512, resolve(ROOT, 'assets/icons/icon-512-maskable.png'));

console.log('\nGerando OG image...');
render(ogImage(), 1200, resolve(ROOT, 'assets/og-image.png'));

console.log('\n✓ Done.');
