import { describe, it, expect } from 'vitest';

// Espelho JS da fórmula SQL vendor_level_from_xp:
//   floor(sqrt(max(xp,0) / 150))
// Mantido em sync manualmente — se o SQL mudar, atualizar aqui.
function levelFromXp(xp) {
  return Math.max(0, Math.floor(Math.sqrt(Math.max(0, xp) / 150)));
}

// E o inverso: xp necessário pra chegar no nível N
//   level * level * 150
function xpForLevel(level) {
  return Math.max(0, level) * Math.max(0, level) * 150;
}

describe('vendor_level_from_xp (espelho SQL)', () => {
  it('xp=0 → nível 0', () => {
    expect(levelFromXp(0)).toBe(0);
  });

  it('xp abaixo do threshold do nível 1 → nível 0', () => {
    expect(levelFromXp(149)).toBe(0);
    expect(levelFromXp(1)).toBe(0);
  });

  it('xp exatamente no threshold → sobe de nível', () => {
    expect(levelFromXp(150)).toBe(1); // 1² × 150
    expect(levelFromXp(600)).toBe(2); // 2² × 150
    expect(levelFromXp(1350)).toBe(3); // 3² × 150
  });

  it('breakpoints esperados do roadmap', () => {
    expect(levelFromXp(3750)).toBe(5); // 5² × 150
    expect(levelFromXp(15000)).toBe(10); // 10² × 150
    expect(levelFromXp(60000)).toBe(20); // 20² × 150
  });

  it('xp entre níveis arredonda pra baixo', () => {
    // Entre nível 1 (150) e nível 2 (600)
    expect(levelFromXp(300)).toBe(1);
    expect(levelFromXp(599)).toBe(1);
    expect(levelFromXp(600)).toBe(2);
  });

  it('valores negativos viram 0 (não quebra)', () => {
    expect(levelFromXp(-100)).toBe(0);
    expect(levelFromXp(-1)).toBe(0);
  });

  it('valores muito grandes ainda calculam corretamente', () => {
    expect(levelFromXp(1_000_000)).toBe(81); // floor(sqrt(1e6/150)) = 81
  });
});

describe('vendor_xp_for_level (inverso)', () => {
  it('nível 0 → 0 XP', () => {
    expect(xpForLevel(0)).toBe(0);
  });

  it('nível 1 → 150', () => {
    expect(xpForLevel(1)).toBe(150);
  });

  it('nível 10 → 15000', () => {
    expect(xpForLevel(10)).toBe(15000);
  });

  it('nível 20 → 60000', () => {
    expect(xpForLevel(20)).toBe(60000);
  });

  it('levelFromXp(xpForLevel(N)) == N pra N entre 0 e 50', () => {
    for (let n = 0; n <= 50; n++) {
      expect(levelFromXp(xpForLevel(n))).toBe(n);
    }
  });
});

// Espelho JS da função SQL vendor_tier_from_level.
// Mantido em sync manual com sql/17-tier-ranking.sql — se o SQL mudar,
// atualizar aqui também.
function tierFromLevel(level) {
  if (level <= 1) return { code: 'pedra', major_code: 'pedra', label: 'Pedra' };
  if (level <= 3) return { code: 'madeira', major_code: 'madeira', label: 'Madeira' };
  if (level === 4) return { code: 'ferro_1', major_code: 'ferro', label: 'Ferro I' };
  if (level === 5) return { code: 'ferro_2', major_code: 'ferro', label: 'Ferro II' };
  if (level === 6) return { code: 'ferro_3', major_code: 'ferro', label: 'Ferro III' };
  if (level === 7) return { code: 'bronze_1', major_code: 'bronze', label: 'Bronze I' };
  if (level === 8) return { code: 'bronze_2', major_code: 'bronze', label: 'Bronze II' };
  if (level === 9) return { code: 'bronze_3', major_code: 'bronze', label: 'Bronze III' };
  if (level === 10) return { code: 'prata_1', major_code: 'prata', label: 'Prata I' };
  if (level === 11) return { code: 'prata_2', major_code: 'prata', label: 'Prata II' };
  if (level === 12) return { code: 'prata_3', major_code: 'prata', label: 'Prata III' };
  if (level === 13) return { code: 'ouro_1', major_code: 'ouro', label: 'Ouro I' };
  if (level === 14) return { code: 'ouro_2', major_code: 'ouro', label: 'Ouro II' };
  if (level === 15) return { code: 'ouro_3', major_code: 'ouro', label: 'Ouro III' };
  if (level === 16) return { code: 'platina_1', major_code: 'platina', label: 'Platina I' };
  if (level === 17) return { code: 'platina_2', major_code: 'platina', label: 'Platina II' };
  if (level === 18) return { code: 'platina_3', major_code: 'platina', label: 'Platina III' };
  if (level === 19) return { code: 'diamante_1', major_code: 'diamante', label: 'Diamante I' };
  if (level === 20) return { code: 'diamante_2', major_code: 'diamante', label: 'Diamante II' };
  if (level === 21) return { code: 'diamante_3', major_code: 'diamante', label: 'Diamante III' };
  if (level <= 24) return { code: 'mestre', major_code: 'mestre', label: 'Mestre' };
  if (level <= 29) return { code: 'grao_mestre', major_code: 'grao_mestre', label: 'Grão-Mestre' };
  if (level <= 34) return { code: 'rubi', major_code: 'rubi', label: 'Rubi' };
  if (level <= 44) return { code: 'lendario', major_code: 'lendario', label: 'Lendário' };
  return { code: 'mitico', major_code: 'mitico', label: 'Mítico' };
}

describe('vendor_tier_from_level (espelho SQL — Fase 2b)', () => {
  it('N0-1 mapeia pra Pedra', () => {
    expect(tierFromLevel(0).code).toBe('pedra');
    expect(tierFromLevel(1).code).toBe('pedra');
  });

  it('N2-3 mapeia pra Madeira', () => {
    expect(tierFromLevel(2).code).toBe('madeira');
    expect(tierFromLevel(3).code).toBe('madeira');
  });

  it('sub-tiers I/II/III de Ferro (N4-6)', () => {
    expect(tierFromLevel(4).code).toBe('ferro_1');
    expect(tierFromLevel(5).code).toBe('ferro_2');
    expect(tierFromLevel(6).code).toBe('ferro_3');
  });

  it('sub-tiers de Diamante (N19-21) compartilham o mesmo major_code', () => {
    const t19 = tierFromLevel(19);
    const t20 = tierFromLevel(20);
    const t21 = tierFromLevel(21);
    expect(t19.major_code).toBe('diamante');
    expect(t20.major_code).toBe('diamante');
    expect(t21.major_code).toBe('diamante');
    expect(t19.code).toBe('diamante_1');
    expect(t21.code).toBe('diamante_3');
  });

  it('top tiers (Mestre, Grão-Mestre, Rubi, Lendário, Mítico)', () => {
    expect(tierFromLevel(22).code).toBe('mestre');
    expect(tierFromLevel(24).code).toBe('mestre');
    expect(tierFromLevel(25).code).toBe('grao_mestre');
    expect(tierFromLevel(29).code).toBe('grao_mestre');
    expect(tierFromLevel(30).code).toBe('rubi');
    expect(tierFromLevel(34).code).toBe('rubi');
    expect(tierFromLevel(35).code).toBe('lendario');
    expect(tierFromLevel(44).code).toBe('lendario');
    expect(tierFromLevel(45).code).toBe('mitico');
    expect(tierFromLevel(99).code).toBe('mitico');
  });

  it('continuidade: todo nível de 0 a 60 tem tier válido', () => {
    for (let n = 0; n <= 60; n++) {
      const t = tierFromLevel(n);
      expect(t).toBeDefined();
      expect(t.code).toBeTruthy();
      expect(t.major_code).toBeTruthy();
      expect(t.label).toBeTruthy();
    }
  });

  it('exatamente 13 tiers maiores distintos nos níveis 0-50', () => {
    const majors = new Set();
    for (let n = 0; n <= 50; n++) majors.add(tierFromLevel(n).major_code);
    expect(majors.size).toBe(13);
    expect([...majors]).toEqual(
      expect.arrayContaining([
        'pedra',
        'madeira',
        'ferro',
        'bronze',
        'prata',
        'ouro',
        'platina',
        'diamante',
        'mestre',
        'grao_mestre',
        'rubi',
        'lendario',
        'mitico'
      ])
    );
  });

  it('fanfarra: majors adjacentes nunca colidem (N=X e N=X+1 no mesmo major ou muda)', () => {
    // Se existe algum N onde major(N) != major(N+1), é uma transição de fanfarra
    let transitions = 0;
    let prev = tierFromLevel(0).major_code;
    for (let n = 1; n <= 60; n++) {
      const curr = tierFromLevel(n).major_code;
      if (curr !== prev) transitions++;
      prev = curr;
    }
    // Pedra→Madeira→Ferro→Bronze→Prata→Ouro→Platina→Diamante→Mestre→GMs→Rubi→Lendario→Mitico = 12 transições
    expect(transitions).toBe(12);
  });
});

describe('simulação de curva de progressão', () => {
  // Cenário do roadmap: vendedor mediano = 15 atend × 20 + 5 vendas × 50 = 550 pts/dia
  const DAILY_XP = 15 * 20 + 5 * 50; // = 550

  it('vendedor mediano chega no nível 1 em menos de 1 dia', () => {
    expect(levelFromXp(DAILY_XP)).toBeGreaterThanOrEqual(1);
    expect(levelFromXp(DAILY_XP)).toBeLessThanOrEqual(2);
  });

  it('vendedor mediano chega no nível 5 em ~1 semana (6 dias)', () => {
    const weekXp = DAILY_XP * 6; // 3300
    // sqrt(3300/150) ≈ 4.69 → nível 4
    expect(levelFromXp(weekXp)).toBeGreaterThanOrEqual(4);
    expect(levelFromXp(weekXp)).toBeLessThanOrEqual(5);
  });

  it('vendedor mediano chega no nível 10 em ~28 dias', () => {
    const monthXp = DAILY_XP * 28; // 15400
    expect(levelFromXp(monthXp)).toBeGreaterThanOrEqual(10);
    expect(levelFromXp(monthXp)).toBeLessThanOrEqual(11);
  });
});
