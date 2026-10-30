# Por que PostgreSQL

## O que o domínio exige do banco

- **Consistência entre entidades.** OS, cliente, veículo e orçamento se referenciam, e uma OS sem
  cliente ou um orçamento sem OS é dado corrompido. O banco precisa recusar isso sozinho, com chave
  estrangeira, e não depender de cada caso de uso lembrar de checar.
- **Escrita concorrente no estoque.** Aprovar um orçamento dá baixa em peças, e duas aprovações
  simultâneas não podem deixar o estoque negativo
  (`test/integration/part/stock-concurrency.integration.spec.ts`). O banco precisa oferecer
  transação e lock de linha para quando essa garantia sair da aplicação.
- **Dados semiestruturados no mesmo registro.** O histórico de status e as linhas congeladas do
  orçamento são listas que pertencem a um único registro e são lidas junto com ele.
- **Agregações para os dashboards.** Volume diário de OS e tempo médio por status são `GROUP BY`
  e funções de janela sobre as transições.
- **Banco gerenciado sem custo.** É restrição desta entrega (RFC-001).

## Alternativas

| Opção | Atende | Por que foi descartada |
|---|---|---|
| **PostgreSQL** | Tudo acima: FK, transações ACID, `SELECT ... FOR UPDATE`, `jsonb` indexável, funções de janela, índices parciais (usados no soft delete) | **Escolhido** |
| MySQL | FK, transações e JSON | Não tem índice parcial. A unicidade de CPF e placa entre registros não excluídos exigiria coluna gerada ou trigger. O tipo JSON é menos expressivo que `jsonb` para as consultas do histórico |
| SQL Server | FK, transações, índice filtrado | Licença e oferta gerenciada sem camada gratuita perpétua. O ecossistema TypeORM e Testcontainers do projeto é mais maduro em Postgres |
| MongoDB | Documentos aninhados cobrem histórico e linhas do orçamento | As relações cliente → veículo → OS → orçamento são o centro do domínio, e sem FK a consistência entre coleções volta para a aplicação. Transação multi-documento existe, mas é a exceção no modelo, não o padrão |
| DynamoDB | Gerenciado e com camada gratuita | Modelagem por padrão de acesso, sem join nem FK. As agregações do dashboard exigiriam pipeline separado |

## Consistência

Garantido pelo banco, depois das migrations da Fase 3 (detalhe em [modelo-er.md](modelo-er.md)):

- cinco chaves estrangeiras com `ON DELETE RESTRICT`;
- `CHECK` no status do cliente;
- unicidade parcial de CPF/CNPJ, placa, e-mail, SKU e nome de serviço entre registros não excluídos.

Fica com a aplicação: o estoque nunca negativo (regra da entidade `Part`), as transições válidas de status da OS (`ALLOWED_TRANSITIONS` no domínio), a
regra de que o veículo da OS pertence ao cliente da OS, e a de que o orçamento vigente é da própria
OS. São regras de negócio que mudam com o negócio. Colocá-las em trigger as esconderia de quem lê
o código.

## Performance

O volume de uma oficina com várias unidades é de centenas de OS por dia. Cada acesso frequente tem
índice (tabela em [modelo-er.md](modelo-er.md#acessos-e-índices)), e os dois que faltavam, nas
colunas de FK `vehicle_id` e `budget_id`, entraram na migration `AddForeignKeys`. O dashboard lê
agregados com cache de 60 segundos por réplica. Não há consulta pesada no caminho de uma
requisição de usuário.

## Qual Postgres

O banco gerenciado da entrega é o **Neon** (PostgreSQL 16, serverless), provisionado por Terraform
no repositório `soat-infra-db`. Antes da ativação, o mesmo Terraform sobe um Postgres no próprio
cluster como equivalente local. A troca de um para outro muda só o Secret `soat-db` que a aplicação
lê. O RDS foi descartado por custo, e o motivo está na RFC-002.
