# Pipeline de CI/CD e deploy

Referência do workflow `.github/workflows/ci-cd.yml` (Fase 3, issues
[#53](https://github.com/gomes-leonardo/fiap-software-architecture/issues/53) e
[#54](https://github.com/gomes-leonardo/fiap-software-architecture/issues/54)).

## O pipeline

```
lint ───────────┐
typecheck ──────┤
test-unit ──────┼──> test-smoke ──> build ──> security ──> publish ──┐
test-integration┘                  (arm64)    (Trivy)     (GHCR)    ├──> deploy (hml | prd)
manifests (kustomize + kubeconform) ────────────────────────────────┘    runner self-hosted
```

| Job | Nome de exibição | Roda em | O que faz |
|---|---|---|---|
| `lint` | `Lint` | PR e push | `npm run lint` |
| `typecheck` | `Typecheck` | PR e push | `npx tsc --noEmit` |
| `test-unit` | `Unit Tests` | PR e push | suíte unitária + gate de 80% em `src/domain` |
| `test-integration` | `Integration Tests` | PR e push | integração contra Postgres real (Testcontainers) |
| `test-smoke` | `Smoke Tests` | PR e push | sobe o `AppModule` real contra Postgres de Testcontainers |
| `manifests` | `Render dos manifestos` | PR e push | `kubectl kustomize` dos overlays hml e prd e do Job, validados por `kubeconform -strict` |
| `build` | `Build Docker Image` | PR e push | imagem **arm64** (runner `ubuntu-24.04-arm`), exportada como tarball |
| `security` | `Security Scan` | PR e push | `npm audit` + Trivy sobre o mesmo tarball |
| `publish` | `Publish Image` | **só push** em `develop`/`main` | carrega o tarball escaneado e publica no GHCR |
| `deploy` | `Deploy (hml)` / `Deploy (prd)` | **só push** | migrations, rollout e smoke no cluster Kind |

Os gatilhos são push e pull request para `develop` e `main`. Nenhum pull request publica imagem
nem toca em cluster.

**Por que arm64:** o cluster Kind roda num Mac Apple Silicon. Uma imagem amd64 só subiria por
emulação, lenta e instável. O runner arm64 hospedado pelo GitHub é gratuito em repositório
público.

## Ambientes

| Branch | Environment | Namespace | Gateway (host) | HPA |
|---|---|---|---|---|
| `develop` | `hml` | `soat-hml` | `http://127.0.0.1:18081` | 1 a 3 pods |
| `main` | `prd` | `soat-prd` | `http://127.0.0.1:18080` | 2 a 10 pods |

Os Environments `hml` e `prd` ficam presos às branches `develop` e `main` (Settings →
Environments → Deployment branches). Assim um job de outra branch não recebe os secrets do
ambiente.

## Runner self-hosted

O deploy roda em `runs-on: [self-hosted, soat-kind]`, um runner registrado no Mac onde o Docker e
o cluster Kind `soat` estão. Um runner hospedado pelo GitHub não alcança um cluster que vive no
`127.0.0.1` de outra máquina, e expor a API do Kubernetes na internet seria pior que o problema.

Registro (uma vez): Settings → Actions → Runners → New self-hosted runner → macOS ARM64, com a
label `soat-kind`.

## Secrets

Por Environment (`hml` e `prd`), em Settings → Environments → `<env>` → Secrets:

| Secret | Uso |
|---|---|
| `WEBHOOK_SECRET` | segredo pré-compartilhado do webhook de status |
| `ADMIN_BOOTSTRAP_PASSWORD` | senha do primeiro admin. Precisa atender à política: **12+ caracteres, com maiúscula, minúscula e dígito**. Senão, o boot com banco vazio é recusado |

```bash
gh secret set WEBHOOK_SECRET --env hml
gh secret set ADMIN_BOOTSTRAP_PASSWORD --env hml
```

Os demais segredos não passam por aqui. `soat-db` é criado pelo `soat-infra-db` e `soat-jwt`
pelo `soat-infra-k8s/gateway`. O primeiro passo do deploy confere que os dois existem no
namespace e que os secrets do Environment estão preenchidos. **Se faltar algo, o job falha.**
Deploy sem configuração não é sucesso.

## Registry: GHCR

As imagens vão para `ghcr.io/gomes-leonardo/fiap-software-architecture`. O `GITHUB_TOKEN` da
Action já autentica com `packages: write`, então não há credencial de nuvem para guardar.

| Tag | Para quê |
|---|---|
| `sha-<7 primeiros do commit>` | **é o que o deploy referencia.** Imutável |
| `latest` | conveniência para `docker pull` manual |

A tag por SHA não é decorativa. O Deployment usa `imagePullPolicy: IfNotPresent`, e com uma tag
fixa o kubelet reaproveitaria a imagem em cache no node.

**O pacote precisa ser público** para os nodes do Kind puxarem sem credencial: Settings →
Packages → `fiap-software-architecture` → Package settings → Change visibility → Public.

## O que o deploy faz, na ordem

1. **Conferir configuração.** Os secrets do Environment estão preenchidos? `soat-db` e
   `soat-jwt` existem no namespace?
2. **`soat-app-secret`**, recriado a partir dos secrets do Environment. Os valores passam por
   arquivo temporário, nunca pela linha de comando.
3. **Fixar a imagem.** Gera `k8s/.deploy/<env>/{app,migrate}`, um kustomization por cima do
   overlay com `images:` apontando para `ghcr.io/...:sha-<curto>`. O overlay versionado não muda.
4. **Migrations.** Apaga o Job anterior, cria o `soat-migrate` e espera `complete`. Se falhar,
   o job para aqui, e o Deployment e a versão no ar continuam intactos.
5. **Aplicar a aplicação** e esperar o rollout. Depois confere que a imagem em execução é a do
   commit.
6. **Smoke pelo Kong:** `GET /health` em `127.0.0.1:18080` ou `18081`, o mesmo caminho do usuário.
7. **Em falha:** coleta pods, eventos e logs. O `kubectl rollout undo` só roda se este run chegou
   ao apply **e** a imagem no ar for a deste commit, diferente da anterior. Depois espera o rollback
   convergir. Uma falha antes do apply (configuração, secret, migration) deixa a versão no ar
   intacta. O undo reverte o pod template; ConfigMap e HPA ficam como o apply deixou.

## Proteção de branch

Os checks exigidos estão em [`BRANCH_PROTECTION.md`](./BRANCH_PROTECTION.md). `Publish Image` e
`Deploy (...)` **não** podem entrar nessa lista. Eles não rodam em pull request, e um check exigido
que nunca reporta trava o PR em `Expected` para sempre.
