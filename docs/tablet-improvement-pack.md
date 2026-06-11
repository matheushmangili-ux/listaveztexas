# Tablet (Lista da Vez) — diagnóstico do "não carrega" + pack de melhorias

> Data: 2026-06-11. Pedido: (1) por que o tablet não está carregando; (2) pack
> de melhorias estéticas, funcionais e ideais. Contexto: o tablet voltou ao
> jogo como camada de recepção — deixa de estar "congelado".

---

## 1. Diagnóstico do "não carrega"

**Tudo que dava pra verificar daqui saiu limpo:**

- Boot local: módulo carrega sem NENHUM erro de console até o redirect de auth
  (comportamento correto sem sessão).
- Grants: `atendimentos` tem SELECT de tabela inteira (26/26 colunas — as 5
  novas da captura de lead não quebram o `select('*')` do tablet);
  `vendedores` é por coluna, mas o tablet usa `VENDEDOR_PUBLIC_COLUMNS`
  (só colunas com grant). Sem 403.
- RPCs alteradas na etapa (vendor_finish_attendance, get_my_vendedor_context,
  leads) — **nenhuma é consumida pelo tablet**.
- Arquivos do tablet: intocados desde a era demand-capture (que foi verificada
  funcionando).

**A causa mais provável (mecanismo encontrado no código):**
`SESSION_TIMEOUT_TABLET = 30 min` — **logout automático por inatividade**
(`tablet-init.js`). Na etapa anterior o tablet era tocado o dia inteiro e o
timeout nunca disparava. Na etapa vendor-first ele virou **display parado** →
30 min sem toque → desloga sozinho → a equipe encontra a tela de login/escura
e reporta "a lista da vez não carrega". O timing da regressão bate exatamente
com a mudança de uso.

**Fix aplicado (neste commit):** com **turno aberto, não desloga nunca**
(loja operando = kiosk vivo); o timeout de 30 min continua valendo só sem
turno (loja fechada).

**Checklist de 2 min no dispositivo pra confirmar/encerrar:**

1. O que aparece na tela? (login → era o timeout, resolvido no próximo deploy;
   loader infinito/branco → me manda foto que eu sigo a trilha do boot.)
2. Hard-refresh uma vez após o deploy (garante SW v196).
3. Se a TELA estiver apagando sozinha: é o sono do Android/iPad — o item P0-2
   abaixo (Wake Lock) resolve por software.

---

## 2. Pack de melhorias

### P0 — Confiabilidade de kiosk ("não carrega" nunca mais)

| #    | Item                         | O quê                                                                                                                                                                                    | Esforço |
| ---- | ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| P0-1 | ✅ **Logout turno-aware**    | feito neste commit                                                                                                                                                                       | —       |
| P0-2 | **Screen Wake Lock**         | `navigator.wakeLock.request('screen')` + re-aquisição no `visibilitychange` — a tela do tablet **não apaga** enquanto houver turno. O "tablet morto" mais comum é só o sono do aparelho. | S       |
| P0-3 | **Watchdog de boot**         | se o boot não completar em ~10s, troca o loader por tela de erro com o motivo + botão "Recarregar" (hoje qualquer falha = loader infinito mudo).                                         | S       |
| P0-4 | **Banner offline/reconexão** | `navigator.onLine` + status do canal realtime → faixa "Sem conexão — reconectando…" (wifi de loja cai; hoje a fila congela em silêncio).                                                 | S       |
| P0-5 | **Auto-reload de madrugada** | reload programado ~4h se turno fechado — kiosk não acumula memória/SW velho de dias.                                                                                                     | S       |

### A — Estética (paridade com o design system)

| #   | Item                             | O quê                                                                                                                                                                  | Esforço |
| --- | -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| A-1 | **Entrar na escala tipográfica** | tablet.v52.css ficou fora da varredura (72 `font-size` crus) — mapear pros tokens `--text-*` como vendor/dashboard.                                                    | M       |
| A-2 | **Radius + hex pra tokens**      | 9 hexes crus + radius fora do padrão; tirar `tablet.v52.css` do `HEX_SKIP` do ratchet quando zerar.                                                                    | S       |
| A-3 | **`onclick=` ×34 → delegação**   | padrão mv-topbar (data-attrs + listener), tablet é a última tela cheia de JS em atributo.                                                                              | M       |
| A-4 | **Empty states padrão**          | fila vazia/sem turno no padrão `.empty-state` (ícone ghost + frase + ação).                                                                                            | S       |
| A-5 | **Legibilidade de longe**        | o tablet é visto a 2–4m: número da posição e nome do "próximo" em display maior (os one-offs 48–72px viram intencionais documentados), contraste reforçado no chamado. | M       |
| A-6 | **Celebrations periwinkle**      | revisar cores do confete/GSAP pra paleta atual (sobrou resquício da era mint/roxo?).                                                                                   | S       |

### F — Funcional

| #   | Item                            | O quê                                                                                                                                                | Esforço |
| --- | ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| F-1 | **Badge de lead na fila**       | quando o vendedor captura lead (F0), o card dele no tablet mostra um selo discreto "lead" — a recepção vê o sistema trabalhando e cobra o follow-up. | M       |
| F-2 | **Som de chamada configurável** | volume/mute persistente (localStorage) + teste de som nas configurações do turno; sound.js já existe.                                                | S       |
| F-3 | **Undo pós-ação (5s)**          | toast "Enviado pra atendimento — Desfazer" nas ações de fila (toque errado em kiosk é rotina).                                                       | M       |
| F-4 | **Guarda ao fechar turno**      | confirmar com contagem clara se há atendimentos abertos (a checagem existe; a UX do aviso pode ser mais explícita).                                  | S       |
| F-5 | **Modo só-leitura (TV)**        | `tablet.html?modo=tv`: mesma fila, zero ações — pra pendurar numa TV/segundo monitor sem risco de toque.                                             | M       |

### I — Ideal (visão de produto)

| #   | Item                     | O quê                                                                                                                                                   |
| --- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| I-1 | **Pareamento por QR**    | tablet exibe QR → vendedor escaneia → abre o vendor app já logado/na fila. Onboarding de loja nova em segundos, e amarra os dois tiers do produto.      |
| I-2 | **Idle com KPIs do dia** | depois de N min sem toque, carrossel discreto (vendas do dia, conversão, próximo da fila gigante) — o tablet vira painel de motivação, não tela parada. |
| I-3 | **Chamada por voz**      | TTS pt-BR "Próximo: Alexandre" junto do som — recepção não precisa olhar.                                                                               |

## 3. Ordem sugerida

1. **Leva K1 (kiosk à prova de bala):** P0-2 + P0-3 + P0-4 (+P0-5 opcional) — S/S/S, fecha de vez a classe de problema "tablet não carrega".
2. **Leva K2 (paridade visual):** A-1 + A-2 + A-4 + A-6.
3. **Leva K3 (operação):** F-2 + F-4 + A-5 + F-3.
4. **Leva K4:** A-3 (delegação) + F-1 (badge de lead) + F-5 (modo TV).
5. **I-1/I-2/I-3** entram no roadmap de produto (I-1 conversa com venda do plano completo).

Cada leva: lint + 102 testes + harness + bump SW + push autorizado.
