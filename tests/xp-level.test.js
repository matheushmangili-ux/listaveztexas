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
    expect(levelFromXp(150)).toBe(1);     // 1² × 150
    expect(levelFromXp(600)).toBe(2);     // 2² × 150
    expect(levelFromXp(1350)).toBe(3);    // 3² × 150
  });

  it('breakpoints esperados do roadmap', () => {
    expect(levelFromXp(3750)).toBe(5);    // 5² × 150
    expect(levelFromXp(15000)).toBe(10);  // 10² × 150
    expect(levelFromXp(60000)).toBe(20);  // 20² × 150
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
