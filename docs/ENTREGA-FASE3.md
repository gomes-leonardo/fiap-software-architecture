# Entrega da Fase 3 — Tech Challenge 13SOAT

Fonte do PDF submetido no portal do aluno (issue
[#66](https://github.com/gomes-leonardo/fiap-software-architecture/issues/66)). Gere o PDF a partir
deste arquivo **depois** do release em `main`. Antes de submeter, rode a conferência de links do
fim da página.

## Repositórios

| Papel | Repositório |
|---|---|
| Aplicação principal (NestJS no Kubernetes) | https://github.com/gomes-leonardo/fiap-software-architecture |
| Funções serverless (autenticação por CPF e notificação) | https://github.com/gomes-leonardo/soat-auth-lambda |
| Infraestrutura Kubernetes (cluster, gateway Kong, observabilidade) | https://github.com/gomes-leonardo/soat-infra-k8s |
| Infraestrutura do banco de dados gerenciado (Neon PostgreSQL) | https://github.com/gomes-leonardo/soat-infra-db |

Todos os quatro são públicos, com `main` protegida (PR obrigatório, CI verde e `enforce_admins`) e
CI/CD no GitHub Actions. `develop` faz o deploy em homologação (hml) e `main`, em produção (prd).

## Vídeo

- **Link:** _a preencher_ (até 15 minutos, público ou não listado, sem login)

## Documentação

| Item | Link |
|---|---|
| Swagger (OpenAPI) | https://github.com/gomes-leonardo/fiap-software-architecture/blob/main/docs/swagger.json |
| Coleção Postman | https://github.com/gomes-leonardo/fiap-software-architecture/blob/main/docs/postman-collection.json |
| Diagrama de componentes (visão de nuvem) | https://github.com/gomes-leonardo/fiap-software-architecture/blob/main/docs/arquitetura/componentes.md |
| Diagrama de sequência: autenticação por CPF | https://github.com/gomes-leonardo/fiap-software-architecture/blob/main/docs/arquitetura/sequencia-autenticacao.md |
| Diagrama de sequência: abertura de OS | https://github.com/gomes-leonardo/fiap-software-architecture/blob/main/docs/arquitetura/sequencia-abertura-os.md |
| RFCs (nuvem e custo, banco, autenticação, observabilidade, gateway) | https://github.com/gomes-leonardo/fiap-software-architecture/tree/main/docs/rfc |
| ADRs (comunicação, HPA, migrations, ambientes, segredos) | https://github.com/gomes-leonardo/fiap-software-architecture/tree/main/docs/adr |
| Justificativa do banco de dados | https://github.com/gomes-leonardo/fiap-software-architecture/blob/main/docs/database/justificativa-postgresql.md |
| Modelo ER e relacionamentos | https://github.com/gomes-leonardo/fiap-software-architecture/blob/main/docs/database/modelo-er.md |
| Acesso por papel (admin × cliente) | https://github.com/gomes-leonardo/fiap-software-architecture/blob/main/docs/api/acesso-por-papel.md |
| Pipeline e deploy | https://github.com/gomes-leonardo/fiap-software-architecture/blob/main/.github/DEPLOYMENT.md |
| Alertas de falha no processamento de OS | https://github.com/gomes-leonardo/soat-infra-k8s/blob/main/newrelic/ALERTAS.md |

## Usuário `soat-architecture`

Adicionado como colaborador nos quatro repositórios. Evidência:

```bash
for r in fiap-software-architecture soat-auth-lambda soat-infra-k8s soat-infra-db; do
  printf '%-28s ' "$r"
  gh api "repos/gomes-leonardo/$r/collaborators" --jq '[.[].login] | index("soat-architecture") != null'
done
```

Cole a saída abaixo e anexe um print da aba *Settings → Collaborators* de cada repositório:

```
(saída do comando)
```

Os repositórios são públicos, mas o convite precisa constar como **aceito**: convite pendente não
aparece na lista de colaboradores.

## Como verificar a entrega

Com o cluster de pé, a jornada completa pelo gateway (login de admin, cliente, veículo, OS, token
por CPF, rotas `/me`, papéis, webhook recusado e cliente inativo) roda com:

```bash
ADMIN_PASSWORD=... scripts/e2e-gateway.sh hml   # ou prd
```

## Conferência de links (antes de gerar o PDF)

```bash
grep -oE 'https://github.com/[^ )|]+' docs/ENTREGA-FASE3.md | sort -u | while read -r url; do
  code=$(curl -s -o /dev/null -w '%{http_code}' "$url")
  echo "$code $url"
done | grep -v '^200 ' || echo "todos os links responderam 200"
```
