# Proteção da branch `main`

Parte da issue [#1](https://github.com/gomes-leonardo/fiap-software-architecture/issues/1).

Proteção de branch não é código versionado — é configuração do repositório no GitHub.
Este documento registra **exatamente** o que precisa ser aplicado, para que a configuração
seja reproduzível e revisável.

> **Status: pendente de aplicação.** Só quem tem permissão de _admin_ no repositório
> (`gomes-leonardo`) consegue aplicar. A tentativa via API a partir de uma conta
> colaboradora retorna `403`/`404` (`permissions.admin: false`).

## Regras a aplicar

| Regra | Valor | Motivo |
|-------|-------|--------|
| Required status checks | `Lint`, `Typecheck`, `Unit Tests`, `Integration Tests`, `Smoke Tests`, `Build Docker Image` | Impede merge sem CI verde |
| Require branches to be up to date (`strict`) | `true` | Evita merge semântico quebrado: a branch precisa estar rebaseada na `main` antes do merge |
| Required pull request reviews | 1 aprovação, `dismiss_stale_reviews: true` | Fecha o push direto na `main`; aprovação some se novos commits chegarem |
| Required conversation resolution | `true` | Nenhum comentário de review fica pendente |
| Allow force pushes | `false` | Preserva o histórico da `main` |
| Allow deletions | `false` | Ninguém apaga a `main` |
| Enforce admins | `false` | O owner mantém uma saída de emergência; suba para `true` se quiser travar todo mundo |

### Sobre os nomes dos status checks

O GitHub casa os required status checks pelo **nome de exibição do job** (o campo `name:`
em `.github/workflows/ci-cd.yml`), não pelo id do job. Por isso a lista é
`Lint` / `Typecheck` / `Unit Tests` / `Integration Tests` / `Smoke Tests` / `Build Docker Image`,
e não `lint` / `typecheck` / `test-unit` / `test-integration` / `test-smoke` / `build`.

**Se algum `name:` do `ci-cd.yml` mudar, esta lista precisa mudar junto** — um check exigido
que nunca reporta deixa o PR travado para sempre em "Expected".

`Security Scan` fica **fora** da lista de propósito: ele roda com `exit-code: '0'`
(relatório informativo), então exigi-lo não agregaria gate nenhum.

`Publish Image` e `Deploy to Kubernetes` também ficam fora, por um motivo mais duro: eles
carregam `if: github.ref == 'refs/heads/main'` e **nunca reportam em pull request**. Exigir
um check que não roda no PR trava o merge em `Expected` para sempre. Ver
[`DEPLOYMENT.md`](./DEPLOYMENT.md).

## Como aplicar — via `gh` (recomendado)

Com uma conta que tenha admin no repositório:

```bash
cat > /tmp/protection.json <<'EOF'
{
  "required_status_checks": {
    "strict": true,
    "contexts": ["Lint", "Typecheck", "Unit Tests", "Integration Tests", "Smoke Tests", "Build Docker Image"]
  },
  "enforce_admins": false,
  "required_pull_request_reviews": {
    "dismiss_stale_reviews": true,
    "require_code_owner_reviews": false,
    "required_approving_review_count": 1
  },
  "restrictions": null,
  "allow_force_pushes": false,
  "allow_deletions": false,
  "required_conversation_resolution": true
}
EOF

gh api -X PUT repos/gomes-leonardo/fiap-software-architecture/branches/main/protection \
  --input /tmp/protection.json
```

Conferir depois:

```bash
gh api repos/gomes-leonardo/fiap-software-architecture/branches/main/protection \
  --jq '{checks: .required_status_checks.contexts, strict: .required_status_checks.strict, reviews: .required_pull_request_reviews.required_approving_review_count}'
```

> O remote ainda aponta para `soat-tech-challenge-fase1`, que hoje redireciona para
> `fiap-software-architecture` (o repositório foi renomeado). A API aceita os dois nomes,
> mas use o nome atual para evitar confusão.

## Como aplicar — via interface

**Settings → Branches → Add branch protection rule**

1. Branch name pattern: `main`
2. ☑ Require a pull request before merging → Required approvals: **1** → ☑ Dismiss stale pull request approvals when new commits are pushed
3. ☑ Require status checks to pass before merging → ☑ Require branches to be up to date before merging
   → buscar e marcar: `Lint`, `Typecheck`, `Unit Tests`, `Integration Tests`, `Smoke Tests`, `Build Docker Image`
4. ☑ Require conversation resolution before merging
5. Deixar **desmarcados**: Allow force pushes, Allow deletions

> Os checks só aparecem na busca do passo 3 depois de terem rodado ao menos uma vez no
> repositório. Se `Typecheck` não aparecer, abra um PR com este workflow, espere o CI rodar
> e volte para marcá-lo.
