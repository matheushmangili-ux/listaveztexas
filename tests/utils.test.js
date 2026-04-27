import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  escapeHtml,
  formatTime,
  initials,
  todayRange,
  yesterdayRange,
  weekRange,
  monthRange,
  initTheme,
  toggleTheme,
  deriveAccentVariants,
  MOTIVOS,
  STATUS_CONFIG,
  SAIDA_COLORS,
  PAUSE_LIMITS
} from '../js/utils.js';

describe('escapeHtml', () => {
  it('retorna string vazia para null/undefined', () => {
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(undefined)).toBe('');
  });

  it('escapa todos os caracteres HTML perigosos', () => {
    expect(escapeHtml('<script>alert("xss")</script>')).toBe('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
  });

  it('escapa aspas simples e duplas', () => {
    expect(escapeHtml(`it's "quoted"`)).toBe('it&#39;s &quot;quoted&quot;');
  });

  it('escapa ampersand primeiro para evitar dupla escape', () => {
    expect(escapeHtml('A & B < C')).toBe('A &amp; B &lt; C');
  });

  it('converte números e booleanos em string', () => {
    expect(escapeHtml(42)).toBe('42');
    expect(escapeHtml(true)).toBe('true');
  });
});

describe('formatTime', () => {
  it('retorna "0min 0s" para valores inválidos', () => {
    expect(formatTime(null)).toBe('0min 0s');
    expect(formatTime(0)).toBe('0min 0s');
    expect(formatTime(NaN)).toBe('0min 0s');
    expect(formatTime(Infinity)).toBe('0min 0s');
  });

  it('formata segundos em min e s', () => {
    expect(formatTime(65)).toBe('1min 5s');
    expect(formatTime(120)).toBe('2min 0s');
  });

  it('formata horas com min pad', () => {
    expect(formatTime(3600)).toBe('1h 00min');
    expect(formatTime(3665)).toBe('1h 01min');
    expect(formatTime(7320)).toBe('2h 02min');
  });

  it('arredonda frações para baixo', () => {
    expect(formatTime(59.9)).toBe('0min 59s');
  });
});

describe('initials', () => {
  it('pega 2 primeiras iniciais e caixa alta', () => {
    expect(initials('João Silva')).toBe('JS');
    expect(initials('maria das dores')).toBe('MD');
  });

  it('funciona com 1 palavra só', () => {
    expect(initials('Carlos')).toBe('C');
  });

  it('fallback para "??" quando vazio', () => {
    expect(initials('')).toBe('??');
    expect(initials(null)).toBe('??');
    expect(initials(undefined)).toBe('??');
  });

  it('ignora palavras a partir da 3ª', () => {
    expect(initials('Ana Beatriz Costa')).toBe('AB');
  });
});

describe('todayRange', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-10T14:30:00'));
  });
  afterEach(() => vi.useRealTimers());

  it('retorna hoje 00:00 → amanhã 00:00', () => {
    const r = todayRange();
    expect(new Date(r.start).toISOString().startsWith('2026-04-10T')).toBe(true);
    expect(new Date(r.end).toISOString().startsWith('2026-04-11T')).toBe(true);
  });

  it('start é sempre meia-noite', () => {
    const r = todayRange();
    const start = new Date(r.start);
    expect(start.getHours()).toBe(0);
    expect(start.getMinutes()).toBe(0);
    expect(start.getSeconds()).toBe(0);
  });
});

describe('yesterdayRange', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-10T14:30:00'));
  });
  afterEach(() => vi.useRealTimers());

  it('retorna ontem 00:00 → hoje 00:00', () => {
    const r = yesterdayRange();
    expect(new Date(r.start).toISOString().startsWith('2026-04-09T')).toBe(true);
    expect(new Date(r.end).toISOString().startsWith('2026-04-10T')).toBe(true);
  });
});

describe('weekRange', () => {
  afterEach(() => vi.useRealTimers());

  it('começa na segunda quando hoje é quarta', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-08T14:30:00')); // quarta
    const r = weekRange();
    const start = new Date(r.start);
    expect(start.getDay()).toBe(1); // segunda
    expect(start.getDate()).toBe(6);
  });

  it('começa na segunda anterior quando hoje é domingo', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-12T14:30:00')); // domingo
    const r = weekRange();
    const start = new Date(r.start);
    expect(start.getDay()).toBe(1);
    expect(start.getDate()).toBe(6); // segunda 6/abr
  });

  it('end é amanhã à meia-noite', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-10T14:30:00'));
    const r = weekRange();
    const end = new Date(r.end);
    expect(end.getDate()).toBe(11);
    expect(end.getHours()).toBe(0);
  });
});

describe('monthRange', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-15T14:30:00'));
  });
  afterEach(() => vi.useRealTimers());

  it('começa no dia 1 do mês atual', () => {
    const r = monthRange();
    const start = new Date(r.start);
    expect(start.getDate()).toBe(1);
    expect(start.getMonth()).toBe(3); // abril
    expect(start.getFullYear()).toBe(2026);
  });

  it('end é amanhã à meia-noite', () => {
    const r = monthRange();
    const end = new Date(r.end);
    expect(end.getDate()).toBe(16);
    expect(end.getHours()).toBe(0);
  });
});

describe('theme helpers', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
  });

  it('initTheme aplica "dark" quando não há tema salvo', () => {
    initTheme();
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('initTheme aplica tema salvo no localStorage', () => {
    localStorage.setItem('lv-theme', 'dark');
    initTheme();
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('toggleTheme alterna light → dark', () => {
    document.documentElement.setAttribute('data-theme', 'light');
    expect(toggleTheme()).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(localStorage.getItem('lv-theme')).toBe('dark');
  });

  it('toggleTheme alterna dark → light', () => {
    document.documentElement.setAttribute('data-theme', 'dark');
    expect(toggleTheme()).toBe('light');
    expect(localStorage.getItem('lv-theme')).toBe('light');
  });
});

describe('constants', () => {
  it('MOTIVOS tem 5 motivos com label e color', () => {
    const keys = Object.keys(MOTIVOS);
    expect(keys).toHaveLength(5);
    for (const k of keys) {
      expect(MOTIVOS[k]).toHaveProperty('label');
      expect(MOTIVOS[k]).toHaveProperty('color');
      expect(MOTIVOS[k]).toHaveProperty('icon');
    }
  });

  it('STATUS_CONFIG cobre os 4 status de vendedor', () => {
    expect(STATUS_CONFIG).toHaveProperty('disponivel');
    expect(STATUS_CONFIG).toHaveProperty('em_atendimento');
    expect(STATUS_CONFIG).toHaveProperty('pausa');
    expect(STATUS_CONFIG).toHaveProperty('fora');
  });

  it('SAIDA_COLORS inclui os motivos de pausa principais', () => {
    expect(SAIDA_COLORS.almoco).toBeDefined();
    expect(SAIDA_COLORS.banheiro).toBeDefined();
    expect(SAIDA_COLORS.reuniao).toBeDefined();
    expect(SAIDA_COLORS.operacional).toBeDefined();
  });

  it('PAUSE_LIMITS tem limites razoáveis em minutos', () => {
    expect(PAUSE_LIMITS.almoco).toBe(60);
    expect(PAUSE_LIMITS.banheiro).toBe(15);
    expect(PAUSE_LIMITS.reuniao).toBe(30);
    expect(PAUSE_LIMITS.operacional).toBe(45);
  });
});

describe('deriveAccentVariants', () => {
  it('retorna null para hex inválido', () => {
    expect(deriveAccentVariants('red')).toBeNull();
    expect(deriveAccentVariants('')).toBeNull();
    expect(deriveAccentVariants('#xyz')).toBeNull();
  });

  it('normaliza shorthand hex (#abc → #aabbcc)', () => {
    const v = deriveAccentVariants('#abc');
    expect(v.base).toBe('#aabbcc');
  });

  it('base é o próprio hex (lowercase)', () => {
    const v = deriveAccentVariants('#FF0000');
    expect(v.base).toBe('#ff0000');
  });

  it('bright é mais claro que base; dim é mais escuro (no eixo L)', () => {
    const v = deriveAccentVariants('#3366cc');
    const intHex = (h) => parseInt(h.slice(1), 16);
    // bright e dim devem existir e ser válidos
    expect(v.bright).toMatch(/^#[0-9a-f]{6}$/);
    expect(v.dim).toMatch(/^#[0-9a-f]{6}$/);
    // bright tem maior soma RGB que dim (proxy grosso de luminosidade)
    expect(intHex(v.bright)).toBeGreaterThan(intHex(v.dim));
  });

  it('ink é preto em fundos claros, branco em escuros', () => {
    expect(deriveAccentVariants('#ffffff').ink).toBe('#0d0d0d');
    expect(deriveAccentVariants('#000000').ink).toBe('#ffffff');
    // mint minhavez (#aaeec4): claro → ink preto
    expect(deriveAccentVariants('#aaeec4').ink).toBe('#0d0d0d');
  });
});
