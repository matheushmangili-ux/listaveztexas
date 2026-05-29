// ============================================
// <mv-loader> — tela/splash de loading
// ============================================
// Chevron animado em 3 tempos (loop 2.4s) + partículas ascendentes + halo radial.
// Substitui a antiga .texas-loader.
//
// Uso:
//   <mv-loader></mv-loader>                      → compacto (inline, sem fullscreen)
//   <mv-loader fullscreen caption="Carregando"></mv-loader>
//   <mv-loader size="96" particles="22"></mv-loader>
//
// Herda cores via CSS vars (--accent, --accent-bright, --bg-deep, --text-muted).

(function () {
  if (typeof customElements === 'undefined') return;
  if (customElements.get('mv-loader')) return;

  const TEMPLATE_CSS = `
    :host {
      display: inline-block;
      position: relative;
      color: var(--accent, #7c8cff);
    }
    :host([fullscreen]) {
      display: grid;
      place-items: center;
      position: fixed;
      inset: 0;
      background: var(--bg-deep, #0a0614);
      z-index: 9999;
    }
    .stage {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 14px;
      position: relative;
      z-index: 2;
    }
    .halo {
      position: absolute;
      inset: 0;
      pointer-events: none;
      z-index: 0;
      background: radial-gradient(ellipse at center, color-mix(in srgb, var(--accent, #7c8cff) 22%, transparent), transparent 55%);
    }
    .particles {
      position: absolute;
      inset: 0;
      pointer-events: none;
      overflow: hidden;
      z-index: 1;
    }
    .pt {
      position: absolute;
      width: 3px; height: 3px;
      border-radius: 50%;
      opacity: 0;
      background: var(--accent-bright, #a8b1ff);
      box-shadow: 0 0 8px color-mix(in srgb, var(--accent, #7c8cff) 80%, transparent),
                  0 0 14px color-mix(in srgb, var(--accent, #7c8cff) 40%, transparent);
      animation: mv-pt linear infinite;
    }
    @keyframes mv-pt {
      0%   { opacity: 0; transform: translateY(100%) scale(.4); }
      15%  { opacity: .85; }
      85%  { opacity: .85; }
      100% { opacity: 0; transform: translateY(-20%) scale(1); }
    }
    svg.mark {
      width: var(--_size, 96px);
      height: var(--_size, 96px);
      display: block;
    }
    .mark .m-stroke {
      fill: none;
      stroke: currentColor;
      stroke-width: 11;
      stroke-linecap: round;
      stroke-linejoin: round;
      stroke-dasharray: 170;
      stroke-dashoffset: 170;
      animation: mv-draw 2.2s ease-in-out infinite;
    }
    .mark .m-leg {
      fill: none;
      stroke: var(--accent, #7c8cff);
      stroke-width: 11;
      stroke-linecap: round;
      opacity: 0;
      animation: mv-leg 2.2s ease-in-out infinite;
    }
    @keyframes mv-draw {
      0%   { stroke-dashoffset: 170; }
      55%  { stroke-dashoffset: 0; }
      100% { stroke-dashoffset: 0; }
    }
    @keyframes mv-leg {
      0%, 45% { opacity: 0; }
      70%, 100% { opacity: 1; }
    }
    .caption {
      font-family: var(--font-mono, 'JetBrains Mono', monospace);
      font-size: 10px;
      letter-spacing: 0.15em;
      text-transform: uppercase;
      color: var(--text-muted, #7a6e99);
      opacity: .75;
    }
    @media (prefers-reduced-motion: reduce) {
      .mark .m-stroke { animation: none; stroke-dashoffset: 0; }
      .mark .m-leg { animation: none; opacity: 1; }
      .pt { animation: none; opacity: 0; }
    }
  `;

  class MvLoader extends HTMLElement {
    constructor() {
      super();
      this._root = this.attachShadow({ mode: 'open' });
    }

    static get observedAttributes() {
      return ['size', 'particles', 'caption', 'fullscreen'];
    }

    connectedCallback() {
      this.render();
    }

    attributeChangedCallback() {
      if (this.isConnected) this.render();
    }

    render() {
      const size = parseInt(this.getAttribute('size') || '96', 10);
      const numParticles = parseInt(this.getAttribute('particles') || '22', 10);
      const caption = this.getAttribute('caption') || '';

      const particles = [];
      for (let i = 0; i < numParticles; i++) {
        const left = Math.random() * 100;
        const duration = 6 + Math.random() * 10;
        const delay = Math.random() * 8;
        const s = 1 + Math.random() * 2.5;
        particles.push(
          `<div class="pt" style="left:${left}%; width:${s}px; height:${s}px; animation-duration:${duration}s; animation-delay:${delay}s;"></div>`
        );
      }

      this._root.innerHTML = `
        <style>${TEMPLATE_CSS}</style>
        <div class="halo"></div>
        <div class="particles">${particles.join('')}</div>
        <div class="stage" style="--_size:${size}px">
          <svg class="mark" viewBox="0 0 100 100" aria-hidden="true" focusable="false">
            <polyline class="m-stroke" points="22,74 22,30 50,55 78,30 78,74"/>
            <line class="m-leg" x1="78" y1="31" x2="78" y2="73"/>
          </svg>
          ${caption ? `<div class="caption">${caption}</div>` : ''}
        </div>
      `;
    }
  }

  customElements.define('mv-loader', MvLoader);
})();
