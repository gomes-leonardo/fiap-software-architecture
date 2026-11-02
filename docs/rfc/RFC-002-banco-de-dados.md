# RFC-002: Banco de dados gerenciado

| Campo | Valor |
|---|---|
| Status | Aceita |
| Data | 2026-10-29 |
| Issue | [#57](https://github.com/gomes-leonardo/fiap-software-architecture/issues/57), [#61](https://github.com/gomes-leonardo/fiap-software-architecture/issues/61) |
| Relacionadas | [RFC-001](RFC-001-nuvem-e-custo.md), [ADR-003](../adr/ADR-003-migrations-em-job.md), [justificativa do PostgreSQL](../database/justificativa-postgresql.md), [modelo ER](../database/modelo-er.md) |

## Contexto

O motor já está decidido desde a Fase 1: **PostgreSQL**. A comparação com MySQL, SQL Server,
MongoDB e DynamoDB está em [justificativa-postgresql.md](../database/justificativa-postgresql.md).
Esta RFC decide **qual Postgres gerenciado** a entrega usa.

Requisitos:

- PostgreSQL 16, a mesma major do `docker-compose.yml` e dos testes;
- gerenciado e provisionado por Terraform;
- alcançável de dois lugares fora de qualquer VPC: o cluster Kind no Mac e a Lambda `auth-cpf`;
- conexão com TLS;
- custo zero, sem cartão de crédito ([RFC-001](RFC-001-nuvem-e-custo.md)).

Na Fase 2 havia um RDS provisionado (`infra/modules/database`) e um Postgres em StatefulSet no
cluster. O ConfigMap apontava para o StatefulSet, e o RDS nunca recebeu tráfego.

## Alternativas consideradas

| Alternativa | Por que foi descartada |
|---|---|
| **Amazon RDS for PostgreSQL** | Cobra desde o primeiro minuto numa conta sem free tier de 12 meses (`db.t3.micro` em torno de US$ 13/mês, mais storage e Secrets Manager). E o RDS sem endereço público exigiria pôr a Lambda numa VPC, que precisa de NAT para chegar ao SSM: mais custo |
| **Aurora Serverless v2** | Escala por ACU, mas tem capacidade mínima cobrada por hora. Mesmo problema do RDS, maior |
| **Postgres no próprio cluster** | Custo zero, mas não é gerenciado: backup, upgrade e disco são do projeto, e recriar o Kind apaga os dados. A Lambda também não o alcança de fora do Mac. Fica como **equivalente local** até a ativação |
| **Supabase** | Postgres gerenciado com plano gratuito, mas é uma plataforma inteira (autenticação, storage, API) da qual só o banco seria usado. O plano gratuito pausa projetos ociosos |
| **Neon** | **Escolhida** |

## Decisão

**Neon PostgreSQL 16**, plano gratuito, provisionado pelo provider Terraform `kislerdm/neon` no
repositório `soat-infra-db`.

- **Um projeto por ambiente:** `soat-hml` e `soat-prd`, na região `aws-sa-east-1`. Cada ambiente
  tem a própria cota do plano gratuito (100 CU-hora por mês, 0,5 GB) e o próprio banco: hml nunca
  enxerga dado de prd.
- **Dois hosts por projeto.** A aplicação e a Lambda usam o host do **pooler** (PgBouncer). As
  migrations usam o host **direto** (`DB_MIGRATION_HOST`), porque o pooler opera em modo transação,
  que não é indicado para DDL.
- **TLS obrigatório.** `DB_SSL=true` liga `ssl.rejectUnauthorized` na aplicação. A URL da Lambda
  leva `sslmode=require`.
- **Contrato único com quem consome.** O Terraform escreve o Secret `soat-db` no namespace do
  ambiente (`DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASS`, `DB_SSL`, `DB_MIGRATION_HOST`) e a
  URL no SSM em `/soat/<env>/db/url`, para a Lambda.
- **Equivalente local.** Com `DB_BACKEND=local`, o mesmo Terraform sobe um Postgres 16 no namespace
  (Service `soat-db-pg`) e escreve o mesmo Secret, com `DB_SSL=false`. Esse é o modo até a conta do
  Neon existir.

## Consequências

- **Suspensão por ociosidade.** O compute do Neon dorme após 5 minutos parado e leva alguns
  segundos para acordar. O `startupProbe` da aplicação tolera até 150 s de boot, e o Job de
  migration tem uma nova tentativa (`backoffLimit: 1`).
- **O pooler recusa parâmetros de sessão no startup.** A aplicação deixou de fixar o fuso pela
  conexão (`options`). As agregações por dia usam `America/Sao_Paulo` explicitamente na consulta.
- **Endpoint público.** O Neon não oferece rede privada no plano gratuito. A proteção é usuário e
  senha fortes, gerados pelo provedor, mais TLS. Numa nuvem paga o banco ficaria sem endereço
  público, como o RDS da referência.
- **Limites do plano.** 0,5 GB de dados e histórico de restore de 6 horas. Suficiente para a
  entrega, não para uma operação real.
- **A aplicação não sabe qual banco está do outro lado.** Trocar Neon por Postgres local, ou por
  RDS, muda o Secret `soat-db` e mais nada no código.

## O que muda se revertermos

Para RDS: trocar `module "neon"` por `soat-infra-db/reference/aws-rds/` no `env/`, escrevendo o
mesmo Secret `soat-db`. A credencial passa a viver no Secrets Manager, e a Lambda precisa de VPC
(com NAT ou VPC endpoint para o SSM) ou de um RDS público. A aplicação não muda. A conta sobe
cerca de US$ 13 a 20 por mês por ambiente, sem contar a rede.

Para o Postgres local: `DB_BACKEND=local` e novo deploy. Os dados ficam presos ao ciclo de vida do
cluster, e a Lambda na AWS deixa de alcançar o banco.
