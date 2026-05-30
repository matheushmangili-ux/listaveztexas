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
  // stroke-width no viewBox 100 (handoff: 11 = regular). Monograma "M".
  const WEIGHTS = { light: 9, regular: 11, bold: 13, black: 16 };

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

      // Monograma "M" (handoff). inverse: M branco puro (sobre fundos coloridos).
      const strokeAttr = variant === 'inverse' ? 'stroke="#ffffff"' : 'stroke="currentColor"';
      // mono: M de cor única (sem perna de acento). default/inverse: perna direita
      // em periwinkle (conceito "sua vez / movimento").
      const accentLeg =
        variant === 'mono'
          ? ''
          : `<line x1="78" y1="31" x2="78" y2="73" stroke="var(--accent, #7c8cff)" stroke-width="${weight}"/>`;

      // viewBox JUSTO ao desenho do "M" (com o stroke): tira a margem morta que
      // fazia o M parecer pequeno e inflava o gap óptico até o wordmark.
      // No lockup o mark renderiza um pouco menor que `size` pra casar com a
      // altura do texto; sozinho ocupa o tamanho cheio.
      const markPx = hasWordmark ? Math.round(size * 0.66) : size;
      const svg = `
        <svg viewBox="14 16 72 72" width="${markPx}" height="${markPx}" aria-label="minhavez" role="img" focusable="false">
          <g fill="none" stroke-linecap="round" stroke-linejoin="round" stroke-width="${weight}">
            <polyline points="22,74 22,30 50,55 78,30 78,74" ${strokeAttr}/>
            ${accentLeg}
          </g>
        </svg>
      `;

      if (hasWordmark) {
        const fontSize = Math.round(size * 0.56);
        this.innerHTML = `
          <span class="mv-logo-lockup" style="display:inline-flex; align-items:center; gap:${Math.round(size * 0.14)}px;">
            ${svg}
            <span class="mv-logo-wordmark" style="font-family: 'Inter Tight', system-ui, sans-serif; font-size: ${fontSize}px; font-weight: 500; letter-spacing: -0.03em; line-height: 1;">minha<span style="color: var(--accent, #7c8cff)">vez</span></span>
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
