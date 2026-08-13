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

## 4. Ordem de execução

Ordem de dependência (a mesma publicada como comentário no épico #2). Uma issue por vez — implemento, mostro o diff, você aprova, seguimos pra próxima.

| Ordem | Issue | O quê | Status |
|-------|-------|-------|--------|
| 1 | [#9](https://github.com/gomes-leonardo/fiap-software-architecture/issues/9) | Hardening Dockerfile/docker-compose + `/health` | ⬜ |
| 2 | [#1](https://github.com/gomes-leonardo/fiap-software-architecture/issues/1) | CI: typecheck, cache Docker, proteção de branch | ⬜ |
| 3 | [#4](https://github.com/gomes-leonardo/fiap-software-architecture/issues/4) | Soft delete em todas as entidades | ⬜ |
| 4 | [#3](https://github.com/gomes-leonardo/fiap-software-architecture/issues/3) | Listagem de OS ordenada por prioridade de status | ⬜ |
| 5 | [#5](https://github.com/gomes-leonardo/fiap-software-architecture/issues/5) | Abertura de OS com serviços/peças inline | ⬜ |
| 6 | [#15](https://github.com/gomes-leonardo/fiap-software-architecture/issues/15) | Aprovação de orçamento via canal externo *(novo)* | ⬜ |
| 7 | [#6](https://github.com/gomes-leonardo/fiap-software-architecture/issues/6) | Atualização de status da OS via webhook | ⬜ |
| 8 | [#8](https://github.com/gomes-leonardo/fiap-software-architecture/issues/8) | Terraform: cluster K8s + banco | ⬜ |
| 9 | [#7](https://github.com/gomes-leonardo/fiap-software-architecture/issues/7) | Manifestos Kubernetes (Deploy/Service/ConfigMap/Secret/HPA) | ⬜ |
| 10 | [#14](https://github.com/gomes-leonardo/fiap-software-architecture/issues/14) | Smoke tests integrados ao pipeline | ⬜ |
| 11 | [#10](https://github.com/gomes-leonardo/fiap-software-architecture/issues/10) | CI/CD completo com deploy em Kubernetes | ⬜ |
| 12 | [#13](https://github.com/gomes-leonardo/fiap-software-architecture/issues/13) | SECURITY.md aprofundado | ⬜ |
| 13 | [#12](https://github.com/gomes-leonardo/fiap-software-architecture/issues/12) | Collection de API exportada | ⬜ |
| 14 | [#11](https://github.com/gomes-leonardo/fiap-software-architecture/issues/11) | README Fase 2 (diagrama + instruções K8s/Terraform) | ⬜ |
| 15 | [#16](https://github.com/gomes-leonardo/fiap-software-architecture/issues/16) | Checklist de submissão (vídeo, PDF, demo de escalabilidade) *(novo)* | ⬜ |

Legenda: ⬜ não iniciado · 🔄 em andamento · ✅ concluído (commitado) · ⏸️ bloqueado

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

## 7. Como retomar

Se essa conversa for resumida ou uma nova sessão começar: leia este arquivo primeiro. A seção 4 é a fonte da verdade de progresso — atualizo o status de cada linha (⬜→🔄→✅) conforme trabalhamos.
