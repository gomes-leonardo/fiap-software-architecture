# Sequência: autenticação

Issue [#56](https://github.com/gomes-leonardo/fiap-software-architecture/issues/56). Dois emissores
de token, um segredo por ambiente, duas barreiras de validação.

| Quem | Como pede | Quem valida a credencial | Quem consulta a base | Quem emite o token | `iss` |
|---|---|---|---|---|---|
| Cliente final | `POST /auth/cpf` com o CPF | Lambda `auth-cpf` (dígitos verificadores) | Lambda `auth-cpf`, no Neon | Lambda `auth-cpf` | `soat-auth-lambda` |
| Funcionário da oficina | `POST /auth/login` com e-mail e senha | aplicação (bcrypt) | aplicação | aplicação | `soat-app` |

Os dois tokens são HS256, assinados com o mesmo `JWT_SECRET` do ambiente. O Terraform do
`soat-infra-k8s/gateway` gera esse segredo e o entrega em três lugares: o Secret `soat-jwt` (lido
pela aplicação), o parâmetro SSM `/soat/<env>/jwt/secret` (lido pela Lambda) e os consumers do
Kong. Como o segredo é o mesmo, quem separa cliente de admin é o conteúdo do token, `role` e `iss`.

## Cliente: CPF até o token

```mermaid
sequenceDiagram
    autonumber
    actor C as Cliente
    participant K as Kong soat-env
    participant L as Lambda soat-env-auth-cpf
    participant S as SSM Parameter Store
    participant DB as Neon soat-env (pooler)

    C->>K: POST /auth/cpf {"cpf": "529.982.247-25"}
    alt mais de 10 requisições no minuto, por IP
        K-->>C: 429 Too Many Requests
    else dentro do limite
        K->>K: remove x-soat-origin vindo do cliente e injeta o segredo de origem
        K->>L: POST / (strip_path), header X-Soat-Origin
        L->>S: GetParameter /soat/env/auth/origin-secret (cache em memória)
        alt header ausente ou diferente
            L-->>K: 403 {"error": "forbidden"}
        else chamada veio do Kong
            L->>L: normaliza o CPF: tira a máscara, confere 11 dígitos e os dois verificadores
            alt CPF inválido
                L-->>K: 400 {"error": "invalid_cpf"}
            else CPF válido
                L->>S: GetParameter /soat/env/db/url (só na primeira invocação do container)
                L->>DB: SELECT id FROM clients WHERE cpf_cnpj = $1 AND status = 'ATIVO' AND deleted_at IS NULL
                DB-->>L: id do cliente, ou nenhuma linha
                alt nenhuma linha: inexistente, INATIVO ou excluído
                    L-->>K: 401 {"error": "unauthorized"}
                else cliente ativo
                    L->>S: GetParameter /soat/env/jwt/secret (cache em memória)
                    L->>L: assina HS256 {sub: clientId, role: client, iss: soat-auth-lambda, exp: +1h}
                    L-->>K: 200 {access_token, token_type: Bearer, expires_in: 3600}
                end
            end
        end
        K-->>C: resposta da função
    end
```

Três decisões que o diagrama mostra:

- **Inexistente, inativo e excluído dão a mesma resposta.** Um 401 idêntico nos três casos não
  revela se um CPF é cliente da oficina.
- **A Function URL é pública, mas só o Kong passa.** Sem o `X-Soat-Origin` correto a função
  responde 403. Chamar a URL direto não contorna o rate limit do gateway. O Kong apaga o header
  que vier do cliente antes de pôr o dele.
- **O CPF não vai para o log.** A função registra só um trecho mascarado (`***.982.***-**`) quando
  recusa, e o `clientId` quando concede.

### Até a ativação da Lambda

Com `AUTH_MODE=local` (padrão do `soat-infra-k8s/gateway`), o Kong manda `/auth/cpf` para o
Deployment `soat-auth-local` do próprio namespace, na porta 8080. O código de autenticação é o
mesmo da Lambda. Três diferenças: não há segredo de origem (o serviço só é alcançável de dentro
do cluster), o segredo JWT e o banco vêm dos Secrets `soat-jwt` e `soat-db` em vez do SSM, e o
banco é o Postgres local do namespace.

## Cliente: usando o token

```mermaid
sequenceDiagram
    autonumber
    actor C as Cliente
    participant K as Kong soat-env
    participant A as soat-app
    participant DB as Neon soat-env (pooler)

    C->>K: GET /me/service-orders, Authorization: Bearer token
    K->>K: plugin jwt: escolhe o consumer pelo iss (soat-auth-lambda = soat-clients)
    K->>K: confere a assinatura HS256 com o segredo do consumer e o exp
    alt sem token, iss desconhecido, assinatura inválida ou expirado
        K-->>C: 401
    else token aceito pelo gateway
        K->>A: GET /me/service-orders, mesmo header
        A->>A: JwtStrategy: assinatura, exp, sub é UUID, role existe, iss corresponde ao role
        alt token recusado pela aplicação
            A-->>K: 401
        else token válido
            A->>A: RolesGuard: a rota exige role client
            alt token de admin
                A-->>K: 403
            else token de cliente
                A->>DB: busca o cliente pelo sub do token
                alt cliente inativado ou excluído depois de emitido o token
                    A-->>K: 403 Client is not active
                else cliente ativo
                    A->>DB: ordens de serviço do cliente
                    DB-->>A: lista
                    A-->>K: 200 [ordens de serviço]
                end
            end
        end
        K-->>C: resposta da aplicação
    end
```

As duas validações são independentes de propósito. O Kong barra token forjado ou vencido antes de
gastar a aplicação. A aplicação repete a conferência porque uma chamada de dentro do cluster não
passa pelo Kong, e porque só ela sabe qual papel cada rota exige. O cliente nunca informa de quem
são os dados: o id vem do `sub`.

## Admin: e-mail e senha

```mermaid
sequenceDiagram
    autonumber
    actor F as Funcionário
    participant K as Kong soat-env
    participant A as soat-app
    participant DB as Neon soat-env (pooler)

    F->>K: POST /auth/login {"email", "password"}
    Note over K: rota pública, sem plugin jwt
    K->>A: POST /auth/login
    A->>A: RateLimitGuard por e-mail
    alt tentativas demais para o e-mail
        A-->>K: 429 com Retry-After
    else dentro do limite
        A->>DB: admin pelo e-mail
        A->>A: bcrypt compara a senha com o hash
        alt admin inexistente ou senha errada
            A-->>K: 401 Invalid credentials
        else credencial válida
            A->>A: assina HS256 {sub: adminId, email, role: admin, iss: soat-app}, exp JWT_EXPIRES_IN (1h)
            A-->>K: 200 {access_token}
        end
    end
    K-->>F: resposta da aplicação
```

Nas chamadas seguintes o plugin `jwt` casa o `iss: soat-app` com o consumer `soat-admins`. O resto
é igual ao fluxo do cliente, com o `RolesGuard` exigindo `role: admin`. Um token de cliente numa
rota de admin chega na aplicação e recebe 403. O caso completo está em
[sequencia-abertura-os.md](sequencia-abertura-os.md).

## Fontes

- Função: `soat-auth-lambda/functions/auth-cpf/` (`auth-cpf.ts`, `client-lookup.ts`, `token.ts`)
- Rotas e plugins do Kong: `soat-infra-k8s/gateway/templates/kong.yml.tftpl`
- Aplicação: `src/infrastructure/auth/jwt.strategy.ts`, `src/infrastructure/auth/roles.guard.ts`,
  `src/interfaces/http/auth/auth.controller.ts`, `src/interfaces/http/me/me.controller.ts`
- Matriz de acesso: [`docs/api/acesso-por-papel.md`](../api/acesso-por-papel.md)
