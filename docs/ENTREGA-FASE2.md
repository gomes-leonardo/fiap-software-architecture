# Entrega da Fase 2 — checklist, roteiro do vídeo e demo

Este documento existe para uma coisa só: reduzir o tempo entre "o código está pronto" e "a
entrega está submetida". Ele cobre o que o enunciado pede e que não é código — o vídeo de
até 15 minutos, o PDF do portal do aluno e a demonstração de escalabilidade automática ao
vivo.

O que dá para deixar escrito está escrito. O que só uma pessoa pode fazer — gravar,
publicar, submeter — está isolado numa lista no fim.

> **Todos os comandos das seções 3 e 4 foram executados de verdade**, num cluster Kind em
> macOS arm64, em 2026-08-25. Os números medidos estão registrados. O que não foi
> executado está marcado como tal na seção 6.

---

## 1. Checklist de submissão

### 1.1 Acesso do avaliador ao repositório

Verificado em 2026-08-25:

```
$ gh api repos/gomes-leonardo/fiap-software-architecture/collaborators \
    --jq '.[] | "\(.login): \(.role_name)"'
viniciustakedi: write
gomes-leonardo: admin
soat-architecture: write
```

| Item | Estado | Quem faz |
| --- | --- | --- |
| `soat-architecture` é colaborador | **Feito** — permissão `write` | — |
| Repositório acessível ao avaliador | **Feito** — o repo é **público** (`visibility=public`), então o acesso não depende nem do convite | — |
| URL canônica para o PDF | **Feito** — `https://github.com/gomes-leonardo/fiap-software-architecture` | — |

Duas observações que evitam erro no PDF:

- **O repositório foi renomeado.** A issue #16 fala em `soat-tech-challenge-fase1`; o nome
  atual é `fiap-software-architecture`. O GitHub redireciona o nome antigo (verificado:
  `gh api repos/gomes-leonardo/soat-tech-challenge-fase1` responde com o repo novo), mas
  **no PDF use a URL nova** — um redirect a mais é uma chance a mais de o avaliador
  tropeçar.
- Como o repo é público, não há passo de convite pendente. O item do enunciado
  ("compartilhado com o usuário `soat-architecture`") está satisfeito duas vezes.

### 1.2 Código e infraestrutura

**Tudo mergeado na `main`.** As 15 issues do backlog fecharam; os PRs abaixo estão todos
em `main` e o pipeline roda verde de ponta a ponta.

| Entregável | PR | Estado |
| --- | --- | --- |
| Manifestos K8s + HPA + `apply-all.sh` | #27 | mergeado |
| Terraform (EKS/RDS na AWS, Kind local, `metrics-server`) | #26 | mergeado |
| Pipeline CI/CD com deploy (`ci-cd.yml`, GHCR) | #30 | mergeado |
| Aprovação de orçamento por canal externo (webhook) | #23 | mergeado |
| Soft delete | #25 | mergeado |
| Smoke tests | #24 | mergeado |
| Collection de API / OpenAPI | #29 | mergeado |
| Relatório de segurança | #28 | mergeado |
| README com diagrama de arquitetura | #31 | mergeado |
| Endurecimento de autenticação | #32 | mergeado |

**O único bloqueio de código restante:**

- **[PR #45](https://github.com/gomes-leonardo/fiap-software-architecture/pull/45) precisa
  ser mergeado antes de gravar.** Sem ele **não existe administrador no cluster** e o bloco 4
  do vídeo morre no primeiro comando, com `POST /auth/login` respondendo 401. Detalhe na
  seção 2.4.

### 1.3 Vídeo

| Item | Estado | Quem faz |
| --- | --- | --- |
| Roteiro com tempos e comandos | **Feito** — seção 3 | — |
| Sequência de comandos da demo, validada | **Feito** — seção 4 | — |
| Secrets do CI cadastrados (para mostrar o CD rodando) | **Pendente** — comandos em `.github/DEPLOYMENT.md`, reproduzidos em 2.3 | **você** |
| Ambiente preparado (cluster + imagem carregada) | **Pendente** — seção 4, passos 1 a 4 | **você** |
| Gravar | **Pendente** | **você** |
| Publicar no YouTube/Vimeo (público ou não listado) | **Pendente** | **você** |
| Substituir o placeholder do link no README | **Pendente** — depende de #11 | **você** |

### 1.4 PDF do portal

| Item | Estado | Quem faz |
| --- | --- | --- |
| Estrutura das páginas | **Feito** — seção 5 | — |
| Link do repositório | **Feito** — URL em 1.1 | — |
| Diagrama de arquitetura | **Depende de #11** | agente da #11 |
| Link do vídeo | **Depende da gravação** | **você** |
| Montar o PDF | **Pendente** | **você** |
| Submeter no portal antes do prazo | **Pendente** | **você** |

---

## 2. Pré-requisitos antes de apertar o REC

### 2.1 Ferramentas

Confirmado nesta máquina: `docker` e `kubectl` já existiam; `kind` e um Terraform **não**.

```bash
brew install kind
brew install opentofu     # ou: brew install hashicorp/tap/terraform
```

`infra/README.md` diz explicitamente que OpenTofu serve no lugar do Terraform. Onde este
documento escreve `tofu`, `terraform` funciona igual.

Versões usadas na validação: `kind v0.32.0`, `OpenTofu v1.12.6`, node image
`kindest/node:v1.31.0`, macOS arm64.

### 2.2 Onde gravar: local, não AWS

Grave no **Kind** (`infra/envs/local`). Motivos, todos de `infra/README.md`:

- O caminho AWS custa **~US$ 185–195/mês** em `dev` e o **EKS cobra por hora ligada mesmo
  com o cluster vazio** — o control plane sozinho é ~40% da conta.
- `terraform apply` na AWS leva **15–20 min** (EKS + RDS). Não cabe num vídeo de 15.
- O Kind custa zero e demonstra exatamente a mesma coisa, HPA incluso.

**Se ainda assim gravar na AWS, rode `terraform destroy` imediatamente depois.** Não deixe
para o dia seguinte.

### 2.3 Secrets do CI/CD — obrigatório para o bloco 3

O job `deploy` **não falha** quando os secrets faltam: o preflight escreve um aviso no
summary e pula os passos seguintes (`.github/DEPLOYMENT.md`). Ou seja, **sem cadastrar os
secrets você grava um pipeline verde que não deployou nada** — e é justamente o deploy que
o enunciado pede para mostrar.

**Estado hoje:** `DB_PASS`, `JWT_SECRET` e `WEBHOOK_SECRET` **já estão cadastrados**.
Falta apenas o `KUBECONFIG_BASE64` — que é justamente o único que o preflight testa
(`ci-cd.yml:312`), então o deploy continua pulando. O pacote no GHCR **já está público**
(verificado: `docker pull` anônimo retorna o manifest).

Comandos, de `.github/DEPLOYMENT.md`:

```bash
# macOS (o base64 do BSD não tem -w):
kubectl config view --minify --flatten --context=kind-soat-local > /tmp/kubeconfig-ci
gh secret set KUBECONFIG_BASE64 --repo gomes-leonardo/fiap-software-architecture \
  --body "$(base64 -i /tmp/kubeconfig-ci | tr -d '\n')"
rm /tmp/kubeconfig-ci

gh secret set DB_PASS --repo gomes-leonardo/fiap-software-architecture \
  --body "$(openssl rand -base64 32)"
gh secret set JWT_SECRET --repo gomes-leonardo/fiap-software-architecture \
  --body "$(openssl rand -base64 48)"
gh secret set WEBHOOK_SECRET --repo gomes-leonardo/fiap-software-architecture \
  --body "$(openssl rand -base64 48)"
```

Três avisos que vêm do próprio `.github/DEPLOYMENT.md` e custam caro se ignorados:

1. **`DB_PASS` antes do primeiro deploy.** O Postgres só lê `POSTGRES_PASSWORD` no
   `initdb`. Trocar depois exige `ALTER USER` ou apagar o PVC.
2. **Um kubeconfig de Kind aponta para `127.0.0.1`.** O runner do GitHub não alcança o
   cluster que roda no seu laptop. Para o deploy do CD funcionar de verdade, o
   `KUBECONFIG_BASE64` precisa ser de um cluster alcançável pela internet — na prática, o
   EKS da #26. **Se você não vai subir o EKS, aceite que o bloco 3 mostra o CI completo
   (lint, typecheck, testes, build, scan, publish no GHCR) e o job de deploy pulando com
   aviso — e diga isso em voz alta no vídeo, em vez de deixar o avaliador descobrir.**
3. **O pacote no GHCR nasce privado — já resolvido.** Foi tornado público; um `docker
   pull` anônimo de `ghcr.io/gomes-leonardo/fiap-software-architecture` funciona. Sem isso,
   um pod reagendado depois falharia com `ImagePullBackOff`.
4. **A proteção da `main` existe mas está desligada.** O ruleset `main` está com
   `enforcement: disabled` e `gh api .../rules/branches/main` retorna `[]` — nenhuma regra
   incide hoje. Não bloqueia a gravação, mas é item de entrega (issue #37).

### 2.4 A imagem precisa conter o PR #45

O canal externo do PR #23 **já está na `main`** e funciona — verificado em 31/08 num
cluster Kind, com a imagem buildada da `main` em `909f055`:

```
$ curl -X POST http://localhost:3000/webhooks/budgets/<id>/approve \
    -H "Authorization: Bearer $WEBHOOK_SECRET"
{"id":"6da353b7-...","status":"APROVADO","total":221.8}
HTTP 200
```

O bloqueio agora é outro, e é mais grave porque derruba o bloco 4 já no primeiro comando.

**O ConfigMap define `NODE_ENV=production`. O `AdminSeeder` do PR #32 não cria
administrador nenhum em produção sem `ADMIN_BOOTSTRAP_EMAIL` e `ADMIN_BOOTSTRAP_PASSWORD`
— e essas variáveis não estavam em manifesto algum.** Como o mesmo PR passou a exigir token
em `POST /auth/register`, também não havia como criar o primeiro admin pela API.

Reproduzido no cluster:

```
$ curl -X POST $API/auth/login -d '{"email":"admin@oficina.com","password":"admin123"}'
HTTP 401 {"message":"Invalid credentials","error":"Unauthorized","statusCode":401}

$ kubectl logs -n soat -l app.kubernetes.io/name=soat-app
WARN [AdminSeeder] Nenhum administrador foi semeado. Defina ADMIN_BOOTSTRAP_EMAIL
     e ADMIN_BOOTSTRAP_PASSWORD para criar o primeiro administrador.
```

Os PRs #27 e #32 estavam corretos isoladamente — o defeito só existe na combinação, e
nenhum CI o pegaria: os testes de integração e smoke usam Testcontainers com
`NODE_ENV=test`, onde o seed de desenvolvimento roda normalmente.

**Builde a imagem da gravação depois de mergear o
[PR #45](https://github.com/gomes-leonardo/fiap-software-architecture/pull/45).** Com ele,
no mesmo cluster: `LOG [AdminSeeder] Administrador inicial criado: admin@oficina.com` e o
login devolve 200.

---

## 3. Roteiro do vídeo — 14:30 de conteúdo, teto de 15:00

Ordem exigida pela issue #16. Os tempos somam **14 min 30 s**, deixando 30 s de folga.
Se algum bloco estourar, corte do bloco 1 (é o único que não é demonstração ao vivo).

| # | Bloco | Duração | Acumulado |
| --- | --- | --- | --- |
| 1 | Estrutura, arquitetura e diagrama | 2:30 | 2:30 |
| 2 | Deploy da aplicação | 3:00 | 5:30 |
| 3 | Pipeline CI/CD | 2:30 | 8:00 |
| 4 | Consumo das APIs | 3:30 | 11:30 |
| 5 | Escalabilidade automática | 3:00 | **14:30** |

**Antes de gravar**, deixe pronto (são os passos 1 a 4 da seção 4): cluster Kind de pé com
`metrics-server` respondendo, imagem `soat-tech-challenge:latest` buildada e carregada no
cluster, e o namespace `soat` **vazio** (nada aplicado ainda). Deixe também dois terminais
abertos lado a lado — você vai precisar deles no bloco 5.

---

### Bloco 1 — Estrutura, arquitetura e diagrama · 2:30

Subdividido em 0:40 + 0:50 + 1:00. Corresponde às **lâminas 2 a 5** do deck.

**Na tela:** a raiz do repositório no GitHub, depois o README no diagrama de arquitetura
(entregue pela #31), e por fim `infra/README.md` nos diagramas dos dois ambientes.

**Comandos:** nenhum. É navegação.

**O que dizer, em uma frase por parada:**

| Parada | Frase |
| --- | --- |
| Raiz do repositório (0:00) | "A arquitetura da aplicação não mudou nesta fase. O que a Fase 2 acrescentou está quase todo fora do `src`: infraestrutura, pipeline e documentação." **Não diga "nenhum endpoint mudou"** — a API foi de 39 para 43 rotas e quatro contratos existentes mudaram, incluindo `POST /auth/register`, que passou a exigir token. |
| Diagrama do README (0:40) | "A aplicação é um NestJS em Clean Architecture, empacotado em imagem Docker e rodando em Kubernetes; o banco é PostgreSQL." |
| `k8s/` | "O namespace `soat` tem Deployment do app com 2 réplicas, StatefulSet do Postgres com volume persistente, Services ClusterIP e um HPA de 2 a 10 pods com alvo de 70% de CPU." |
| Diagrama AWS de `infra/README.md` | "Na AWS o Terraform provisiona VPC com subnets públicas e privadas, EKS com managed node group nas privadas e RDS PostgreSQL sem endereço público — a única regra de entrada do banco é a porta 5432 vinda do security group dos nodes." |
| Diagrama local de `infra/README.md` | "Para esta demonstração o mesmo Terraform provisiona um cluster Kind no Docker, com `metrics-server` instalado — sem ele o HPA não tem métrica e nunca escala." |

---

### Bloco 2 — Deploy da aplicação · 3:00

**Na tela:** terminal.

**Por que o cluster já está de pé:** criar o cluster Kind leva ~90 s e o `terraform apply`
tem uma pegadinha na primeira execução (seção 6). Mostrar o resultado do `apply` é honesto
e cabe no tempo; esperar por ele, não.

| Tempo | Comando | O que dizer |
| --- | --- | --- |
| 0:00 | `cd infra/envs/local && tofu output` | "O cluster foi provisionado por este Terraform: ele cria o Kind, o namespace `soat` e o `metrics-server`." |
| 0:30 | `kubectl get nodes` | "Três nodes: um control-plane e dois workers." |
| 0:45 | `kubectl top nodes` | "O `kubectl top` responde com números, então o `metrics-server` está de pé — é o pré-requisito do autoscaling que a gente vai ver no fim." |
| 1:00 | `./k8s/apply-all.sh` | "Este script aplica os manifestos na ordem de dependência: namespace, Secret, ConfigMap, banco, **espera o Postgres aceitar conexão**, sobe o app, espera o rollout e só então cria o HPA." |
| 2:15 | *(a saída final do script já mostra `kubectl get all -n soat`)* | "Dois pods do app, o `soat-db-0` com o PVC ligado, os Services e o HPA. O Service é ClusterIP de propósito: `LoadBalancer` fica `<pending>` para sempre em Kind, então o acesso é por `port-forward`." |
| 2:30 | `kubectl port-forward -n soat svc/soat-app 3000:3000` *(segundo terminal)* e `curl -s localhost:3000/health` | "A aplicação responde `status ok` e `database connected` — o `/health` faz um `SELECT 1`, então isso prova app e banco de uma vez." |

**Medido:** o `apply-all.sh` levou ~50 s do zero até o `kubectl get all` (Postgres `Ready`
em ~20 s, rollout do app em ~30 s). O bloco tem folga.

---

### Bloco 3 — Pipeline CI/CD · 2:30

**Na tela:** aba Actions do GitHub, num run já concluído da `main`.

**Por que um run já concluído:** o pipeline completo leva vários minutos (o job
`test-integration` sobe Postgres, o `test-smoke` usa Testcontainers). Rodar ao vivo não
cabe nos 15 minutos. Além disso, o `ci-cd.yml` **não tem `workflow_dispatch`** — ele
dispara só em `push` na `main` e em `pull_request` para a `main`, então não existe botão
"Run workflow" para apertar.

| Tempo | O que mostrar | O que dizer |
| --- | --- | --- |
| 0:00 | Lista de runs do workflow `CI/CD` | "Todo push na `main` e todo PR dispara este pipeline." |
| 0:20 | O grafo de jobs de um run verde da `main` | "Lint, typecheck, testes unitários, de integração e smoke rodam em paralelo; depois build da imagem, scan de segurança com Trivy, publicação no GHCR e deploy no cluster." |
| 1:00 | O job `Publish Image` | "A imagem vai para o GHCR com duas tags: `latest` e uma tag por SHA do commit. É a tag por SHA que o deploy referencia — com `imagePullPolicy: IfNotPresent`, uma tag fixa faria o kubelet reusar a imagem em cache e nunca puxar a versão nova." |
| 1:40 | O job `Deploy to Kubernetes`, passo a passo | "O deploy repete a ordem do `apply-all.sh`, substitui a imagem no manifesto **antes** do apply — para existir uma revisão só por deploy e o rollback apontar para o último deploy que funcionou — e termina com um smoke test no `/health`. Se qualquer passo falhar, ele imprime o diagnóstico e roda `kubectl rollout undo`." |
| 2:15 | O `Summary` do run | "Sem `KUBECONFIG_BASE64` configurado, o deploy pula com aviso em vez de pintar a `main` de vermelho por configuração ausente." *(diga isso **apenas** se o seu deploy estiver pulando — ver 2.3)* |

---

### Bloco 4 — Consumo das APIs · 3:30

**Na tela:** terminal com o `port-forward` do bloco 2 ainda ativo. Opcionalmente o Swagger
em `http://localhost:3000/api-docs` numa segunda janela.

**Deixe as variáveis já exportadas antes de gravar** (`TOKEN`, `CLIENT_ID`, `VEHICLE_ID`,
`SERVICE_ID`, `PART_ID`) — os `curl` de cadastro do catálogo são burocracia e comem o
tempo do que interessa. Os comandos completos estão no passo 6 da seção 4.

| Tempo | Comando | O que dizer |
| --- | --- | --- |
| 0:00 | `curl -s -X POST $API/auth/login -H 'Content-Type: application/json' -d '{"email":"admin@oficina.com","password":"admin123"}'` | "Autenticação JWT; o token vale para todos os endpoints internos." |
| 0:30 | `POST /service-orders` com `services` e `parts` inline *(comando completo em 4.6)* | "**Abertura de OS**: informando serviços e peças do catálogo, a ordem nasce já com um orçamento `PENDENTE` e em `AGUARDANDO_APROVACAO`. O preço vem do catálogo e é congelado, nunca da requisição." |
| 1:10 | destacar `createdBudgetId` e `budgetId: null` na resposta | "Repare: `createdBudgetId` traz o orçamento que nasceu, mas `budgetId` continua `null`. `budgetId` só é preenchido na aprovação — é ele que destranca a transição para `EM_EXECUCAO`, então preenchê-lo aqui deixaria qualquer um pular a aprovação e o estoque." |
| 1:40 | `POST /webhooks/budgets/$BUDGET_ID/approve` com `Authorization: Bearer $WEBHOOK_SECRET` | "**Aprovação de orçamento pelo canal externo** — o requisito novo da Fase 2. É por aqui que a decisão do cliente final chega, sem login: em vez de JWT, um segredo pré-compartilhado comparado em tempo constante. Cai no mesmo caso de uso do endpoint interno, então dá baixa no estoque e vincula o orçamento à OS de verdade." |
| 2:20 | `PATCH /service-orders/$OS_ID/status` para `EM_EXECUCAO` | "Com o orçamento aprovado, a OS pode entrar em execução. Sem ele, a máquina de status recusa." |
| 2:50 | `GET /consult/$CLIENT_ID?cpf=529.982.247-25` | "**Consulta de status**, endpoint público: o cliente acompanha a OS informando o próprio CPF, sem login. CPF divergente responde 403." |
| 3:15 | `GET /service-orders/$OS_ID` autenticado | "A visão interna traz o histórico completo de status, com quem mudou e quando." |

---

### Bloco 5 — Escalabilidade automática · 3:00

**Na tela:** dois terminais lado a lado. Esquerda: o watch do HPA. Direita: o gerador de
carga.

| Tempo | Terminal | Comando | O que dizer |
| --- | --- | --- | --- |
| 0:00 | esquerda | `kubectl get hpa soat-app -n soat -w` | "O HPA vai de 2 a 10 pods com alvo de 70% da CPU requisitada. Agora está em 2 réplicas e a utilização perto de zero." |
| 0:30 | — | *(mostrar `k8s/app-hpa.yaml` enquanto as métricas sobem — há ~30 s de atraso até o HPA enxergar a carga)* | "A subida é agressiva de propósito — sem janela de estabilização, podendo dobrar a cada 30 segundos — e a descida é conservadora, com os 5 minutos padrão, para não haver flapping." |
| 0:15 | direita | `kubectl run load-generator -n soat --rm -it --restart=Never --image=williamyeh/hey -- -z 5m -c 200 http://soat-app:3000/health` | "A carga é gerada **de dentro do cluster**, batendo direto no Service — o `port-forward` é single-threaded e seria ele o gargalo, não a aplicação." **Dispare cedo:** medido, o HPA leva ~60 s para reagir. |
| 1:00 | esquerda | *(o watch começa a mexer)* | "A utilização passa de 70% e o HPA reage." |
| 1:40 | esquerda | *(pods subindo)* | "De 2 para 4 réplicas, e depois para 6 conforme a carga se mantém." |
| 2:00 | terceiro terminal (ou pare o watch) | `kubectl get pods -n soat -l app.kubernetes.io/name=soat-app` | "Os pods novos já estão `Running` e recebendo tráfego." |
| 2:30 | — | `kubectl top pods -n soat` | "A carga distribuída entre as réplicas, com a utilização convergindo de volta para o alvo de 70% — que é exatamente o que o autoscaler deveria fazer." |

**Números medidos nesta validação** (Kind, macOS arm64, 3 nodes num único Docker):

| Momento | `TARGETS` | `REPLICAS` |
| --- | --- | --- |
| ocioso | `2%/70%` | 2 |
| 30 s de carga (`-c 200`) | `22%/70%` | 2 |
| 40 s | `147%/70%` | 2 |
| 60 s | `169%/70%` | **4** |
| 90 s | `90%/70%` | **6** |
| 120 s em diante | estabiliza em `~75%/70%` | 6 |

**O atraso é o dado que mais importa para gravar:** entre disparar a carga e o HPA mudar a
contagem de réplicas passaram-se **~60 segundos**, porque o `metrics-server` leva ~30 s só
para registrar o consumo. Uma narração que promete a subida aos 30 s fala de um número que
ainda não está na tela.

E, no cluster k3s onde os manifestos foram validados originalmente (PR #27): pico de
`252%/70%` e **2 → 4 → 8 → 10 pods em ~3 minutos**.

**Seja honesto sobre o teto na hora de gravar.** Quantos pods você chega depende da CPU
sobrando da máquina: o gerador de carga disputa os mesmos núcleos que a aplicação. Num
laptop, 2 → 4 ou 2 → 5 é o resultado realista, e **isso já demonstra o requisito**. Se
quiser chegar mais alto, grave numa máquina com mais núcleos ou aumente `-c`. Não prometa
"vai até 10" antes de ver acontecer.

**Não espere a descida no vídeo.** A janela de estabilização de `scaleDown` é de 5 minutos:
depois que a carga para, os pods só voltam a 2 alguns minutos depois. Mencione o
comportamento e siga.

---

## 4. Sequência de comandos da demo

Do zero até o HPA escalando. Copiável de cima a baixo. Rode os passos 1 a 4 **antes** de
gravar; os passos 5 em diante são os que aparecem no vídeo.

Origem de cada bloco: `infra/README.md` (PR #26), `k8s/README.md` e `k8s/apply-all.sh`
(PR #27), `.github/DEPLOYMENT.md` (PR #30).

### 4.1 Ferramentas (uma vez)

```bash
brew install kind opentofu
docker info >/dev/null && echo "docker ok"
```

### 4.2 Cluster Kind via Terraform — `infra/README.md`

```bash
cd infra/envs/local
tofu init

# Se ~/.kube/config ainda NAO existe nesta maquina, o primeiro apply falha no
# kubernetes_namespace (ver secao 6). O caminho garantido, ja documentado no
# infra/README.md, e aplicar o cluster primeiro:
tofu apply -auto-approve -target=kind_cluster.this
tofu apply -auto-approve
```

Saída esperada do segundo apply: `access_instructions`, `load_image_command`,
`app_port_forward_command`, `kubectl_context = "kind-soat-local"`.

### 4.3 Conferir o cluster e o `metrics-server`

```bash
kubectl config use-context kind-soat-local
kubectl get nodes          # control-plane + 2 workers, todos Ready
kubectl top nodes          # PRECISA devolver numeros; se falhar, o HPA nao vai escalar
```

### 4.4 Imagem da aplicação — `infra/README.md` / `k8s/README.md`

```bash
cd ../../..                # raiz do repositorio
docker build -t soat-tech-challenge:latest .
kind load docker-image soat-tech-challenge:latest --name soat-local

# Confere que a imagem chegou no containerd do node (nao so no Docker da maquina):
docker exec soat-local-worker crictl images | grep soat
```

### 4.5 Aplicar a stack — `k8s/apply-all.sh`

```bash
./k8s/apply-all.sh
```

Levou ~50 s na validação. Ao fim, `kubectl get all -n soat` mostra 2 pods do app,
`soat-db-0`, os três Services, o Deployment, o StatefulSet e o HPA. O HPA aparece em
`cpu: <unknown>/70%` — normal, o `metrics-server` leva ~30–60 s para publicar a primeira
amostra.

Acesso à API, em um terminal separado que fica aberto o resto da demo:

```bash
kubectl port-forward -n soat svc/soat-app 3000:3000
```

```bash
curl -s localhost:3000/health
# {"status":"ok","database":"connected"}
```

### 4.6 Fluxo de APIs

Todos os `curl` abaixo foram executados contra o cluster e devolveram o que está descrito.

```bash
API=http://localhost:3000

# A senha do administrador vem do Secret — o AdminSeeder a le no boot (PR #45).
ADMIN_PASS=$(kubectl get secret soat-app-secret -n soat \
  -o jsonpath='{.data.ADMIN_BOOTSTRAP_PASSWORD}' | base64 -d)

TOKEN=$(curl -s -X POST $API/auth/login \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"admin@oficina.com\",\"password\":\"$ADMIN_PASS\"}" | jq -r .access_token)

AUTH="Authorization: Bearer $TOKEN"
JSON='Content-Type: application/json'

CLIENT_ID=$(curl -s -X POST $API/clients -H "$AUTH" -H "$JSON" -d '{
  "name":"Joao da Silva","cpfCnpj":"529.982.247-25",
  "email":"joao@email.com","phone":"(11) 99999-0000"}' | jq -r .id)

VEHICLE_ID=$(curl -s -X POST $API/vehicles -H "$AUTH" -H "$JSON" -d "{
  \"plate\":\"ABC-1234\",\"brand\":\"Toyota\",\"model\":\"Corolla\",
  \"year\":2022,\"ownerClientId\":\"$CLIENT_ID\"}" | jq -r .id)

SERVICE_ID=$(curl -s -X POST $API/services -H "$AUTH" -H "$JSON" -d '{
  "name":"Troca de oleo","basePrice":150.0,"estimatedMinutes":30}' | jq -r .id)

PART_ID=$(curl -s -X POST $API/parts -H "$AUTH" -H "$JSON" -d '{
  "name":"Filtro de oleo","sku":"FLT-OL-001","unitPrice":35.9,
  "stockQuantity":100}' | jq -r .id)
```

**Abertura de OS com itens inline** (é o que aparece no vídeo):

```bash
OS=$(curl -s -X POST $API/service-orders -H "$AUTH" -H "$JSON" -d "{
  \"clientId\":\"$CLIENT_ID\",
  \"vehicleId\":\"$VEHICLE_ID\",
  \"description\":\"Revisao completa\",
  \"services\":[{\"referenceId\":\"$SERVICE_ID\",\"quantity\":1}],
  \"parts\":[{\"referenceId\":\"$PART_ID\",\"quantity\":2}]}")

echo "$OS" | jq '{id,status,budgetId,createdBudgetId,stockWarnings}'
# {
#   "id": "6dc7986c-...",
#   "status": "AGUARDANDO_APROVACAO",
#   "budgetId": null,
#   "createdBudgetId": "3fd2277a-...",
#   "stockWarnings": []
# }

OS_ID=$(echo "$OS" | jq -r .id)
BUDGET_ID=$(echo "$OS" | jq -r .createdBudgetId)
```

**Aprovação pelo canal externo** — requisito novo da Fase 2, PR #23:

```bash
WEBHOOK_SECRET=$(kubectl get secret soat-app-secret -n soat \
  -o jsonpath='{.data.WEBHOOK_SECRET}' | base64 -d)

curl -s -X POST "$API/webhooks/budgets/$BUDGET_ID/approve" \
  -H "Authorization: Bearer $WEBHOOK_SECRET" | jq '{id,status,total}'
```

> **Executado com sucesso em 31/08**, contra a `main` em `909f055`: responde `200` com
> `{"id":"6da353b7-...","status":"APROVADO","total":221.8}`. Com token inválido, `401`.
> A ressalva anterior sobre `404` era do tempo em que o PR #23 estava aberto — não vale mais.

No cluster local com o `app-secret.yaml` versionado, esse segredo é
`change-me-webhook-secret` — placeholder público, documentado como tal no próprio
manifesto. Ler do Secret em vez de digitar é o hábito certo e funciona em qualquer
ambiente.

**Estoque e vínculo, para provar que o caso de uso completo rodou** — a aprovação dá baixa
nas peças e amarra o orçamento à OS, não só troca um status:

```bash
curl -s $API/parts/$PART_ID -H "$AUTH" | jq '{name,stockQuantity}'   # espera 98
curl -s $API/service-orders/$OS_ID -H "$AUTH" | jq '{status,budgetId}'
```

O `GET /service-orders/:id` foi executado e devolveu `budgetId` preenchido depois da
aprovação. O `GET /parts/:id` existe (`part.controller.ts`) mas **não foi chamado nesta
validação** — a baixa de estoque está coberta pelo teste de integração do PR #23, que
verifica 10 → 7 no repositório.

**Execução e consulta de status:**

```bash
curl -s -X PATCH "$API/service-orders/$OS_ID/status" -H "$AUTH" -H "$JSON" \
  -d '{"status":"EM_EXECUCAO","changedBy":"admin"}' | jq '{id,status,budgetId}'
# {"status":"EM_EXECUCAO","budgetId":"3fd2277a-..."}

# Consulta publica, sem JWT — o cliente se identifica pelo CPF:
curl -s "$API/consult/$CLIENT_ID?cpf=529.982.247-25" | jq '.[0] | {id,status}'
```

### 4.7 Escalabilidade — `k8s/README.md`

Terminal 1:

```bash
kubectl get hpa soat-app -n soat -w
```

Terminal 2:

```bash
kubectl run load-generator -n soat --rm -it --restart=Never \
  --image=williamyeh/hey -- -z 5m -c 200 http://soat-app:3000/health
```

Terminal 3 (opcional, para mostrar os pods nascendo):

```bash
kubectl get pods -n soat -l app.kubernetes.io/name=soat-app -w
kubectl top pods -n soat
```

Fallback sem `hey`, também de `k8s/README.md` (**não executado nesta validação** — o `hey`
funcionou):

```bash
kubectl run load-generator -n soat --rm -it --restart=Never --image=busybox:1.36 -- \
  sh -c 'for i in $(seq 1 20); do (while true; do wget -q -O- http://soat-app:3000/health >/dev/null; done) & done; wait'
```

Se `TARGETS` ficar em `<unknown>/70%` por mais de um minuto, o `metrics-server` não está
funcionando — volte ao passo 4.3.

### 4.8 Limpeza

```bash
kubectl delete pod load-generator -n soat --ignore-not-found
cd infra/envs/local && tofu destroy -auto-approve
kind get clusters      # "No kind clusters found."
```

Se gravou na AWS, o `terraform destroy` em `infra/envs/aws` é **urgente**, não opcional.

---

## 5. Estrutura do PDF do portal

Quatro páginas. O enunciado pede três coisas — link do repositório, desenho da arquitetura
e link do vídeo; a quarta página é cortesia para o avaliador e custa cinco minutos.

### Página 1 — Identificação

- Título: **Tech Challenge — Fase 2 · Sistema de Gestão de Ordens de Serviço**
- Curso/turma e nome dos integrantes do grupo
- **Link do repositório:** `https://github.com/gomes-leonardo/fiap-software-architecture`
- Uma linha confirmando o compartilhamento: *"Repositório público; o usuário
  `soat-architecture` também consta como colaborador com permissão de escrita."*
- **Link do vídeo:** URL do YouTube/Vimeo (público ou não listado), com a duração ao lado

### Página 2 — Arquitetura da aplicação

- O diagrama de arquitetura do README (entregue pela issue #11), em tamanho legível
- Legenda curta dos recursos escolhidos:
  - **Kubernetes** — Deployment do app com 2 réplicas, StatefulSet do PostgreSQL com volume
    persistente, Services ClusterIP, ConfigMap, Secret e HPA (2–10 pods, alvo de 70% de CPU)
  - **Terraform** — dois ambientes independentes: AWS (VPC, EKS com managed node group, RDS
    PostgreSQL, Secrets Manager) e local (Kind + `metrics-server`)
  - **CI/CD** — GitHub Actions: lint, typecheck, testes unitários, de integração e smoke,
    build da imagem, scan com Trivy, publicação no GHCR e deploy no cluster
  - **Aplicação** — NestJS em Clean Architecture, autenticação JWT, canal externo por
    webhook com segredo pré-compartilhado

### Página 3 — Infraestrutura na AWS

- O diagrama AWS de `infra/README.md` (é Mermaid; renderize no GitHub e capture, ou exporte
  pelo mermaid.live)
- Uma frase sobre a decisão de rede: *"O RDS fica em subnet privada, sem endereço público,
  e sua única regra de entrada é a porta 5432 vinda do security group dos nodes do EKS."*

### Página 4 — Roteiro do vídeo, com marcações de tempo

A tabela da seção 3 deste documento, com os minutos onde cada item do enunciado aparece.
O avaliador tem muitos vídeos de 15 minutos para assistir; entregar o índice é a diferença
entre ele encontrar a demonstração de escalabilidade e não encontrar.

---

## 6. O que foi verificado, e como

### Executado de verdade nesta máquina (macOS arm64, 2026-08-31)

Repetido do zero contra a `main` em `909f055`, já com todos os PRs da Fase 2 mergeados.

| O quê | Resultado |
| --- | --- |
| `tofu init` + `apply` em `infra/envs/local` | Cluster `soat-local` criado: control-plane + 2 workers |
| `metrics-server` do Terraform | `kubectl top nodes` respondeu com números |
| `docker build -t soat-tech-challenge:latest .` | Imagem construída a partir do `Dockerfile` da `main` |
| Carga da imagem no Kind | `kind load docker-image` distribuiu para os 3 nodes |
| `./k8s/apply-all.sh` | Stack completa no ar; `GET /health` → `{"status":"ok","database":"connected"}` |
| `POST /auth/login` **antes** do PR #45 | **401** — nenhum admin semeado (ver 2.4) |
| `POST /auth/login` **depois** do PR #45 | 200, JWT de 245 caracteres |
| `POST /service-orders` com itens inline | `AGUARDANDO_APROVACAO`, `createdBudgetId` preenchido, `budgetId: null` |
| `POST /webhooks/budgets/:id/approve` | **200** · `{"status":"APROVADO","total":221.8}` |
| Mesmo webhook com token inválido | **401** |
| Baixa de estoque após aprovação | 100 → **98** |
| `PATCH /service-orders/:id/status` → `EM_EXECUCAO` | 200, `budgetId` agora preenchido |
| `GET /consult/:id?cpf=` correto / divergente | 200 / **403** |
| `GET /api-docs` | 200 |
| Gerador de carga `williamyeh/hey` | Funcionou no Kind em arm64 |
| HPA escalando | `2%` → `169%` → 4 pods aos 60 s → **6 pods** aos 90 s; pico `176%/70%` |
| `kubectl top pods` e seletor `app.kubernetes.io/name=soat-app` | Ambos funcionaram; 6 pods listados |
| `tofu destroy` | Cluster removido, `kind get clusters` vazio |
| Colaboradores do repositório | `soat-architecture` presente, permissão `write`; repo público |

### Duas armadilhas encontradas ao executar — leia antes de gravar

**1. O primeiro `tofu apply` falha porque o contexto do kubectl ainda não existe.**

A causa registrada antes neste documento estava **errada**. Não é o `~/.kube/config`
faltando: o arquivo existia e o `apply` falhou assim mesmo, porque o provider `kubernetes`
é configurado com um *contexto* que só passa a existir quando o cluster nasce.

```
Error: Provider configuration: cannot load Kubernetes client config
  with provider["registry.opentofu.org/hashicorp/kubernetes"],
  on providers.tf line 39, in provider "kubernetes":
context "kind-soat-local" does not exist
```

O contorno é o da seção 4.2 — criar o cluster primeiro:

```bash
tofu apply -auto-approve -target=kind_cluster.this
tofu apply -auto-approve
```

**Atenção ao endereço do recurso:** é `kind_cluster.this`, na raiz do módulo.
`module.cluster.kind_cluster.this` não casa com nada e o `apply` responde
`0 added, 0 changed, 0 destroyed` sem criar o cluster — silenciosamente.

**2. Sem o PR #45, o cluster sobe sem nenhum administrador.**

Detalhado na seção 2.4. `GET /health` responde saudável, mas `POST /auth/login` devolve
401 e o bloco 4 do vídeo não sai do lugar. É o defeito mais caro encontrado nesta
validação, justamente porque tudo *parece* funcionar.

### O que NÃO foi executado, e por quê

| Item | Por quê |
| --- | --- |
| `infra/envs/aws` (EKS + RDS) | Custa ~US$ 185–195/mês e leva 15–20 min por `apply`. Os comandos vêm de `infra/README.md`; **nenhum deles foi executado**. Validado apenas com `tofu validate`. |
| `infra/bootstrap` (backend S3 + DynamoDB) | Mesmo motivo. |
| O job `deploy` do `ci-cd.yml` de ponta a ponta | Exige `KUBECONFIG_BASE64`, ainda não cadastrado — e um kubeconfig de Kind não é alcançável pelo runner. O CI completo, o build, o scan e o `publish` no GHCR **rodam verdes na `main`**. |
| Fallback de carga com `busybox` | O `hey` funcionou; o fallback está em `k8s/README.md` e não foi exercitado. |
| Descida do HPA de volta a 2 réplicas | Exige 5 minutos de janela de estabilização. Comportamento documentado em `k8s/app-hpa.yaml`, não cronometrado aqui. |
| `POST /webhooks/budgets/:id/refuse` | Fora do caminho do vídeo. O `approve` do mesmo controller foi executado e devolveu `APROVADO`. |

## 7. O que só você pode fazer, em ordem

1. **Mergear o [PR #45](https://github.com/gomes-leonardo/fiap-software-architecture/pull/45)** —
   sem ele não há administrador no cluster e o bloco 4 não roda. Todo o resto da Fase 2 já
   está na `main`.
2. **Cadastrar o `KUBECONFIG_BASE64`** (seção 2.3), se quiser CD real no bloco 3. Os outros
   três secrets já estão. Sem cluster alcançável pela internet, aceite mostrar o deploy
   pulando com aviso — e diga isso em voz alta.
3. **Ativar o ruleset da `main`** — existe, mas está com `enforcement: disabled` (issue #37).
4. **Preparar o ambiente**: passos 4.1 a 4.4, com a imagem buildada **depois** do #45.
5. **Ensaiar o bloco 5 uma vez** antes de gravar, para calibrar com o atraso de ~60 s do HPA.
6. **Gravar** o vídeo seguindo a seção 3, em até 15 minutos.
7. **Publicar** no YouTube ou Vimeo, como público ou não listado.
8. **Colocar o link real no README**, substituindo o placeholder (issue #38).
9. **Montar o PDF** com a estrutura da seção 5, usando a URL canônica do repositório
   (`fiap-software-architecture`, não o nome antigo).
10. **Submeter no portal do aluno** antes do prazo.
11. **Destruir** o ambiente: `tofu destroy` no local e, se usou AWS, `tofu destroy` em
    `infra/envs/aws` — o EKS cobra por hora ligada mesmo vazio.
