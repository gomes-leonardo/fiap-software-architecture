# RFC-005: API Gateway

| Campo | Valor |
|---|---|
| Status | Aceita |
| Data | 2026-10-29 |
| Issue | [#57](https://github.com/gomes-leonardo/fiap-software-architecture/issues/57), [#51](https://github.com/gomes-leonardo/fiap-software-architecture/issues/51) |
| Relacionadas | [RFC-001](RFC-001-nuvem-e-custo.md), [RFC-003](RFC-003-autenticacao.md), [ADR-004](../adr/ADR-004-ambientes-hml-prd.md) |

## Contexto

A Fase 3 pede um API Gateway como ponto único de entrada: ele roteia para a função de
autenticação e para a aplicação, e valida o token antes de a requisição chegar às rotas
protegidas. O enunciado cita AWS API Gateway e Kong como exemplos.

Na Fase 2 não havia gateway: o Service da aplicação era `ClusterIP` e o acesso era por
`kubectl port-forward`.

Requisitos:

- rotear `/auth/cpf` para a Lambda e o resto para a aplicação no cluster;
- validar JWT HS256 de dois emissores ([RFC-003](RFC-003-autenticacao.md));
- rate limit na autenticação;
- negar por padrão: caminho não declarado não chega na aplicação;
- configuração versionada, aplicada pelo Terraform, uma instância por ambiente;
- custo zero ([RFC-001](RFC-001-nuvem-e-custo.md)).

## Alternativas consideradas

| Alternativa | Por que foi descartada |
|---|---|
| **AWS API Gateway (HTTP API ou REST API)** | Cobra por milhão de requisições numa conta sem free tier de 12 meses. E não alcança a aplicação, que vive em `127.0.0.1` no Mac: seria preciso expor o cluster na internet por um túnel. O authorizer JWT nativo do HTTP API valida por JWKS, o que obrigaria a trocar HS256 por RS256 ou a escrever um Lambda authorizer |
| **Ingress NGINX** | Roteia bem, mas não valida JWT nativamente. A validação ficaria só na aplicação |
| **Gateway API com um controller (Envoy Gateway, Traefik)** | Possível, mas JWT e rate limit dependem de extensões específicas de cada controller, e o enunciado cita o Kong |
| **Sem gateway: Function URL direto e app por NodePort** | Sem ponto único de entrada, sem rate limit na autenticação, e a Function URL ficaria exposta ao abuso |
| **Kong DB-less no cluster** | **Escolhida** |

## Decisão

**Kong 3.9 em modo DB-less**, um por namespace de ambiente, provisionado pelo Terraform do
`soat-infra-k8s/gateway`.

| Ambiente | Namespace | Service | Porta no host |
|---|---|---|---|
| prd | `soat-prd` | NodePort 30080 | `127.0.0.1:18080` |
| hml | `soat-hml` | NodePort 30081 | `127.0.0.1:18081` |

O mapeamento de porta do host para o NodePort é feito pelo próprio cluster Kind
(`extraPortMappings`).

A configuração é um `kong.yml` declarativo, renderizado pelo Terraform a partir de
`gateway/templates/kong.yml.tftpl` e montado de um Secret. Não há rota catch-all: caminho não
listado recebe 404 do próprio Kong.

| Rotas | Destino | Plugins |
|---|---|---|
| `POST /auth/cpf` | Lambda `auth-cpf` (Function URL), ou o substituto local até a ativação | `rate-limiting` 10/min por IP; `request-transformer` apaga e injeta `X-Soat-Origin` |
| `POST /auth/login`, `GET /health`, `GET /consult`, `POST /webhooks` | `soat-app:3000` | nenhum; o webhook tem segredo próprio, conferido na aplicação |
| `GET /api-docs` | `soat-app:3000` | só existe em hml |
| `/clients`, `/vehicles`, `/services`, `/parts`, `/service-orders`, `/budgets`, `/me`, `POST /auth/register` | `soat-app:3000` | `jwt` com `key_claim_name: iss` e `claims_to_verify: [exp]` |

Dois consumers, um por emissor: `soat-admins` (chave `soat-app`) e `soat-clients` (chave
`soat-auth-lambda`), os dois com o `JWT_SECRET` do ambiente. O Kong confere assinatura e validade.
O papel, quem decide é a aplicação.

O CI do `soat-infra-k8s` roda `kong config parse` sobre a configuração renderizada nos dois modos
(`local` e `lambda`) em todo pull request.

## Consequências

- **Defesa em profundidade.** Token forjado ou vencido para no gateway. A aplicação repete a
  validação, então uma chamada de dentro do cluster, que não passa pelo Kong, continua barrada.
- **Configuração inteira em Git.** Adicionar uma rota é mudar o template e aplicar. Uma rota nova
  na aplicação fica inalcançável até ser declarada no Kong, de propósito.
- **Rate limit local e compartilhado.** A política `local` conta por instância do Kong. E como todo
  tráfego entra pelo mapeamento de porta do Docker, todos os clientes chegam com o mesmo IP.
- **Sem TLS na borda.** O gateway responde HTTP em `127.0.0.1`. Numa nuvem, o TLS terminaria num
  balanceador ou no próprio Kong.
- **O segredo JWT está dentro do Secret de configuração do Kong.** Quem lê Secrets do namespace lê
  o segredo. Mesmo nível de exposição do Secret `soat-jwt`.

## O que muda se revertermos

Para AWS API Gateway: cada linha da tabela de rotas vira uma rota do API Gateway, com integração
HTTP para a aplicação (exposta por balanceador e VPC Link) e integração Lambda para `/auth/cpf`. A
validação de token vira um authorizer: JWT com JWKS, o que exige migrar os tokens para RS256, ou um
Lambda authorizer que confira o HS256. O segredo de origem deixa de ser necessário, porque a
integração Lambda não passa por Function URL pública. A aplicação não muda: ela continua validando
o token e o papel.

Para Ingress NGINX: as rotas viram regras de Ingress, e a validação do JWT passa a existir só na
aplicação. O rate limit da autenticação vira anotação do Ingress.
