# ADR-003: Migrations num Job antes do rollout

| Campo | Valor |
|---|---|
| Status | Aceita |
| Data | 2026-10-30 |
| Substitui | migrations no boot da aplicação em produção (`migrationsRun: isProduction`, Fase 2) |
| Substituída por | — |
| Issue | [#54](https://github.com/gomes-leonardo/fiap-software-architecture/issues/54), [#59](https://github.com/gomes-leonardo/fiap-software-architecture/issues/59) |

## Contexto

Na Fase 2, com `NODE_ENV=production`, o TypeORM rodava as migrations pendentes no boot de cada pod.
Isso tem três problemas que a Fase 3 deixa visíveis:

- **Várias réplicas sobem juntas.** prd começa com 2 pods e um rollout acrescenta mais um. Todas
  disputariam o mesmo DDL no mesmo instante.
- **O pooler do Neon não serve para DDL.** A aplicação conecta pelo PgBouncer em modo transação
  ([RFC-002](../rfc/RFC-002-banco-de-dados.md)), e uma migration precisa do host direto.
- **Uma migration quebrada derrubava o pod novo em loop**, e o erro aparecia como
  `CrashLoopBackOff`, não como falha de migration.

A Fase 3 também traz migrations que mudam o schema de verdade: chaves estrangeiras, coluna
`clients.status` e remoção de coluna duplicada ([modelo ER](../database/modelo-er.md)).

## Decisão

As migrations rodam no **Job `soat-migrate`** (`k8s/migrate/job.yaml`), uma vez por deploy, **antes**
do rollout da aplicação.

- O Job usa a mesma imagem do commit e executa
  `node dist/infrastructure/database/typeorm/run-migrations.js`.
- Conecta em `DB_MIGRATION_HOST` (host direto do Neon; no modo local, o mesmo Service do banco).
- Cada migration roda na sua própria transação (`transaction: 'each'`).
- `backoffLimit: 1` (uma nova tentativa cobre o Neon acordando da suspensão),
  `activeDeadlineSeconds: 300`, `ttlSecondsAfterFinished: 3600`.
- O ConfigMap da aplicação fixa `DB_MIGRATIONS_ON_BOOT: 'false'`, e o boot só roda migrations em
  produção quando essa variável não é `false`.

A ordem no pipeline (`.github/workflows/ci-cd.yml`, job `deploy`):

1. apaga o Job anterior;
2. cria o `soat-migrate` com a imagem do commit;
3. espera `complete` ou `failed`, o que vier primeiro, e imprime os logs;
4. se falhar, o job para aqui. **O Deployment não é tocado e a versão anterior continua no ar**;
5. só então aplica o overlay da aplicação e espera o rollout.

## Alternativas consideradas

| Alternativa | Por que foi descartada |
|---|---|
| **Manter no boot** | Corrida entre réplicas, DDL pelo pooler e falha disfarçada de crash loop |
| **initContainer no Deployment** | Roda uma vez por pod, então a corrida continua. E cada pod novo do HPA rodaria a checagem de novo |
| **Hook do Helm ou do Argo CD** | Nenhum dos dois é usado neste repositório. O deploy é `kubectl apply -k` |
| **Rodar à mão antes do deploy** | Fica fora do pipeline e depende de alguém lembrar |

## Consequências

- **Migrations precisam ser compatíveis com a versão anterior.** Entre o fim do Job e o fim do
  rollout, pods antigos servem com o schema novo. Remover ou renomear coluna exige dois deploys:
  primeiro o código para de usar, depois a migration remove.
- **Rollback do Deployment não desfaz o schema.** O `kubectl rollout undo` automático volta a
  imagem, não o banco. Uma migration que precisar ser desfeita é uma nova migration.
- **Trocar o banco exige um deploy.** Ao ativar o Neon, o Secret `soat-db` muda, mas pods e Job não
  reiniciam sozinhos. A ativação dispara um novo deploy da aplicação para o Job criar o schema no
  banco novo.
- **Desenvolvimento não muda.** No `docker-compose.yml` não há `DB_MIGRATIONS_ON_BOOT`, então o
  app continua migrando no boot, com uma réplica só.

## O que muda se revertermos

Remover `DB_MIGRATIONS_ON_BOOT` do ConfigMap faz o boot voltar a migrar, e o passo de Job sai do
pipeline. A aplicação passaria a precisar do host direto (não do pooler) para as migrations, e a
corrida entre réplicas voltaria.
