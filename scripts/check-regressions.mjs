// ============================================
// check-regressions.mjs — guardas de pre-push (B5 + B6 do design-audit)
// ============================================
// 1) RATCHET DE HEX (B5): cor cruda em CSS fora do tokens.css é como o roxo
//    "voltou" uma vez. Em vez de stylelint + varrer 141 legados agora, um
//    ratchet: a contagem NUNCA pode subir. Baixou? Atualize o baseline aqui.
//    (tokens.css é a fonte de cor; tablet.v52.css está congelado — fora.)
// 2) GUARD DO SW (B6): js/css são cache-first no service worker — mudança sem
//    bump de CACHE_VERSION = usuário preso em asset velho. Já foram 181→191
//    bumps manuais; uma hora esquece. O push só passa se o range tocar js/css
//    E também mexer no CACHE_VERSION (ou nada de js/css mudar).
//
// Roda no .husky/pre-push. Bypass consciente: git push --no-verify.

import { execSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import process from 'node:process';

const HEX_BASELINE = 141; // 2026-06-10 (design-audit leva 4)
const HEX_SKIP = new Set(['tokens.css', 'tablet.v52.css']);

let failed = false;
const fail = (msg) => {
  console.error('\n✖ ' + msg);
  failed = true;
};

// ── B5: ratchet de hex ──
let hexCount = 0;
const perFile = [];
for (const f of readdirSync('css')) {
  if (!f.endsWith('.css') || HEX_SKIP.has(f)) continue;
  const m = readFileSync('css/' + f, 'utf8').match(/#[0-9a-fA-F]{3,8}\b/g);
  const n = m ? m.length : 0;
  hexCount += n;
  if (n) perFile.push(f + ': ' + n);
}
if (hexCount > HEX_BASELINE) {
  fail(
    'Hex cru em CSS subiu: ' +
      hexCount +
      ' (baseline ' +
      HEX_BASELINE +
      ').\n  Use var(--token) do tokens.css em vez de cor cruda.\n  ' +
      perFile.join(' · ')
  );
} else if (hexCount < HEX_BASELINE) {
  console.log('✓ hex cru caiu pra ' + hexCount + ' (baseline ' + HEX_BASELINE + ') — atualize HEX_BASELINE no script.');
}

// ── B6: guard de bump do SW ──
let range = null;
try {
  execSync('git rev-parse --verify --quiet @{push}', { stdio: 'pipe' });
  range = '@{push}..HEAD';
} catch {
  try {
    execSync('git rev-parse --verify --quiet origin/main', { stdio: 'pipe' });
    range = 'origin/main..HEAD';
  } catch {
    range = null; // primeiro push do repo — sem base de comparação
  }
}
if (range) {
  const changed = execSync('git diff --name-only ' + range, { encoding: 'utf8' })
    .split('\n')
    .filter(Boolean);
  const assetChanged = changed.filter((f) => f.startsWith('js/') || f.startsWith('css/'));
  if (assetChanged.length > 0) {
    const swDiff = changed.includes('sw.js') ? execSync('git diff ' + range + ' -- sw.js', { encoding: 'utf8' }) : '';
    if (!/CACHE_VERSION/.test(swDiff)) {
      fail(
        'Assets cache-first mudaram sem bump de CACHE_VERSION no sw.js:\n  ' +
          assetChanged.slice(0, 8).join('\n  ') +
          (assetChanged.length > 8 ? '\n  … +' + (assetChanged.length - 8) : '')
      );
    }
  }
}

if (failed) {
  console.error('\nPush bloqueado pelos guardas (scripts/check-regressions.mjs).');
  process.exit(1);
}
console.log('✓ guardas ok (hex ' + hexCount + '/' + HEX_BASELINE + ', SW bump conferido)');
