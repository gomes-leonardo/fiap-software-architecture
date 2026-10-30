# RFC-003: Estratégia de autenticação

| Campo | Valor |
|---|---|
| Status | Aceita |
| Data | 2026-10-29 |
| Issue | [#57](https://github.com/gomes-leonardo/fiap-software-architecture/issues/57), [#50](https://github.com/gomes-leonardo/fiap-software-architecture/issues/50), [#52](https://github.com/gomes-leonardo/fiap-software-architecture/issues/52) |
| Relacionadas | [RFC-005](RFC-005-api-gateway.md), [ADR-005](../adr/ADR-005-segredos-terraform-ssm.md), [sequência de autenticação](../arquitetura/sequencia-autenticacao.md), [acesso por papel](../api/acesso-por-papel.md) |

## Contexto

Até a Fase 2 havia um único tipo de usuário: o administrador, com e-mail e senha em
`POST /auth/login`, recebendo um JWT assinado pela própria aplicação. O cliente final só consultava
OS pela rota pública `/consult/:clientId?cpf=`.

A Fase 3 pede que o cliente se identifique **pelo CPF**, por uma **função serverless** atrás do API
Gateway, que consulte a base de clientes, verifique se ele existe e está ativo, e devolva um JWT
para consumir rotas protegidas.

Três perguntas a responder: quem emite o token do cliente, quem valida os tokens, e como cliente e
admin ficam separados.

## Alternativas consideradas

| Alternativa | Por que foi descartada |
|---|---|
| **Rota `/auth/cpf` dentro da aplicação NestJS** | A mais simples, mas não é função serverless, que o enunciado exige, e põe a emissão de token no mesmo processo que o consome |
| **Amazon Cognito com fluxo customizado** | Exigiria espelhar a base de clientes num user pool e manter os dois em sincronia. CPF sem senha não é o fluxo padrão: seriam três Lambdas de desafio customizado no lugar de uma |
| **Lambda authorizer no API Gateway da AWS** | Depende do API Gateway da AWS, descartado por custo ([RFC-005](RFC-005-api-gateway.md)) |
| **RS256 com par de chaves e JWKS** | Melhor em tese: só a função teria a chave privada, e o Kong e a aplicação conheceriam só a pública. Fica como evolução. Para o prazo, um segredo HS256 por ambiente, gerado pelo Terraform, é mais simples de distribuir e girar |
| **Validar o token só no gateway** | Uma chamada de dentro do cluster não passa pelo Kong, e o Kong não sabe qual papel cada rota exige |
| **Lambda `auth-cpf` + validação no Kong e na aplicação** | **Escolhida** |

## Decisão

**Emissão.** Dois emissores, cada um com o seu `iss`:

| Papel | Emissor | Credencial | Token |
|---|---|---|---|
| Cliente | Lambda `soat-<env>-auth-cpf`, por Function URL, atrás de `POST /auth/cpf` no Kong | CPF | `{sub: clientId, role: "client", iss: "soat-auth-lambda", exp: +1h}` |
| Admin | aplicação, `POST /auth/login` | e-mail e senha (bcrypt) | `{sub: adminId, email, role: "admin", iss: "soat-app", exp}` |

A função normaliza o CPF e confere os dígitos verificadores, faz uma única consulta
(`SELECT id FROM clients WHERE cpf_cnpj = $1 AND status = 'ATIVO' AND deleted_at IS NULL`) e
assina HS256. Inexistente, inativo e excluído respondem o mesmo `401 {"error":"unauthorized"}`.
CPF malformado responde `400 {"error":"invalid_cpf"}`. O status do cliente é a coluna
`clients.status` (`ATIVO` ou `INATIVO`), criada por migration.

**Segredo.** Um `JWT_SECRET` por ambiente, gerado pelo Terraform do `soat-infra-k8s/gateway` e
entregue ao Secret `soat-jwt` (aplicação), ao SSM `/soat/<env>/jwt/secret` (Lambda) e aos
consumers do Kong.

**Validação em duas camadas.**

1. **Kong**, plugin `jwt` com `key_claim_name: iss` e `claims_to_verify: [exp]`. O consumer
   `soat-clients` tem a chave `soat-auth-lambda`, e `soat-admins` tem `soat-app`. Token sem `iss`
   conhecido, com assinatura inválida ou vencido para no gateway com 401.
2. **Aplicação**, `JwtStrategy`: assinatura, expiração, `sub` em formato UUID, `role` entre os dois
   papéis e `iss` coerente com o `role`. Depois, `RolesGuard` com `@Roles('admin')` ou
   `@Roles('client')` em cada controller. O papel errado responde 403.

**Proteção da função.** A Function URL é pública, mas a função exige o header `X-Soat-Origin` com
um segredo que só ela e o Kong conhecem (`/soat/<env>/auth/origin-secret`). O Kong apaga o header
vindo do cliente, injeta o seu, e aplica rate limit de 10 requisições por minuto por IP.

**O que o cliente acessa.** Só `/me/service-orders` e `/me/vehicles`. O id vem do `sub`, então não
há parâmetro que troque um cliente por outro. A matriz completa está em
[acesso-por-papel.md](../api/acesso-por-papel.md).

## Consequências

- **O segredo compartilhado obriga a separar os papéis pelo conteúdo.** Sem o `RolesGuard` em
  `POST /auth/register`, um token de cliente criaria um admin. A aplicação recusa token de cliente
  que diga ter sido emitido por ela.
- **CPF é um identificador, não uma senha.** Quem souber o CPF de um cliente ativo obtém um token
  dele. O dano fica limitado por desenho: o papel de cliente só lê as próprias OS e os próprios
  veículos, nada escreve, e o rate limit freia enumeração. Risco aceito para esta fase; o próximo
  passo seria um segundo fator, como código por e-mail.
- **Cliente inativado perde o acesso na hora.** O Kong não sabe do status, mas a aplicação consulta
  o cliente a cada chamada em `/me` e responde 403.
- **Tokens de admin anteriores à Fase 3 deixam de valer.** Eles não têm `iss`. Basta novo login.
- **Girar o segredo** é um `terraform apply` do gateway seguido de rollout da aplicação e do Kong.
  Todos os tokens em circulação caem, o que, com validade de 1 hora, é aceitável.
- **Rate limit compartilhado.** Todo tráfego entra pelo mapeamento de porta do Docker e chega ao
  Kong com o mesmo IP, então o limite de 10/min vale para todos os clientes juntos. Numa nuvem com
  balanceador, o IP real do cliente chegaria ao Kong.

## O que muda se revertermos

Sem a Lambda, o cliente volta a não ter login: a rota `/auth/cpf` e o consumer `soat-clients` saem
do Kong, as rotas `/me` ficam inalcançáveis, e a consulta pública por `clientId` e CPF continua
como era na Fase 2. O fluxo do admin não muda.

Se a mudança for para RS256, a função passa a assinar com chave privada no SSM. Os consumers do
Kong recebem a chave pública (`algorithm: RS256`), e a `JwtStrategy` passa a validar com a chave
pública do emissor de cada papel. Rotas, papéis e `RolesGuard` não mudam.
