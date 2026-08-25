# Plano de execução — Fase 2

> Documento de trabalho, não é entregável. Remover (ou mover pra fora do repo) antes da submissão final.
> Objetivo: dar visibilidade do que será feito, em que ordem, e por quê — para não perder contexto entre sessões de trabalho com o Claude.

- Épico: https://github.com/gomes-leonardo/fiap-software-architecture/issues/2
- Enunciado da Fase 2: colado na conversa que originou este plano (ver seção 8 se precisar re-colar)
- Repo de código (entrega): `gomes-leonardo/soat-tech-challenge-fase1` (este repo)
- Repo de issues/tracking: `gomes-leonardo/fiap-software-architecture`

---

## 1. Gap analysis — o que o Leo já cobriu

As 14 issues originais do Leo (#1, #3–#14, épico #2) cobrem quase todo o enunciado: Clean Architecture (já feito na Fase 1), testes automatizados, as 4 APIs pedidas, Docker, K8s, Terraform, CI/CD e documentação. Checado linha a linha contra o enunciado — ver comentário no épico para o detalhe completo.

## 2. Gaps encontrados (e já criados como issues)

| # | Gap | Por quê é um gap real |
|---|-----|------------------------|
| [#15](https://github.com/gomes-leonardo/fiap-software-architecture/issues/15) | Aprovação de orçamento não tem canal externo | `BudgetController` inteiro está atrás de `JwtAuthGuard`. O enunciado pede um endpoint que receba **notificação externa** de aprovação/recusa do cliente. Confirmado com `assets/GUIA-DO-PROJETO.md`: Fase 1 decidiu conscientemente que só o admin aprova — Fase 2 pede pra evoluir isso. O webhook de status (#6) não serve pra isso porque não aciona a lógica de `ApproveBudgetUseCase` (baixa de estoque). |
| [#16](https://github.com/gomes-leonardo/fiap-software-architecture/issues/16) | Vídeo, PDF e demo de escalabilidade sem dono | Só existiam como bullets dentro de "Critérios de conclusão" do épico, sem issue própria — fácil esquecer perto do prazo. |

## 3. Outras observações (sem issue, só decisão registrada)

- **Repo público:** o template de entrega da Fase 1 (`assets/Documento-de-Entrega.docx`) exige repositório **privado** com acesso ao usuário `soat-architecture`. Hoje está público. Decisão tomada: **manter público por enquanto** — revisitar com o Leo antes da entrega final.
- **Issue #4** (soft delete) expande o requisito literal (só pedia exclusão lógica das OS finalizadas/entregues na listagem) para soft delete em **todas** as entidades. Não é um erro, mas é escopo maior que o pedido — vale alinhar com o Leo se é intencional.
- **Issue #14** (smoke tests) não aparecia na tabela de prioridade original do épico. Reposicionada logo antes de #10 (o pipeline de deploy precisa do gate de smoke test já existindo).
- `assets/` (guia de estudo, roteiro de vídeo da Fase 1, documento de entrega da Fase 1) está no working tree mas **não commitado** — são materiais de referência do curso, não necessariamente pra ir num repo público. Deixados de fora por enquanto.

## 4. Estado: concluído

Todas as 15 linhas do backlog foram implementadas, revisadas e mergeadas na `main`.
As issues técnicas estão fechadas; só o épico [#2](https://github.com/gomes-leonardo/fiap-software-architecture/issues/2) segue aberto.

| Issue | O quê | PR |
|-------|-------|----|
| #9 | Hardening Dockerfile/docker-compose + `/health` | #17 |
| #1 | CI: typecheck, cache Docker, proteção de branch | #18 |
| #3 | Listagem de OS ordenada por prioridade de status | #20 |
| #6 | Atualização de status da OS via webhook | #21 |
| #5 | Abertura de OS com serviços/peças inline | #22 |
| #15 | Aprovação de orçamento via canal externo | #23 |
| #14 | Smoke tests (+ correção do flake do Testcontainers) | #24 |
| #4 | Soft delete em todas as entidades | #25 |
| #8 | Terraform: EKS + RDS e Kind local | #26 |
| #7 | Manifestos Kubernetes | #27 |
| #13 | SECURITY.md aprofundado | #28 |
| #12 | Collection de API exportada | #29 |
| #10 | CI/CD completo com deploy em Kubernetes | #30 |
| #11 | README Fase 2 com diagramas | #31 |
| #16 | Checklist de submissão | #33 |

Fora do backlog: **PR #32**, correção das três falhas de autenticação que a auditoria do #28 encontrou
(`POST /auth/register` sem guard, `JWT_SECRET` com default hardcoded, seed de admin rodando em produção).

O que resta é trabalho humano, não código — está detalhado em `docs/ENTREGA-FASE2.md`:
cadastrar os secrets no GitHub, gravar o vídeo, montar o PDF e submeter no portal.

## 5. Por que essa ordem

- **1–2 (base):** #9 antes de tudo porque K8s precisa do `/health` pra probes; #1 solidifica o CI antes de adicionar CD em cima dele.
- **3–7 (domínio/API):** #4 muda a `Entity` base, então vem antes de #3 (que depende de saber quais status excluir da listagem). #5, #15, #6 são features novas independentes entre si.
- **8–10 (infra):** Terraform provisiona o cluster que os manifestos K8s (#7) e os smoke tests pós-deploy (#14) vão usar.
- **11 (CI/CD):** só faz sentido depois que a imagem, o cluster e os manifestos existem.
- **12–15 (docs/entrega):** por último, porque documentam o estado final do código.

## 6. Decisões já tomadas nesta sessão

- Commit `a652761` — WIP pré-existente (upgrade NestJS 10→11 + endpoint de relatório operacional) commitado separadamente antes de iniciar a Fase 2, depois de validar build + 259 testes unitários passando.
- Repo permanece público (revisar antes da entrega).
- Cadência de trabalho: uma issue por vez, com checkpoint de aprovação entre cada uma — sem lote, sem pular etapas.
- **Correção:** `soat-tech-challenge-fase1` foi renomeado no GitHub para `fiap-software-architecture` (mesmo repo, ID igual, nome antigo faz 301 redirect). Não são dois repos separados como eu tinha entendido antes — só existe um. `origin` local ainda usa o nome antigo (funciona via redirect); trocar pra `git@github.com:gomes-leonardo/fiap-software-architecture.git` quando puder (`git remote set-url origin ...`), o classifier do modo auto bloqueou eu fazer isso diretamente.
- **#9 e #1 implementados em paralelo** em worktrees separadas (`../soat-fase2-issue-9`, `../soat-fase2-issue-1`), cada um numa sessão Claude própria. Revisado (build/lint/typecheck/testes) antes de virar PR. [PR #17](https://github.com/gomes-leonardo/fiap-software-architecture/pull/17) e [PR #18](https://github.com/gomes-leonardo/fiap-software-architecture/pull/18) abertos.
- **CI quebrado em ambos os PRs, causa raiz identificada e corrigida:** `testcontainers` foi pra `12.1.0` (exige `node >= 22.22`) na migração pra NestJS 11 já commitada em `main`, mas todo job do `ci.yml` seguia pinado em Node 20 — toda suíte de integração falhava no import (`webidl.util.markAsUncloneable is not a function`). Não tinha relação com o que #9 ou #1 mudaram. Corrigido num terceiro PR pequeno e isolado, [PR #19](https://github.com/gomes-leonardo/fiap-software-architecture/pull/19) (`node-version: 20 → 24`), já mergeado em `main`.
- **Lição sobre `main` não estar sincronizada:** o commit `a652761` (WIP) e os commits deste plano nunca tinham sido dados `git push` pra `origin/main` — só existiam localmente. Isso fazia os PRs de #9/#1 carregarem esses commits "extras" no diff. Corrigido com `git push origin main` direto (sem PR — são commits já revisados nesta sessão, não trabalho novo da Fase 2).
- **Lição sobre re-sincronizar um PR com a `main` atualizada:** `gh run rerun` reexecuta o mesmo merge-ref antigo, **não** recalcula contra a `main` atual — por isso o primeiro re-run do PR #17 ainda falhou mesmo depois do #19 mergeado. O jeito certo é `gh api -X PUT repos/.../pulls/<N>/update-branch`, que atualiza a branch do PR com a `main` nova e dispara um CI novo de verdade.
- **PR #17 e #18 com CI 100% verde agora** (Lint, Typecheck onde aplicável, Unit, Integration, Build, Security).

## 7. Como retomar

Se essa conversa for resumida ou uma nova sessão começar: leia este arquivo primeiro. A seção 4 é a fonte da verdade de progresso — atualizo o status de cada linha (⬜→🔄→✅) conforme trabalhamos.
