# Auto Repair Shop OS Management System

Sistema de gerenciamento de ordens de servico para oficina mecanica — SOAT Tech Challenge Fase 1 (POS TECH FIAP).

## Integrantes

| Nome | RM |
| --- | --- |
| Vinicius Taked Souza Brunelli | rm374460 |
| Leonardo Rodrigues Gomes | rm374461 |

## Arquitetura

Monolito NestJS com **Domain-Driven Design** em camadas:

```
src/
  domain/          -> Entidades, Value Objects, regras de negocio (zero imports de framework)
  application/     -> Casos de uso, DTOs, orquestracao
  infrastructure/  -> TypeORM entities, implementacoes de repositorio, auth, config
  interfaces/http/ -> Controllers, guards, filtros, modules
```

### Principios aplicados

- **Inversao de Dependencia (SOLID - D):** O dominio define contratos (classes abstratas como `ClientRepository`). A infraestrutura implementa. O dominio nunca importa TypeORM, NestJS ou qualquer framework.
- **Entidades ricas:** Regras de negocio vivem nas entidades, nao nos controllers ou use cases. Ex: a `ServiceOrder` valida suas proprias transicoes de status.
- **Value Objects imutaveis:** `CpfCnpj`, `Plate`, `BudgetLine` validam-se na criacao e nao mudam depois.
- **Price Freezing:** O orcamento congela precos no momento da criacao, protegendo o cliente de alteracoes posteriores no catalogo.
- **Repository Port pattern:** Classes abstratas no dominio, implementacoes concretas na infraestrutura, bind via modulo NestJS.

### Justificativa do banco de dados

**PostgreSQL 16** foi escolhido por:

- **JSONB nativo:** Usado para historico de status da OS (`status_history`) e linhas do orcamento (`lines`), evitando tabelas auxiliares para dados que sao sempre lidos em conjunto
- **Transacoes ACID:** Essencial para operacoes de estoque (decremento atomico) e consistencia entre orcamento e OS
- **Tipos ricos:** UUID como PK, DECIMAL(10,2) para valores monetarios, constraints de unicidade (CPF/CNPJ, placa, SKU)
- **Maturidade:** Ecossistema estavel com TypeORM 0.3, suporte a locking otimista/pessimista

Alternativas consideradas:

- **MySQL:** Suporte inferior a JSONB e UUIDs nativos
- **MongoDB:** Sem transacoes ACID multi-documento de forma simples, desnecessario para um dominio relacional
- **SQLite:** Insuficiente para concorrencia e producao

## Endpoints da API

Todos os endpoints (exceto `/auth` e `/consult`) requerem autenticacao JWT via header `Authorization: Bearer <token>`.

### Autenticacao

| Metodo | Rota             | Descricao           |
| ------ | ---------------- | ------------------- |
| POST   | `/auth/register` | Registrar admin     |
| POST   | `/auth/login`    | Login (retorna JWT) |

### Clientes

| Metodo | Rota           | Descricao                                |
| ------ | -------------- | ---------------------------------------- |
| POST   | `/clients`     | Cadastrar cliente                        |
| GET    | `/clients`     | Listar clientes (filtro por `?cpfCnpj=`) |
| GET    | `/clients/:id` | Buscar por ID                            |
| PUT    | `/clients/:id` | Atualizar cliente                        |
| DELETE | `/clients/:id` | Remover cliente                          |

### Veiculos

| Metodo | Rota                         | Descricao                  |
| ------ | ---------------------------- | -------------------------- |
| POST   | `/vehicles`                  | Cadastrar veiculo          |
| GET    | `/vehicles`                  | Listar veiculos            |
| GET    | `/vehicles/:id`              | Buscar por ID              |
| GET    | `/vehicles/client/:clientId` | Buscar veiculos do cliente |
| PUT    | `/vehicles/:id`              | Atualizar veiculo          |
| DELETE | `/vehicles/:id`              | Remover veiculo            |

### Pecas (Estoque)

| Metodo | Rota               | Descricao             |
| ------ | ------------------ | --------------------- |
| POST   | `/parts`           | Cadastrar peca        |
| GET    | `/parts`           | Listar pecas          |
| GET    | `/parts/:id`       | Buscar por ID         |
| PUT    | `/parts/:id`       | Atualizar peca        |
| PATCH  | `/parts/:id/stock` | Ajustar estoque (+/-) |
| DELETE | `/parts/:id`       | Remover peca          |

### Servicos

| Metodo | Rota            | Descricao         |
| ------ | --------------- | ----------------- |
| POST   | `/services`     | Cadastrar servico |
| GET    | `/services`     | Listar servicos   |
| GET    | `/services/:id` | Buscar por ID     |
| PUT    | `/services/:id` | Atualizar servico |
| DELETE | `/services/:id` | Remover servico   |

### Ordens de Servico

| Metodo | Rota                                             | Descricao                                                |
| ------ | ------------------------------------------------ | -------------------------------------------------------- |
| POST   | `/service-orders`                                | Criar OS                                                 |
| GET    | `/service-orders`                                | Listar OS ativas (filtro por `?status=` ou `?clientId=`) |
| GET    | `/service-orders/:id`                            | Buscar por ID                                            |
| PATCH  | `/service-orders/:id/status`                     | Alterar status                                           |
| PUT    | `/service-orders/:id`                            | Atualizar descricao                                      |
| DELETE | `/service-orders/:id`                            | Remover OS                                               |
| GET    | `/service-orders/metrics/average-execution-time` | Tempo medio de execucao                                  |
| GET    | `/service-orders/metrics/operational-report`     | Relatorio operacional                                    |

Sem filtro, `GET /service-orders` retorna somente as OS ativas — as terminais (`FINALIZADA`, `ENTREGUE`, `ENCERRADA_SEM_EXECUCAO`) ficam de fora. A ordenacao segue a prioridade de status `EM_EXECUCAO` > `AGUARDANDO_APROVACAO` > `EM_DIAGNOSTICO` > `RECEBIDA` > `PAUSADO` e, dentro do mesmo status, da OS mais antiga para a mais recente. Os filtros `?status=` e `?clientId=` nao aplicam essa regra.

### Orcamentos

| Metodo | Rota                           | Descricao               |
| ------ | ------------------------------ | ----------------------- |
| POST   | `/budgets`                     | Criar orcamento         |
| GET    | `/budgets/:id`                 | Buscar por ID           |
| GET    | `/budgets/service-order/:soId` | Listar orcamentos da OS |
| PATCH  | `/budgets/:id/approve`         | Aprovar orcamento       |
| PATCH  | `/budgets/:id/refuse`          | Recusar orcamento       |
| DELETE | `/budgets/:id`                 | Remover orcamento       |

### Consulta Publica (sem autenticacao)

| Metodo | Rota                      | Descricao                            |
| ------ | ------------------------- | ------------------------------------ |
| GET    | `/consult/:clientId?cpf=` | Consultar OS do cliente (valida CPF) |

> Protegido por **rate limiting** (fixed-window, 20 req/min por `clientId`) para mitigar abuso/forca-bruta no par `clientId` + CPF/CNPJ. Excedido o limite, responde `429 Too Many Requests` com header `Retry-After`.

### Relatorio Operacional

O endpoint `GET /service-orders/metrics/operational-report` retorna:

- Quantidade de OS por status (RECEBIDA, EM_DIAGNOSTICO, etc.)
- Total de ordens de servico
- Pecas com estoque baixo (threshold <= 5 unidades)
- Tempo medio de execucao dos servicos finalizados (em minutos)
- Total de servicos finalizados contabilizados

## Maquina de Status da OS

```
Recebida -> Em diagnostico -> Aguardando aprovacao -> Em execucao -> Finalizada -> Entregue

Excecoes:
  Em execucao -> Aguardando aprovacao  (re-orcamento)
  Em execucao <-> Pausado              (pausa por estoque)
  Aguardando aprovacao -> Encerrada sem execucao (recusa do cliente)
```

**Regras de negocio:**

- A transicao para `EM_EXECUCAO` so e permitida se a OS tiver um orcamento aprovado (`budgetId` setado).
- A aprovacao do orcamento vincula o `budgetId` na OS, habilitando a transicao — mas nao a faz automaticamente. O mecanico decide quando iniciar a execucao.
- O congelamento de preco (`frozenUnitPrice`) garante que o valor acordado com o cliente e preservado mesmo que o catalogo mude depois.
- A baixa de estoque e feita manualmente durante a execucao (`PATCH /parts/:id/stock`), quando a peca e efetivamente utilizada — nao na aprovacao do orcamento.
- Re-orcamento: a partir de `EM_EXECUCAO`, o sistema permite voltar para `AGUARDANDO_APROVACAO` com um novo orcamento versionado.

## Como executar

### Pre-requisitos

- Node.js 20+
- Docker e docker-compose

### Com Docker (recomendado)

```bash
# 1. Criar o .env a partir do template (obrigatorio: o compose falha se
#    DB_PASS ou JWT_SECRET nao estiverem definidas)
cp .env.example .env

# 2. Subir a stack
docker-compose up -d
```

A API estara disponivel em `http://localhost:3000` e o Swagger em `http://localhost:3000/api-docs`.

Health check: `curl http://localhost:3000/health` responde
`{"status":"ok","database":"connected"}` — e `503` se o banco estiver
inacessivel. O mesmo endpoint alimenta o `HEALTHCHECK` da imagem e as probes
de liveness/readiness no Kubernetes.

### Desenvolvimento local

```bash
# 1. Instalar dependencias
npm install

# 2. Configurar variaveis de ambiente
cp .env.example .env

# 3. Subir apenas o PostgreSQL
docker-compose up -d db

# 4. Rodar em modo desenvolvimento
npm run start:dev
```

> O `.env` precisa existir antes de qualquer `docker-compose up`, inclusive do
> `up -d db` isolado: as credenciais deixaram de ser hardcoded no compose.

### Exposicao do banco

O Postgres do compose e publicado apenas em `127.0.0.1:5432` (controlado por
`DB_BIND_ADDRESS` no `.env`). Isso mantem o fluxo de desenvolvimento local
funcionando — `docker-compose up -d db` + `npm run start:dev` na maquina —
sem deixar o banco alcancavel pela rede. O app nao usa essa porta publicada:
ele fala com o servico `db` pela rede interna `soat-network`.

Este compose e voltado a desenvolvimento e demo. Em producao o banco nao sobe
por aqui — ele fica atras dos manifestos Kubernetes/Terraform, sem porta
publicada no host.

### Credenciais de admin (desenvolvimento)

```text
Email: admin@oficina.com
Senha: admin123
```

Para obter um JWT:

```bash
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@oficina.com","password":"admin123"}'
```

## Testes

```bash
# Testes unitarios
npm run test:unit

# Testes de integracao (requer Docker para testcontainers)
npm run test:integration

# Todos os testes
npm test

# Cobertura
npm run test:cov
```

273 testes passando (261 unitarios + 12 integracao), cobrindo entidades de dominio, value objects, use cases, guards e fluxos completos de persistencia. Cobertura acima de 80% nos dominios criticos (`src/domain` + `src/application`).

## Seguranca

Relatorio completo de vulnerabilidades em [SECURITY.md](SECURITY.md).

Medidas implementadas:

- Autenticacao JWT com Passport
- Senhas hasheadas com bcrypt (salt rounds = 10)
- ValidationPipe global com whitelist
- DomainExceptionFilter (sem vazamento de stack traces)
- Dockerfile com usuario nao-root, versao de base fixada e `tini` como PID 1
- `.dockerignore` mantendo `.git`, `.env`, testes e node_modules fora da imagem
- Credenciais fora do versionamento (docker-compose le do `.env`, sem defaults
  para `DB_PASS` e `JWT_SECRET`)
- Postgres publicado apenas em loopback e servicos isolados na `soat-network`
- Variaveis de ambiente via ConfigService
- Rate limiting no endpoint publico de consulta

## Documentacao da API

Swagger UI disponivel em `/api-docs` com a aplicacao rodando. Todas as rotas documentadas com exemplos de request/response.
