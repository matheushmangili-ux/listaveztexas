// ============================================
// <mv-logo> — chevron mark do minhavez
// ============================================
// Uso:
//   <mv-logo></mv-logo>                           → default (size M, sem wordmark)
//   <mv-logo size="XL" wordmark></mv-logo>        → com wordmark "minhavez"
//   <mv-logo variant="inverse"></mv-logo>         → chevron branco (para fundos escuros)
//   <mv-logo weight="black" size="L"></mv-logo>   → pesos: light | regular | bold | black
//
// Cor: usa currentColor (herda de color do parent). Em fundos coloridos, wrap em
// <span style="color: var(--accent)"><mv-logo /></span>.

(function () {
  if (typeof customElements === 'undefined') return;
  if (customElements.get('mv-logo')) return;

  const SIZES = { S: 24, M: 40, L: 64, XL: 96, XXL: 128 };
  const WEIGHTS = { light: 8, regular: 12, bold: 16, black: 20 };

  class MvLogo extends HTMLElement {
    static get observedAttributes() {
      return ['size', 'variant', 'weight', 'wordmark'];
    }

    connectedCallback() {
      this.render();
    }
    attributeChangedCallback() {
      if (this.isConnected) this.render();
    }

    render() {
      const sizeAttr = (this.getAttribute('size') || 'M').toUpperCase();
      const size = SIZES[sizeAttr] || SIZES.M;
      const weight = WEIGHTS[this.getAttribute('weight')] || WEIGHTS.regular;
      const variant = this.getAttribute('variant') || 'default';
      const hasWordmark = this.hasAttribute('wordmark');

      // inverse: força branco puro (para sobrepor imagens/fundos coloridos)
      const strokeAttr = variant === 'inverse' ? 'stroke="#ffffff"' : 'stroke="currentColor"';
      // mono: sem gradação de opacidade
      const op1 = variant === 'mono' ? '1' : '.35';
      const op2 = variant === 'mono' ? '1' : '.7';

      const svg = `
        <svg viewBox="0 0 120 120" width="${size}" height="${size}" aria-label="minhavez" role="img" focusable="false">
          <g fill="none" ${strokeAttr} stroke-linejoin="miter" stroke-width="${weight}">
            <path d="M 18 42 L 38 60 L 18 78" opacity="${op1}"/>
            <path d="M 42 42 L 62 60 L 42 78" opacity="${op2}"/>
            <path d="M 66 42 L 86 60 L 66 78"/>
          </g>
        </svg>
      `;

      if (hasWordmark) {
        const fontSize = Math.round(size * 0.56);
        this.innerHTML = `
          <span class="mv-logo-lockup" style="display:inline-flex; align-items:center; gap:${Math.round(size * 0.24)}px;">
            ${svg}
            <span class="mv-logo-wordmark" style="font-family: 'Inter Tight', system-ui, sans-serif; font-size: ${fontSize}px; font-weight: 500; letter-spacing: -0.045em; line-height: 1;">minha<span style="color: var(--accent, #8b5cf6)">vez</span></span>
          </span>
        `;
      } else {
        this.innerHTML = svg;
      }

      // Styling interno
      this.style.display = this.style.display || 'inline-block';
      this.style.lineHeight = '0';
    }
  }

  customElements.define('mv-logo', MvLogo);
})();
