// ============================================
// MinhaVez — Celebration Animations
// Venda flash + Epic Troca achievement overlay
// ============================================

import { playSound } from '/js/sound.js';
import {
  CELEBRATION_FLASH_SHOW,
  CELEBRATION_FLASH_FADE,
  CELEBRATION_EPIC_SHOW,
  CELEBRATION_EPIC_FADE,
  Z_DRAG_GHOST
} from '/js/constants.js';
import { escapeHtml } from '/js/utils.js';

let _epicOverlay = null;
let _epicRaf = null;

/**
 * Flash overlay + expanding rings for a sale.
 * Expects a <canvas id="confettiCanvas"> in the DOM.
 */
export function fireVendaCelebration() {
  const flash = document.createElement('div');
  flash.style.cssText = `position:fixed;inset:0;z-index:${Z_DRAG_GHOST};pointer-events:none;display:flex;align-items:center;justify-content:center;background:rgba(52,211,153,.08)`;
  flash.innerHTML = `
    <div style="display:flex;flex-direction:column;align-items:center;animation:popIn .4s cubic-bezier(.2,.8,.3,1) both">
      <i class="fa-solid fa-circle-check" style="font-size:56px;color:var(--success);margin-bottom:8px;filter:drop-shadow(0 0 20px rgba(52,211,153,.5))"></i>
      <span style="font-family:var(--font-mono);font-size:20px;font-weight:800;color:var(--success);letter-spacing:.06em;text-shadow:0 0 20px rgba(52,211,153,.3)">VENDA!</span>
    </div>`;
  document.body.appendChild(flash);

  const canvas = document.getElementById('confettiCanvas');
  if (canvas) {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    const ctx = canvas.getContext('2d');
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    let frame = 0;
    const rings = [
      { r: 0, maxR: Math.max(canvas.width, canvas.height) * 0.6, speed: 8, color: 'rgba(52,211,153,' },
      { r: 0, maxR: Math.max(canvas.width, canvas.height) * 0.5, speed: 6, color: 'rgba(74,222,128,' }
    ];

    function animate() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      let alive = false;
      rings.forEach((ring) => {
        ring.r += ring.speed;
        if (ring.r < ring.maxR) alive = true;
        const alpha = Math.max(0, 1 - ring.r / ring.maxR) * 0.4;
        ctx.beginPath();
        ctx.arc(cx, cy, ring.r, 0, Math.PI * 2);
        ctx.strokeStyle = ring.color + alpha + ')';
        ctx.lineWidth = 3;
        ctx.stroke();
      });
      frame++;
      if (alive && frame < 60) requestAnimationFrame(animate);
      else ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    requestAnimationFrame(animate);
  }

  setTimeout(() => {
    flash.style.transition = 'opacity .4s';
    flash.style.opacity = '0';
    setTimeout(() => flash.remove(), CELEBRATION_FLASH_FADE);
  }, CELEBRATION_FLASH_SHOW);
}

/**
 * Epic achievement overlay for high-value troca (>= R$1.000).
 * @param {string} nome - Vendor name
 * @param {number} valor - Trade-up value
 */
export function fireEpicTrocaAnimation(nome, valor) {
  if (_epicRaf) {
    cancelAnimationFrame(_epicRaf);
    _epicRaf = null;
  }
  if (_epicOverlay) {
    _epicOverlay.remove();
    _epicOverlay = null;
  }

  playSound('venda');

  const overlay = document.createElement('div');
  _epicOverlay = overlay;
  overlay.style.cssText = `position:fixed;inset:0;z-index:${Z_DRAG_GHOST};display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.75)`;

  const cvs = document.createElement('canvas');
  cvs.style.cssText = 'position:absolute;inset:0;width:100%;height:100%';
  overlay.appendChild(cvs);

  const card = document.createElement('div');
  card.style.cssText =
    'position:relative;z-index:1;text-align:center;padding:40px 48px;border-radius:8px;border:2px solid;animation:epicCardIn .6s cubic-bezier(.2,.8,.3,1) both;background:linear-gradient(135deg,#1a0a2e 0%,#0f172a 50%,#1a0a2e 100%);border-image:linear-gradient(135deg,#a78bfa,#e879f9,#f472b6,#a78bfa) 1';
  card.innerHTML = `
    <div style="font-size:10px;font-weight:800;letter-spacing:.2em;text-transform:uppercase;color:#a78bfa;margin-bottom:12px;animation:epicGlow 1.5s ease infinite alternate">CONQUISTA DESBLOQUEADA</div>
    <div style="font-size:48px;margin-bottom:8px;animation:epicBounce .8s cubic-bezier(.2,.8,.3,1) .3s both">💎</div>
    <div style="font-family:var(--font-mono);font-size:20px;font-weight:800;color:#e879f9;margin-bottom:4px;text-shadow:0 0 20px rgba(232,121,249,.4)">${escapeHtml(nome)}</div>
    <div style="font-size:13px;color:#c4b5fd;font-weight:600;margin-bottom:16px">Troca com diferença épica</div>
    <div style="font-family:var(--font-mono);font-size:32px;font-weight:800;color:#f0abfc;text-shadow:0 0 30px rgba(240,171,252,.4);animation:epicPulse 1s ease infinite alternate">R$ ${Number(valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
    <div style="margin-top:16px;font-size:10px;color:#7c3aed;font-weight:700;letter-spacing:.1em">1º DA FILA GARANTIDO</div>
    <button onclick="this.closest('div[style*=fixed]').remove()" style="margin-top:20px;padding:10px 32px;border:1px solid rgba(167,139,250,.3);border-radius:4px;background:rgba(167,139,250,.1);color:#c4b5fd;font-family:var(--font-mono);font-size:12px;font-weight:700;cursor:pointer;transition:all .2s" onmouseenter="this.style.background='rgba(167,139,250,.25)'" onmouseleave="this.style.background='rgba(167,139,250,.1)'">FECHAR</button>
  `;
  overlay.appendChild(card);
  document.body.appendChild(overlay);

  const dpr = window.devicePixelRatio || 1;
  cvs.width = window.innerWidth * dpr;
  cvs.height = window.innerHeight * dpr;
  const ctx = cvs.getContext('2d');
  ctx.scale(dpr, dpr);
  const sparkles = [];
  const sparkColors = ['#a78bfa', '#e879f9', '#f472b6', '#c4b5fd', '#fbbf24', '#f0abfc'];
  for (let i = 0; i < 30; i++) {
    sparkles.push({
      x: Math.random() * window.innerWidth,
      y: Math.random() * window.innerHeight,
      size: 1 + Math.random() * 3,
      color: sparkColors[Math.floor(Math.random() * sparkColors.length)],
      speed: 0.3 + Math.random() * 1.5,
      phase: Math.random() * Math.PI * 2,
      drift: (Math.random() - 0.5) * 0.5
    });
  }
  function animateSparkles() {
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    const t = performance.now() / 1000;
    sparkles.forEach((s) => {
      s.y -= s.speed;
      s.x += s.drift;
      if (s.y < -10) {
        s.y = window.innerHeight + 10;
        s.x = Math.random() * window.innerWidth;
      }
      const alpha = 0.3 + Math.sin(t * 3 + s.phase) * 0.4;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
      ctx.fillStyle = s.color;
      ctx.globalAlpha = Math.max(0, alpha);
      ctx.fill();
      ctx.globalAlpha = 1;
    });
    _epicRaf = requestAnimationFrame(animateSparkles);
  }
  animateSparkles();

  setTimeout(() => {
    if (_epicRaf) {
      cancelAnimationFrame(_epicRaf);
      _epicRaf = null;
    }
    overlay.style.transition = 'opacity .5s';
    overlay.style.opacity = '0';
    setTimeout(() => {
      overlay.remove();
      if (_epicOverlay === overlay) _epicOverlay = null;
    }, CELEBRATION_EPIC_FADE);
  }, CELEBRATION_EPIC_SHOW);
}
