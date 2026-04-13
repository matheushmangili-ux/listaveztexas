// ============================================
// MinhaVez — Celebration Animations (GSAP-powered)
// Venda flash + Epic Troca overlay + value-to-header flight
// ============================================

import { playSound } from '/js/sound.js';
import { CELEBRATION_EPIC_FADE, Z_DRAG_GHOST } from '/js/constants.js';
import { escapeHtml } from '/js/utils.js';

const g = () => window.gsap;

let _epicOverlay = null;

/**
 * Venda flash: popup + golden particle burst + optional value counter.
 * @param {Object} opts
 * @param {number} [opts.valor] — se passado, conta de 0 até o valor
 * @param {HTMLElement} [opts.originEl] — origem do burst (default: centro da tela)
 */
export function fireVendaCelebration(opts = {}) {
  const { valor = null, originEl = null } = opts;
  const gsap = g();

  // Overlay container
  const flash = document.createElement('div');
  flash.style.cssText = `position:fixed;inset:0;z-index:${Z_DRAG_GHOST};pointer-events:none;display:flex;align-items:center;justify-content:center;background:rgba(170, 238, 196,.06)`;

  const valorHtml = valor != null
    ? `<span class="venda-celebrate-valor" style="font-family:var(--font-mono);font-size:28px;font-weight:800;color:var(--success);letter-spacing:-.02em;margin-top:4px;text-shadow:0 0 24px rgba(170, 238, 196,.45);font-variant-numeric:tabular-nums">R$ 0,00</span>`
    : '';

  flash.innerHTML = `
    <div class="venda-celebrate-box" style="display:flex;flex-direction:column;align-items:center;gap:2px">
      <i class="fa-solid fa-circle-check" style="font-size:64px;color:var(--success);filter:drop-shadow(0 0 24px rgba(170, 238, 196,.55))"></i>
      <span style="font-family:var(--font-mono);font-size:22px;font-weight:800;color:var(--success);letter-spacing:.08em;text-shadow:0 0 20px rgba(170, 238, 196,.35)">VENDA!</span>
      ${valorHtml}
    </div>`;
  document.body.appendChild(flash);

  if (!gsap) {
    // Fallback sem GSAP
    setTimeout(() => { flash.style.transition = 'opacity .4s'; flash.style.opacity = '0'; setTimeout(() => flash.remove(), 400); }, 1200);
    return;
  }

  const box = flash.querySelector('.venda-celebrate-box');
  const tl = gsap.timeline({ onComplete: () => flash.remove() });
  tl.from(box, { scale: 0.5, opacity: 0, duration: 0.45, ease: 'back.out(2)' })
    .to(box, { scale: 1.05, duration: 0.15, ease: 'power2.inOut', yoyo: true, repeat: 1 }, '>-0.05');

  // Counter até valor
  if (valor != null) {
    const valorEl = flash.querySelector('.venda-celebrate-valor');
    const state = { n: 0 };
    tl.to(state, {
      n: valor,
      duration: 1.1,
      ease: 'power2.out',
      onUpdate: () => {
        valorEl.textContent = 'R$ ' + state.n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      }
    }, 0.15);
  }

  // Partículas douradas do clique (ou centro)
  const rect = originEl?.getBoundingClientRect();
  const ox = rect ? rect.left + rect.width / 2 : window.innerWidth / 2;
  const oy = rect ? rect.top + rect.height / 2 : window.innerHeight / 2;
  spawnGoldBurst(ox, oy);

  tl.to(flash, { opacity: 0, duration: 0.4, ease: 'power2.in' }, 1.6);
}

function spawnGoldBurst(cx, cy) {
  const gsap = g();
  if (!gsap) return;
  const layer = document.createElement('div');
  layer.style.cssText = `position:fixed;left:0;top:0;width:100vw;height:100vh;pointer-events:none;z-index:${Z_DRAG_GHOST + 1}`;
  document.body.appendChild(layer);
  const colors = ['#d4a373', '#b8875a', '#e8d0a0', '#aaeec4', '#ffffff'];
  const particles = [];
  for (let i = 0; i < 18; i++) {
    const p = document.createElement('div');
    const sz = 6 + Math.random() * 6;
    p.style.cssText = `position:absolute;left:${cx}px;top:${cy}px;width:${sz}px;height:${sz}px;border-radius:50%;background:${colors[i % colors.length]};box-shadow:0 0 12px ${colors[i % colors.length]};will-change:transform,opacity`;
    layer.appendChild(p);
    particles.push(p);
  }
  gsap.to(particles, {
    x: () => (Math.random() - 0.5) * 520,
    y: () => (Math.random() - 0.8) * 420,
    scale: 0,
    opacity: 0,
    rotation: () => (Math.random() - 0.5) * 360,
    duration: 1.2,
    ease: 'power3.out',
    stagger: { each: 0.015, from: 'random' },
    onComplete: () => layer.remove()
  });
}

/**
 * Animação "valor voa até o KPI #statVendas" no header.
 * Shared-element motion — dinheiro subindo pro contador.
 */
export function animateValueToHeader(valor, originEl) {
  const gsap = g();
  if (!gsap || !valor) return;
  const target = document.getElementById('statVendas');
  if (!target) return;

  const rect = originEl?.getBoundingClientRect();
  const ox = rect ? rect.left + rect.width / 2 : window.innerWidth / 2;
  const oy = rect ? rect.top + rect.height / 2 : window.innerHeight / 2;
  const tRect = target.getBoundingClientRect();
  const tx = tRect.left + tRect.width / 2;
  const ty = tRect.top + tRect.height / 2;

  const badge = document.createElement('div');
  badge.textContent = '+R$ ' + Number(valor).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  badge.style.cssText = `position:fixed;left:${ox}px;top:${oy}px;transform:translate(-50%,-50%);z-index:${Z_DRAG_GHOST + 2};padding:8px 14px;border-radius:999px;background:linear-gradient(135deg,#aaeec4,#7fd9a0);color:#fff;font-family:var(--font-mono);font-weight:800;font-size:16px;box-shadow:0 8px 32px rgba(170, 238, 196,.45);pointer-events:none;white-space:nowrap;letter-spacing:-.01em`;
  document.body.appendChild(badge);

  const midX = (ox + tx) / 2;
  const arcY = Math.min(oy, ty) - 120;

  gsap.timeline({ onComplete: () => badge.remove() })
    .to(badge, { scale: 1.15, duration: 0.2, ease: 'back.out(2)' })
    .to(badge, {
      motionPath: undefined, // fallback: 2-step bezier via keyTimes
      keyframes: [
        { left: midX, top: arcY, duration: 0.55, ease: 'power2.out' },
        { left: tx, top: ty, scale: 0.6, opacity: 0.9, duration: 0.45, ease: 'power2.in' }
      ]
    })
    .to(target, { scale: 1.18, duration: 0.18, ease: 'back.out(2)' }, '-=0.2')
    .to(target, { scale: 1, duration: 0.25, ease: 'power2.out' });
}

/**
 * Epic achievement overlay for high-value troca (>= R$1.000).
 * Timeline GSAP: fade overlay → card flip → gem bounce → sparkles → valor pulse → exit.
 */
export function fireEpicTrocaAnimation(nome, valor) {
  const gsap = g();
  if (_epicOverlay) { _epicOverlay.remove(); _epicOverlay = null; }

  playSound('venda');

  const overlay = document.createElement('div');
  _epicOverlay = overlay;
  overlay.style.cssText = `position:fixed;inset:0;z-index:${Z_DRAG_GHOST};display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.78);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);opacity:0`;

  const card = document.createElement('div');
  card.className = 'epic-card';
  card.style.cssText = 'position:relative;z-index:1;text-align:center;padding:40px 52px;border-radius:20px;border:2px solid rgba(184, 168, 212,.5);background:linear-gradient(135deg,#1a0a2e 0%,#0f172a 50%,#1a0a2e 100%);box-shadow:0 30px 80px rgba(184, 168, 212,.35),inset 0 1px 0 rgba(255,255,255,.08);transform-style:preserve-3d';
  card.innerHTML = `
    <div class="epic-label" style="font-size:11px;font-weight:800;letter-spacing:.25em;text-transform:uppercase;color:#c4b5fd;margin-bottom:14px">CONQUISTA DESBLOQUEADA</div>
    <div class="epic-gem" style="font-size:56px;margin-bottom:10px;filter:drop-shadow(0 0 24px rgba(232,121,249,.6))">💎</div>
    <div class="epic-name" style="font-family:var(--font-mono);font-size:22px;font-weight:800;color:#d4a8c4;margin-bottom:4px;text-shadow:0 0 20px rgba(232,121,249,.4);letter-spacing:-.01em">${escapeHtml(nome)}</div>
    <div class="epic-sub" style="font-size:13px;color:#c4b5fd;font-weight:600;margin-bottom:18px">Troca com diferença épica</div>
    <div class="epic-valor" style="font-family:var(--font-mono);font-size:36px;font-weight:800;color:#f0abfc;text-shadow:0 0 32px rgba(240,171,252,.5);letter-spacing:-.02em;font-variant-numeric:tabular-nums">R$ ${Number(valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
    <div class="epic-foot" style="margin-top:18px;font-size:10px;color:#b8a8d4;font-weight:700;letter-spacing:.15em">1º DA FILA GARANTIDO</div>
    <button class="epic-close" style="margin-top:22px;padding:10px 32px;border:1px solid rgba(184, 168, 212,.4);border-radius:10px;background:rgba(184, 168, 212,.15);color:#e9d5ff;font-family:var(--font-mono);font-size:12px;font-weight:700;cursor:pointer;transition:all .2s">FECHAR</button>
  `;
  overlay.appendChild(card);
  document.body.appendChild(overlay);

  const closeBtn = card.querySelector('.epic-close');
  const closeNow = () => {
    if (!gsap) { overlay.remove(); _epicOverlay = null; return; }
    gsap.to(overlay, { opacity: 0, duration: 0.4, ease: 'power2.in', onComplete: () => { overlay.remove(); if (_epicOverlay === overlay) _epicOverlay = null; } });
    gsap.to(card, { scale: 0.9, filter: 'blur(8px)', duration: 0.4, ease: 'power2.in' });
  };
  closeBtn.addEventListener('click', closeNow);

  if (!gsap) {
    overlay.style.opacity = '1';
    setTimeout(closeNow, 3500);
    return;
  }

  // Entrada em timeline
  const tl = gsap.timeline();
  tl.to(overlay, { opacity: 1, duration: 0.3, ease: 'power2.out' })
    .from(card, { scale: 0.5, rotationY: 30, opacity: 0, duration: 0.7, ease: 'back.out(1.6)' }, '<')
    .from(card.querySelector('.epic-label'), { y: -12, opacity: 0, duration: 0.35, ease: 'power2.out' }, '-=0.2')
    .from(card.querySelector('.epic-gem'), { scale: 0, rotation: -180, opacity: 0, duration: 0.55, ease: 'back.out(2.4)' }, '-=0.2')
    .from([card.querySelector('.epic-name'), card.querySelector('.epic-sub')], { y: 10, opacity: 0, duration: 0.3, stagger: 0.08, ease: 'power2.out' }, '-=0.3')
    .from(card.querySelector('.epic-valor'), { scale: 0.6, opacity: 0, duration: 0.5, ease: 'back.out(2)' }, '-=0.15')
    .from(card.querySelector('.epic-foot'), { y: 8, opacity: 0, duration: 0.3, ease: 'power2.out' }, '-=0.25')
    .from(card.querySelector('.epic-close'), { y: 8, opacity: 0, duration: 0.3, ease: 'power2.out' }, '-=0.2');

  // Pulso do valor (loop curto)
  gsap.to(card.querySelector('.epic-valor'), { scale: 1.05, duration: 0.9, ease: 'sine.inOut', yoyo: true, repeat: 3, delay: 1.2 });

  // Confete simples (divs) em stagger
  const confettiLayer = document.createElement('div');
  confettiLayer.style.cssText = `position:absolute;inset:0;pointer-events:none;overflow:hidden;z-index:0`;
  overlay.insertBefore(confettiLayer, card);
  const palette = ['#b8a8d4', '#d4a8c4', '#c7f5d6', '#aaeec4', '#d4a373', '#e8d0a0'];
  const bits = [];
  for (let i = 0; i < 40; i++) {
    const b = document.createElement('div');
    const sz = 6 + Math.random() * 8;
    b.style.cssText = `position:absolute;left:${Math.random() * 100}%;top:-20px;width:${sz}px;height:${sz}px;background:${palette[i % palette.length]};border-radius:${Math.random() > 0.5 ? '50%' : '2px'};will-change:transform,opacity`;
    confettiLayer.appendChild(b);
    bits.push(b);
  }
  gsap.to(bits, {
    y: () => window.innerHeight + 40,
    x: () => (Math.random() - 0.5) * 160,
    rotation: () => (Math.random() - 0.5) * 720,
    opacity: 0,
    duration: () => 2 + Math.random() * 1.4,
    ease: 'power1.in',
    stagger: { each: 0.04, from: 'random' },
    delay: 0.3
  });

  // Auto-close
  setTimeout(closeNow, 3800);
}
