// Regressão: toda redefinição das RPCs de finalização de atendimento
// precisa chamar _grant_xp_for_attendance. Esquecer o hook em qualquer
// migration futura silencia a gamificação inteira (descoberto em 2026-04-16
// depois de 1.303 atendimentos Texas Center sem XP — vide sql/33).
//
// Como o risco é que alguém rode `CREATE OR REPLACE FUNCTION finalizar_atendimento`
// sem o hook, o teste lê TODOS os .sql do repo e verifica cada bloco CREATE OR
// REPLACE dessas funções. Também valida que sql/33 existe e bate o padrão.

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

const SQL_DIR = join(process.cwd(), 'sql');
const GUARDED_FUNCTIONS = ['finalizar_atendimento', 'vendor_finish_attendance'];
const HOOK_CALL = '_grant_xp_for_attendance';

function allSqlFiles() {
  return readdirSync(SQL_DIR)
    .filter((f) => f.endsWith('.sql'))
    .map((f) => ({ name: f, body: readFileSync(join(SQL_DIR, f), 'utf8') }));
}

// Divide o arquivo em blocos CREATE OR REPLACE FUNCTION ... até o próximo
// ';\n' que fecha o corpo (LANGUAGE plpgsql ... $$). Retorna trechos com
// o nome da função que cada bloco define, entre os alvos monitorados.
function extractFunctionBlocks(sqlBody, targets) {
  const blocks = [];
  const re = /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+(?:public\.)?(\w+)\s*\(/gi;
  let match;
  while ((match = re.exec(sqlBody)) !== null) {
    const fname = match[1];
    if (!targets.includes(fname)) continue;
    // Captura do início até o próximo "$$ LANGUAGE" ou final do arquivo
    const startIdx = match.index;
    const endMarker = /\$\$\s*LANGUAGE/gi;
    endMarker.lastIndex = startIdx;
    const endMatch = endMarker.exec(sqlBody);
    const endIdx = endMatch ? endMatch.index + 200 : sqlBody.length; // +200 pra pegar o resto
    blocks.push({ fname, body: sqlBody.slice(startIdx, endIdx) });
  }
  return blocks;
}

describe('XP hook regression — finalizar_atendimento & vendor_finish_attendance', () => {
  const files = allSqlFiles();

  it('sql/ tem arquivos para ler', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it('última redefinição de cada função monitorada chama _grant_xp_for_attendance', () => {
    // Migrations aplicam em ordem lexicográfica (prefixo numérico NN-*.sql).
    // O que importa é o "estado final" do DB: a última redefinição de cada
    // função precisa ter o hook. Redefinições anteriores (pré-hook) podem
    // existir historicamente — são sobrescritas pelas posteriores.
    // Ordem de aplicação real: arquivos sem prefixo numérico (schema.sql,
    // rpc.sql, rls.sql — base) vêm antes dos numerados (NN-*.sql), que são
    // aplicados em ordem crescente do N.
    const rank = (name) => {
      const m = name.match(/^(\d+)/);
      return m ? parseInt(m[1], 10) : -1;
    };
    const sorted = [...files].sort((a, b) => rank(a.name) - rank(b.name) || a.name.localeCompare(b.name));
    const lastDefinition = new Map(); // fname → { file, body }
    for (const f of sorted) {
      const blocks = extractFunctionBlocks(f.body, GUARDED_FUNCTIONS);
      for (const b of blocks) lastDefinition.set(b.fname, { file: f.name, body: b.body });
    }
    const violations = [];
    for (const target of GUARDED_FUNCTIONS) {
      const def = lastDefinition.get(target);
      if (!def) {
        violations.push(`${target}: nenhuma definição encontrada`);
      } else if (!def.body.includes(HOOK_CALL)) {
        violations.push(`${def.file}: última redefinição de ${target} sem ${HOOK_CALL}`);
      }
    }
    expect(violations, `Hooks ausentes:\n${violations.join('\n')}`).toEqual([]);
  });

  it('migration 33 (fix forward) existe e contém o hook em finalizar_atendimento', () => {
    const m33 = files.find((f) => f.name.startsWith('33-'));
    expect(m33, 'sql/33-*.sql não encontrada').toBeDefined();
    expect(m33.body).toMatch(/finalizar_atendimento/);
    expect(m33.body).toMatch(new RegExp(HOOK_CALL));
  });

  it('cada função monitorada é redefinida em pelo menos uma migration', () => {
    for (const target of GUARDED_FUNCTIONS) {
      const found = files.some((f) => extractFunctionBlocks(f.body, [target]).length > 0);
      expect(found, `Nenhuma migration define ${target}`).toBe(true);
    }
  });
});
