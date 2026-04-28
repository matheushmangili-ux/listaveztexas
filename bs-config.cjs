// ============================================
// Browser-sync config (dev local)
// ============================================
// Replica os rewrites do vercel.json como middleware,
// pra que URLs como /login, /:slug/dashboard funcionem
// no dev igual em produção.
// ============================================

const fs = require('fs');
const path = require('path');

const vercelConfig = JSON.parse(fs.readFileSync(path.join(__dirname, 'vercel.json'), 'utf8'));
const rewrites = (vercelConfig.rewrites || []).filter((r) => {
  // Ignora rewrites externos (ingest/posthog) e o catch-all
  if (r.destination.startsWith('http')) return false;
  if (r.source === '/(.*)') return false;
  return true;
});

// Pré-compila os patterns: ":slug" e ":path" → grupo de captura
const compiled = rewrites.map((r) => {
  const pattern = r.source.replace(/:[a-zA-Z_]+\*?/g, '([^/]+)').replace(/\*/g, '.*');
  return {
    re: new RegExp('^' + pattern + '/?$'),
    destination: r.destination
  };
});

function rewritesMiddleware(req, res, next) {
  const url = req.url.split('?')[0];
  // Não interfere em arquivos com extensão (deixa o static handler servir)
  if (path.extname(url)) return next();

  for (const r of compiled) {
    if (r.re.test(url)) {
      // Remove referências a $1, $2 etc (mantém só o destino fixo)
      const dest = r.destination.replace(/\$\d+/g, '').replace(/\/+$/, '') || '/';
      const query = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
      req.url = dest + query;
      return next();
    }
  }
  next();
}

module.exports = {
  server: {
    baseDir: './',
    middleware: [rewritesMiddleware]
  },
  files: ['**/*.{html,css,js}'],
  port: 3000,
  startPath: '/landing.html',
  notify: false,
  open: false,
  ignore: ['node_modules/**', '.git/**']
};
