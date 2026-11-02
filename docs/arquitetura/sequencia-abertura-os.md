# Sequência: abertura de ordem de serviço

Issue [#56](https://github.com/gomes-leonardo/fiap-software-architecture/issues/56). Abrir OS é
operação da oficina: `POST /service-orders` exige token de admin. O corpo traz o cliente, o
veículo opcional, a descrição e, opcionalmente, `services` e `parts` do catálogo.

```json
{
  "clientId": "<uuid>",
  "vehicleId": "<uuid, opcional>",
  "description": "Revisão completa",
  "services": [{ "referenceId": "<id do serviço>", "quantity": 1 }],
  "parts": [{ "referenceId": "<id da peça>", "quantity": 2 }]
}
```

```mermaid
sequenceDiagram
    autonumber
    actor F as Funcionário (admin)
    participant K as Kong soat-env
    participant A as soat-app (controller e guards)
    participant UC as CreateServiceOrderUseCase
    participant DB as Neon soat-env (pooler)

    F->>K: POST /service-orders, Authorization: Bearer token de admin
    K->>K: plugin jwt: consumer pelo iss (soat-app = soat-admins), assinatura e exp
    alt sem token, assinatura inválida ou expirado
        K-->>F: 401
    else token aceito pelo gateway
        K->>A: POST /service-orders
        A->>A: JwtAuthGuard: assinatura, exp, sub, role e iss coerentes
        alt token recusado
            A-->>F: 401
        else token válido
            A->>A: RolesGuard: @Roles(admin)
            alt token de cliente
                A-->>F: 403
            else admin
                A->>A: ValidationPipe: UUIDs, description, quantity maior ou igual a 1, até 100 itens
                alt corpo malformado
                    A-->>F: 400 com a lista de erros
                else corpo válido
                    A->>UC: execute(dto)
                    UC->>DB: cliente pelo clientId
                    alt cliente inexistente
                        UC-->>F: 400 Client not found
                    else cliente existe
                        opt vehicleId informado
                            UC->>DB: veículo pelo vehicleId
                            alt veículo inexistente
                                UC-->>F: 400 Vehicle not found
                            else veículo de outro cliente
                                UC-->>F: 400 Vehicle does not belong to client
                            end
                        end
                        opt services ou parts informados
                            UC->>DB: preço e descrição no catálogo (Service.basePrice, Part.unitPrice)
                            alt referenceId inexistente
                                UC-->>F: 400, nada foi gravado
                            end
                        end
                        alt sem itens
                            UC->>DB: INSERT service_orders, status RECEBIDA
                            UC-->>F: 201 {status: RECEBIDA, createdBudgetId: null, stockWarnings: []}
                        else com itens
                            UC->>DB: estoque das peças pedidas
                            Note over UC: falta de estoque vira aviso, não erro
                            UC->>DB: INSERT service_orders, status RECEBIDA
                            UC->>DB: INSERT budgets, status PENDENTE, linhas com frozenUnitPrice
                            UC->>UC: RECEBIDA para EM_DIAGNOSTICO para AGUARDANDO_APROVACAO (changedBy system)
                            UC->>DB: UPDATE service_orders: status e status_history
                            UC-->>F: 201 {status: AGUARDANDO_APROVACAO, createdBudgetId, budgetId: null, stockWarnings}
                        end
                    end
                end
            end
        end
    end
```

As respostas da aplicação voltam pelo Kong até o funcionário. O diagrama encurta essa volta para
caber.

## O que o diagrama mostra

- **Duas barreiras de autenticação.** O Kong recusa token forjado ou vencido (401). A aplicação
  confere de novo e decide o papel: token de cliente válido chega na aplicação e recebe 403.
- **Veículo de outro cliente é 400.** A chave estrangeira garante que o veículo existe, mas não
  que ele é do cliente da OS. Essa regra é do caso de uso, e responde 400 pelo
  `DomainExceptionFilter`, que registra a recusa no log como `domain exception`.
- **Tudo é resolvido antes da primeira escrita.** Cliente, veículo e itens do catálogo são
  conferidos primeiro. Um `referenceId` errado não deixa OS órfã.
- **Preço congelado.** Preço e descrição de cada linha vêm do catálogo, nunca da requisição, e
  ficam gravados no orçamento. Uma mudança posterior no catálogo não altera o valor combinado.
- **A ordem das escritas define o estrago de uma falha.** Não há transação envolvendo as três
  escritas. A OS é gravada em `RECEBIDA`, depois o orçamento, e só então a OS avança. Se o
  processo cair no meio, sobra uma OS `RECEBIDA`, estado válido, e nunca uma OS aguardando
  aprovação sem orçamento.
- **`budgetId` continua `null`.** Ele significa "orçamento aprovado" e destrava `EM_EXECUCAO`.
  Quem o preenche é a aprovação, depois de dar baixa no estoque. `createdBudgetId` é o orçamento
  que acabou de nascer.

## Efeitos fora da resposta

| Efeito | Onde aparece |
|---|---|
| Trace da requisição, com um span por consulta ao Postgres | `otel-gateway` e New Relic (Jaeger até a ativação) |
| Linha de log JSON com `trace_id` e `span_id` | stdout do pod, lido pelo `otel-agent` |
| A OS entra na contagem do dia em `soat_service_orders_created_by_day` | `/metrics`, painel de volume diário |
| Um 400 de domínio conta em `soat_integration_errors_total{kind="domain_rejected"}` | painel de erros de integração |

## Fontes

- `src/interfaces/http/service-order/service-order.controller.ts`
- `src/application/service-order/create-service-order.use-case.ts`
- `src/application/budget/budget-line-resolver.ts`
- `test/integration/service-order/inline-items.integration.spec.ts`
- Rotas protegidas no Kong: `soat-infra-k8s/gateway/templates/kong.yml.tftpl`
