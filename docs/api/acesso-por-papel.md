# Acesso por papel

A API reconhece dois papéis, e o papel vem do próprio token. O segredo de assinatura é compartilhado
entre a aplicação e a função de autenticação por CPF, então "quem assinou" não diferencia um token de
outro. Quem diferencia é o conteúdo:

| Papel | Como obtém o token | `role` | `iss` | `sub` |
|---|---|---|---|---|
| Administrador | `POST /auth/login` (e-mail e senha) | `admin` | `soat-app` | id do admin |
| Cliente | `POST /auth/cpf` no gateway (função serverless) | `client` | `soat-auth-lambda` | id do cliente |

A aplicação recusa (401) qualquer token cujo `role` não seja um desses dois, cujo `iss` não
corresponda ao papel, ou cujo `sub` não seja um id válido. Um token de cliente que diz ter sido
emitido pela aplicação é recusado. Tokens de admin emitidos antes da Fase 3 não têm `iss` e são
recusados: basta um novo login.

O gateway (Kong) faz a primeira barreira e recusa token com assinatura inválida ou expirado. A
aplicação repete a validação e decide o papel com o `RolesGuard`. As duas camadas são independentes:
uma requisição que contorne o gateway, de dentro do cluster, continua passando pela segunda.

## Rotas

| Rota | Sem token | Cliente | Admin |
|---|---|---|---|
| `POST /auth/login` | ✅ | ✅ | ✅ |
| `POST /auth/register` | 401 | **403** | ✅ |
| `GET /health` | ✅ | ✅ | ✅ |
| `GET /consult/:clientId?cpf=` | ✅ | ✅ | ✅ |
| `POST /webhooks/*` | segredo do webhook | segredo do webhook | segredo do webhook |
| `GET /me/service-orders` | 401 | ✅ só as próprias | 403 |
| `GET /me/vehicles` | 401 | ✅ só os próprios | 403 |
| `/clients/**` | 401 | 403 | ✅ |
| `/vehicles/**` | 401 | 403 | ✅ |
| `/services/**` | 401 | 403 | ✅ |
| `/parts/**` | 401 | 403 | ✅ |
| `/service-orders/**` | 401 | 403 | ✅ |
| `/budgets/**` | 401 | 403 | ✅ |

**401** significa que não há token, ou que ele é inválido. **403** significa que o token é válido,
mas o papel não tem acesso àquela rota.

## Por que o cliente só tem `/me`

As rotas do cliente não recebem o id do cliente como parâmetro. Ele vem do `sub` do token, então não
existe valor que o cliente possa trocar para ler dados de outra pessoa. Abrir OS, aprovar orçamento
e cadastrar veículo continuam sendo operações da oficina, feitas pelo admin.

Um cliente inativado (`PATCH /clients/:id/status`) ou excluído perde o acesso às rotas `/me` na hora,
mesmo com um token ainda dentro da validade.

## Verificação

`test/integration/auth/roles.integration.spec.ts` sobe a aplicação inteira e confere cada linha da
tabela acima com tokens no formato real.
