# Pipeline de CI/CD e deploy

Referência do workflow `.github/workflows/ci-cd.yml`. Parte da issue
[#10](https://github.com/gomes-leonardo/fiap-software-architecture/issues/10).

## O pipeline

```
lint ──────────┐
typecheck ─────┤
test-unit ─────┼──> test-smoke ──> build ──> security ──> publish ──> deploy
test-integration┘                 (tarball)   (Trivy)      (GHCR)    (Kubernetes)
                                                            └── só na main, push ──┘
```

| Job | Nome de exibição | Roda em | O que faz |
|---|---|---|---|
| `lint` | `Lint` | PR e main | `npm run lint` |
| `typecheck` | `Typecheck` | PR e main | `npx tsc --noEmit` |
| `test-unit` | `Unit Tests` | PR e main | suíte unitária + gate de 80% em `src/domain` |
| `test-integration` | `Integration Tests` | PR e main | suíte de integração contra Postgres de serviço |
| `test-smoke` | `Smoke Tests` | PR e main | `npm run test:smoke` — sobe o `AppModule` real contra Postgres de Testcontainers |
| `build` | `Build Docker Image` | PR e main | build da imagem, exportada como tarball |
| `security` | `Security Scan` | PR e main | `npm audit` + Trivy sobre o tarball |
| `publish` | `Publish Image` | **só main (push)** | carrega o tarball e publica no GHCR |
| `deploy` | `Deploy to Kubernetes` | **só main (push)** | aplica os manifestos de `k8s/` no cluster |

`publish` e `deploy` carregam `if: github.ref == 'refs/heads/main' && github.event_name == 'push'`.
Nenhum pull request publica imagem nem toca em cluster.

## Registry: GHCR

As imagens vão para `ghcr.io/gomes-leonardo/fiap-software-architecture`.

A escolha é o GHCR e não ECR ou Docker Hub porque o `GITHUB_TOKEN` que a Action já
recebe autentica com `permissions: packages: write` — não há credencial de nuvem para
rotacionar nem infraestrutura para provisionar. O Terraform da
[#8](https://github.com/gomes-leonardo/fiap-software-architecture/issues/8) não cria ECR,
então usar ECR exigiria um módulo novo e um par de chaves AWS só para guardar bytes.

Duas tags por commit, apontando para o mesmo digest:

| Tag | Para quê |
|---|---|
| `sha-<7 primeiros do commit>` | **é o que o deploy referencia.** Imutável |
| `latest` | conveniência para `docker pull` manual e demo |

A tag por SHA não é decorativa. O `Deployment` de `k8s/app-deployment.yaml` usa
`imagePullPolicy: IfNotPresent`: com uma tag fixa como `latest`, o kubelet encontraria a
imagem já em cache no node e **nunca puxaria a versão nova**. Uma tag diferente a cada
commit força o pull.

### Visibilidade do pacote

Um pacote no GHCR nasce **privado**. O job de deploy cria um `imagePullSecret`
(`ghcr-pull`) no namespace `soat` e o associa à ServiceAccount `default`, o que cobre o
pull durante o rollout — mas o `GITHUB_TOKEN` expira quando o job termina, então um pod
reagendado dias depois falharia com `ImagePullBackOff`.

O caminho recomendado é deixar o pacote público:

**Settings → Packages → `fiap-software-architecture` → Package settings → Change visibility → Public**

## Environment `production`

O job `deploy` declara `environment: production`. O GitHub cria o environment sozinho na
primeira execução; para exigir aprovação manual antes de cada deploy:

**Settings → Environments → `production` → Required reviewers**

Enquanto houver reviewer configurado, o job fica em `Waiting` até alguém aprovar.

## Secrets

| Secret | Obrigatório | Usado em |
|---|---|---|
| `KUBECONFIG_BASE64` | para deployar | acesso ao cluster |
| `DB_PASS` | recomendado | sobrescreve `DB_PASS` em `soat-app-secret` |
| `JWT_SECRET` | recomendado | sobrescreve `JWT_SECRET` em `soat-app-secret` |
| `WEBHOOK_SECRET` | recomendado | sobrescreve `WEBHOOK_SECRET` em `soat-app-secret` |
| `GITHUB_TOKEN` | automático | login no GHCR — **não precisa cadastrar** |

O `DOCKER_REGISTRY_TOKEN` citado na issue #10 não existe: com GHCR o `GITHUB_TOKEN` já
faz o login, então há um secret a menos para gerenciar.

### `KUBECONFIG_BASE64`

```bash
# 1. aponte o kubeconfig local para o cluster de destino
#    EKS provisionado pela #8:
aws eks update-kubeconfig --region us-east-1 --name soat-tech-challenge-dev-eks
#    ou, para um cluster local:
kubectl config use-context kind-soat

# 2. confirme que é o cluster certo antes de exportar
kubectl config current-context

# 3. cadastre o secret
#    Linux:
gh secret set KUBECONFIG_BASE64 \
  --repo gomes-leonardo/fiap-software-architecture \
  --body "$(base64 -w0 ~/.kube/config)"

#    macOS (o base64 do BSD não tem -w):
gh secret set KUBECONFIG_BASE64 \
  --repo gomes-leonardo/fiap-software-architecture \
  --body "$(base64 -i ~/.kube/config | tr -d '\n')"
```

O `~/.kube/config` costuma conter **todos** os seus clusters e credenciais. Para exportar
só o contexto de destino:

```bash
kubectl config view --minify --flatten --context=<contexto> > /tmp/kubeconfig-ci
base64 -w0 /tmp/kubeconfig-ci   # ou: base64 -i /tmp/kubeconfig-ci | tr -d '\n'
rm /tmp/kubeconfig-ci
```

> Um kubeconfig de EKS gerado por `aws eks update-kubeconfig` não carrega credencial: ele
> invoca `aws eks get-token` em runtime. Nesse caso o runner também precisa das variáveis
> `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` (ou OIDC), ou de um kubeconfig com token de
> ServiceAccount. Para um cluster local ou um kubeconfig com certificado embutido, só o
> `KUBECONFIG_BASE64` basta.

### `DB_PASS`, `JWT_SECRET`, `WEBHOOK_SECRET`

`k8s/app-secret.yaml` está versionado com valores de exemplo (`change-me-*`) — base64 não
é criptografia. O deploy sobrescreve as chaves que tiverem secret correspondente no GitHub,
antes de qualquer workload subir.

```bash
gh secret set DB_PASS --repo gomes-leonardo/fiap-software-architecture \
  --body "$(openssl rand -base64 32)"
gh secret set JWT_SECRET --repo gomes-leonardo/fiap-software-architecture \
  --body "$(openssl rand -base64 48)"
gh secret set WEBHOOK_SECRET --repo gomes-leonardo/fiap-software-architecture \
  --body "$(openssl rand -base64 48)"
```

> **Cadastre `DB_PASS` antes do primeiro deploy.** O Postgres só lê `POSTGRES_PASSWORD` no
> `initdb`, isto é, no primeiro boot do StatefulSet. Trocar o secret depois exige
> `ALTER USER` no banco ou apagar o PVC — o app passaria a apresentar uma senha que o banco
> não conhece.

### Secrets por environment (mais restrito)

Os comandos acima criam secrets no nível do repositório, o que funciona sem nenhum passo
prévio. Para restringi-los ao environment `production` — de modo que só o job de deploy os
enxergue — crie o environment primeiro e use `--env`:

```bash
gh api -X PUT repos/gomes-leonardo/fiap-software-architecture/environments/production
gh secret set KUBECONFIG_BASE64 --repo gomes-leonardo/fiap-software-architecture \
  --env production --body "$(base64 -w0 ~/.kube/config)"
```

## Sem secrets, o pipeline continua verde

Se `KUBECONFIG_BASE64` não estiver configurado, o job `deploy` **não falha**: o passo de
preflight escreve um aviso no summary da execução e os passos seguintes são pulados.

Isso é deliberado. O repositório é uma entrega acadêmica e quem clona não tem cluster
nenhum; um deploy vermelho por configuração ausente pintaria a `main` de falha sem que
haja nada errado com o código. O que o CI de fato afirma — lint, tipos, testes, imagem,
scan — continua sendo verificado e continua bloqueando.

## O que o deploy faz, na ordem

1. Preflight das credenciais (pula tudo se não houver `KUBECONFIG_BASE64`)
2. `k8s/namespace.yaml`
3. `k8s/app-secret.yaml` e `k8s/app-configmap.yaml`
4. Sobrescreve `DB_PASS` / `JWT_SECRET` / `WEBHOOK_SECRET` a partir dos secrets do GitHub
5. `k8s/db-service.yaml` e `k8s/db-deployment.yaml` + `rollout status statefulset/soat-db`
6. Cria o `imagePullSecret` `ghcr-pull` e o associa à ServiceAccount `default`
7. `k8s/app-service.yaml`; aplica `k8s/app-deployment.yaml` **com a imagem do commit
   substituída antes do apply**
8. `rollout status deployment/soat-app --timeout=300s` e confere que a imagem em execução é
   a esperada
9. `k8s/app-hpa.yaml`
10. Smoke test pós-deploy: `kubectl port-forward` + `GET /health`

É a mesma ordem de `k8s/apply-all.sh`, que continua sendo o caminho para deploy manual e
demo local.

**Por que o job não chama `apply-all.sh` diretamente:** o script aplica
`k8s/app-deployment.yaml` literal, com a tag `soat-tech-challenge:latest` que só existe num
node carregado à mão (`kind load docker-image`). No CD a imagem vem do GHCR com tag por
SHA, e chamar o script reverteria a imagem a cada deploy. Enquanto `apply-all.sh` não
aceitar um override de imagem (`IMAGE=... ./k8s/apply-all.sh`), os dois caminhos precisam
conviver — e mudanças na lista de manifestos exigem atualizar os dois.

### Por que a imagem é substituída antes do apply, e não com `kubectl set image`

Aplicar o YAML literal e só então rodar `kubectl set image` criaria **duas** revisões: a
primeira com `soat-tech-challenge:latest`, que o node não tem. Um `kubectl rollout undo`
depois voltaria exatamente para essa revisão quebrada. Substituindo antes do apply existe
uma revisão só por deploy, e o rollback aponta para o último deploy que funcionou.

### Smoke test pós-deploy

O Service `soat-app` é `ClusterIP` por decisão da
[#7](https://github.com/gomes-leonardo/fiap-software-architecture/issues/7) —
`LoadBalancer` fica `<pending>` para sempre em kind/minikube. Não existe URL pública para
dar `curl`, então o job abre `kubectl port-forward -n soat svc/soat-app 3000:3000` e bate em
`http://127.0.0.1:3000/health`, esperando `"status":"ok"` (até ~60s de retry).

É o mesmo caminho de acesso que o `k8s/README.md` documenta para humanos.

### Rollback automático

Se qualquer passo do deploy falhar — rollout estourando o timeout, imagem divergente ou
smoke test vermelho — o job:

1. imprime diagnóstico (pods, eventos, `describe`, logs dos containers) **da revisão
   quebrada**;
2. roda `kubectl rollout undo deployment/soat-app -n soat` e espera o rollout da revisão
   anterior.

No primeiro deploy não há revisão anterior; o job registra um aviso e não tenta reverter.

## Proteção de branch

Os nomes de check exigidos na `main` estão em [`BRANCH_PROTECTION.md`](./BRANCH_PROTECTION.md).
`Publish Image` e `Deploy to Kubernetes` **não** podem entrar nessa lista: eles não rodam em
pull request, e um check exigido que nunca reporta trava o PR em `Expected` para sempre.
