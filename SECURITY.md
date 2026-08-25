# Relatorio de Seguranca

**Projeto:** Auto Repair Shop OS Management System, SOAT Tech Challenge Fase 2
**Commit analisado:** `4126155`
**Data dos scans:** 25/08/2026

Todos os numeros deste relatorio vieram de scans executados nesta data, no commit
acima. Os outputs brutos estao em [`docs/security/`](docs/security/). Nenhuma
tabela foi preenchida com dado estimado: onde o scan nao encontrou nada, a secao
diz isso e mostra como a ausencia foi verificada.

## Ambiente e versoes das ferramentas

| Ferramenta | Versao | Comando executado | Evidencia |
|---|---|---|---|
| npm audit | npm 11.17.0 (Node 24.19.0) | `npm audit --json` e `npm audit --omit=dev --json` | `docs/security/npm-audit-all.json`, `docs/security/npm-audit-prod.json` |
| Trivy | 0.74.0 (DB de 25/08/2026 13:00 UTC) | `docker build -t soat-tech-challenge:latest .` e `trivy image --scanners vuln soat-tech-challenge:latest` | `docs/security/trivy-image.txt` |
| Semgrep | 1.174.0 | `semgrep --config auto src/` | `docs/security/semgrep.txt` |

Plataforma dos scans: macOS, arquitetura `arm64`, Docker 29.7.2. A imagem
construida e `linux/arm64`. O conjunto de CVEs de sistema operacional independe
da arquitetura, mas as versoes exatas de pacote podem variar entre `arm64` e
`amd64`. O CI roda o mesmo Trivy em `ubuntu-latest`/`amd64`
(`.github/workflows/ci.yml`, job `security`).

## 1. Resumo executivo

| Scan | Escopo | Critical | High | Medium | Low | Total |
|---|---|---|---|---|---|---|
| npm audit (`--omit=dev`) | dependencias de producao | 0 | 0 | 0 | 0 | **0** |
| npm audit (completo) | producao mais desenvolvimento | 0 | 0 | 0 | 0 | **0** |
| Trivy | imagem `soat-tech-challenge:latest` | 1 | 20 | 14 | 22 | **57** |
| Semgrep | `src/` (106 arquivos, 210 regras) | 0 | 0 | 1 | 0 | **1** |

Leitura dos numeros:

- **Dependencias da aplicacao: limpo.** As 888 dependencias resolvidas no
  `package-lock.json` nao tem nenhuma vulnerabilidade conhecida hoje, nem em
  producao nem em desenvolvimento. Isso substitui as 48 vulnerabilidades
  relatadas na Fase 1. A secao 2 explica o resultado e como confirmei que o
  scanner realmente consultou a base de advisories.
- **As 57 vulnerabilidades da imagem nao estao no codigo nem nas dependencias da
  aplicacao.** 30 sao do OpenSSL do Alpine e 27 sao das dependencias embutidas no
  **npm CLI** que a imagem base `node:20.20.2-alpine` carrega em
  `/usr/local/lib/node_modules/npm/`. Os 453 alvos sob `app/node_modules`
  reportaram zero. A secao 3 detalha a analise de alcancabilidade de cada grupo e
  mostra uma correcao de duas linhas, validada por rescan, que leva a imagem de
  57 para **0**.
- **Semgrep: 1 finding**, CORS liberado para qualquer origem em `src/main.ts:16`.
  Confirmado como problema real, com impacto concreto sobre o endpoint publico de
  consulta. Detalhado na secao 4.
- **A revisao manual encontrou problemas que nenhum dos scanners pega**, sendo um
  deles critico: o endpoint `POST /auth/register` esta sem autenticacao, o que
  permite a qualquer pessoa criar uma conta de administrador. Secao 4.2 e
  secao 6.1.

Postura geral: a superficie de dependencias esta limpa e as medidas de defesa da
aplicacao (secao 5) sao solidas no que cobrem. O risco concentrado esta em
controle de acesso e configuracao, nao em bibliotecas desatualizadas.

## 2. Analise de dependencias (npm audit)

### 2.1 Producao: 0 vulnerabilidades

```
$ npm audit --omit=dev
found 0 vulnerabilities
```

Arvore avaliada: 256 dependencias de producao (`npm-audit-prod.json`, campo
`metadata.dependencies.prod`). Nenhuma entrada em `vulnerabilities`.

Nao ha tabela nesta secao porque nao ha linha para preencher.

### 2.2 Desenvolvimento: 0 vulnerabilidades

```
$ npm audit
found 0 vulnerabilities
```

Arvore avaliada: 888 pacotes no total, sendo 631 de desenvolvimento
(`npm-audit-all.json`). Tambem sem nenhuma entrada.

Como o resultado de dev e igual ao de producao, a separacao pedida pelo criterio
de aceite nao produz diferenca hoje. A separacao continua importante e esta
documentada na secao 2.4: e ela que sustenta a decisao de risco caso uma
vulnerabilidade de dev apareca em um scan futuro.

### 2.3 Verificacao de que o scan nao passou vazio por engano

Um `found 0 vulnerabilities` pode significar duas coisas: que nao ha
vulnerabilidade, ou que o `npm audit` nao conseguiu falar com a base de
advisories e falhou em silencio. Como o resultado da Fase 1 era 48 e o desta
Fase 2 e 0, rodei um controle antes de confiar no numero.

Criei um projeto descartavel com dois pacotes reconhecidamente vulneraveis e
rodei o mesmo comando, na mesma maquina e na mesma sessao:

```
$ cat package.json
{"name":"audit-control","dependencies":{"lodash":"4.17.11","minimist":"0.0.8"}}

$ npm audit --json
"lodash": { "severity": "critical", "via": [ { "title": "Command Injection in lodash",
  "url": "https://github.com/advisories/GHSA-35jh-r3h4-6jhm", "cvss": { "score": 7.2 } } ] }
```

O controle retornou os advisories esperados. Logo, o `0` do projeto e um zero
real, e nao uma falha de rede mascarada.

### 2.4 Por que uma vulnerabilidade de dev nao chega na imagem de producao

Esta e a justificativa estrutural que sustenta qualquer decisao futura de
**Risco aceito** para uma dependencia de desenvolvimento. Ela vale porque o
`Dockerfile` e multi-stage e os dois estagios instalam arvores diferentes.

O estagio `builder` instala tudo, incluindo devDependencies, porque precisa do
`@nestjs/cli` e do `typescript` para compilar:

```dockerfile
FROM ${NODE_IMAGE} AS builder   # Dockerfile:7
RUN npm ci                      # Dockerfile:12, arvore completa
RUN npm run build               # Dockerfile:15, gera /app/dist
```

O estagio `runner` comeca de uma imagem base limpa e nunca copia o
`node_modules` do builder. Ele reinstala apenas a arvore de producao e traz do
builder somente o JavaScript compilado:

```dockerfile
FROM ${NODE_IMAGE} AS runner            # Dockerfile:18
RUN npm ci --omit=dev                   # Dockerfile:32, so producao
COPY --from=builder /app/dist ./dist    # Dockerfile:34, so o artefato
```

Confirmei no container em execucao que nao ha vazamento de devDependencies:

```
$ docker run --rm --entrypoint sh soat-tech-challenge:latest -c 'ls /app'
dist  node_modules  package-lock.json  package.json
```

O `/app` contem apenas o artefato compilado e a arvore de producao. Nao ha
codigo-fonte TypeScript, nem `test/`, nem ferramenta de build. O `.dockerignore`
reforca isso no contexto de build: `node_modules` (linha 2), `test` (linha 19),
`jest.config.ts` (linha 22) e, principalmente, `.env` e `.env.*` (linhas 35
e 36) nunca sao enviados ao daemon.

Consequencia pratica: uma vulnerabilidade que exista somente em uma
devDependency e **Nao aplicavel** a imagem de producao, porque o pacote nao
existe dentro dela. A verificacao correta dessa afirmacao nao e ler o
`package.json`, e sim rodar o Trivy contra a imagem, que e exatamente o que a
secao 3 faz.

### 2.5 Nota sobre o `overrides` de `js-yaml`

O `package.json` fixa `"overrides": { "js-yaml": "^5.2.3" }`. Uma versao 5.x de
`js-yaml` chama atencao, porque a linha historicamente conhecida do pacote e
3.x/4.x, e um override apontando para uma versao inexistente seria indicio de
confusao de dependencia. Verifiquei no registry antes de reportar:

```
$ npm view js-yaml dist-tags
{ latest: '5.4.0', 'v4-legacy': '4.3.1', 'v3-legacy': '3.15.1' }
```

A linha 5.x e legitima e e a atual do pacote. O override esta correto e nao e um
achado de seguranca. Resolve hoje para `js-yaml@5.2.3` no lockfile, enquanto a
`latest` e `5.4.0`. Como o `npm audit` reporta zero, isso e manutencao de
dependencia, nao risco.

## 3. Analise de imagem Docker (Trivy)

Imagem: `soat-tech-challenge:latest`, base `node:20.20.2-alpine` (Alpine 3.23.4,
Node 20.20.2, npm 10.8.2). A tag base e fixada em versao exata no
`Dockerfile:4`, o que torna este resultado reproduzivel.

### 3.1 Distribuicao dos 57 findings

| Grupo | Onde vive na imagem | Critical | High | Medium | Low | Total | Decisao |
|---|---|---|---|---|---|---|---|
| OpenSSL do Alpine | pacotes `libssl3` e `libcrypto3` | 0 | 2 | 8 | 20 | 30 | Risco aceito, com correcao disponivel |
| Dependencias do npm CLI | `/usr/local/lib/node_modules/npm/` | 1 | 18 | 6 | 2 | 27 | Nao aplicavel em runtime, mas removivel |
| Dependencias da aplicacao | `/app/node_modules` (453 alvos) | 0 | 0 | 0 | 0 | **0** | Nada a tratar |

O ponto central deste relatorio esta na terceira linha. Nenhuma das 57
vulnerabilidades vem de um pacote que a aplicacao declara ou importa. Isso e
visivel no proprio sumario do Trivy: todo alvo com contagem maior que zero tem
caminho `usr/local/lib/node_modules/npm/...` ou e pacote de sistema operacional.

### 3.2 Grupo 1: OpenSSL do Alpine, 30 findings

Todos os 30 sao do par `libcrypto3` e `libssl3`, ambos na versao `3.5.6-r0`, e
todos tem correcao publicada na `3.5.7-r0`. Como as duas bibliotecas sao
empacotadas juntas, cada CVE aparece duas vezes, uma por pacote. Sao 15 CVEs
distintos.

| Pacote | Versao | Severidade | CVE | Descricao | Decisao |
|---|---|---|---|---|---|
| libcrypto3, libssl3 | 3.5.6-r0 | HIGH | CVE-2026-45447 | Use-after-free de heap em `PKCS7_verify()` | Risco aceito |
| libcrypto3, libssl3 | 3.5.6-r0 | MEDIUM | CVE-2026-34182 | CMS AuthEnvelopedData pode aceitar mensagem forjada | Risco aceito |
| libcrypto3, libssl3 | 3.5.6-r0 | MEDIUM | CVE-2026-34183 | Crescimento ilimitado de memoria no handler QUIC PATH_CHALLENGE | Risco aceito |
| libcrypto3, libssl3 | 3.5.6-r0 | MEDIUM | CVE-2026-42764 | Desreferencia de ponteiro nulo no pacote inicial QUIC | Risco aceito |
| libcrypto3, libssl3 | 3.5.6-r0 | MEDIUM | CVE-2026-45445 | IV ignorado em AES-OCB no caminho `EVP_Cipher()` | Risco aceito |
| libcrypto3, libssl3 | 3.5.6-r0 | LOW | CVE-2026-34180 | Leitura fora de limites na decodificacao ASN.1 | Risco aceito |
| libcrypto3, libssl3 | 3.5.6-r0 | LOW | CVE-2026-34181 | PKCS#12 com PBMAC1 aceito com chave HMAC curta | Risco aceito |
| libcrypto3, libssl3 | 3.5.6-r0 | LOW | CVE-2026-42766 | Possivel desreferencia nula em decifragem CMS por senha | Risco aceito |
| libcrypto3, libssl3 | 3.5.6-r0 | LOW | CVE-2026-42767 | Desreferencia nula em CRMF EncryptedValue | Risco aceito |
| libcrypto3, libssl3 | 3.5.6-r0 | LOW | CVE-2026-42768 | Oraculo de Bleichenbacher em `CMS_decrypt()` e `PKCS7_decrypt()` | Risco aceito |
| libcrypto3, libssl3 | 3.5.6-r0 | LOW | CVE-2026-42769 | Substituicao de trust anchor em CMP `rootCaKeyUpdate` | Risco aceito |
| libcrypto3, libssl3 | 3.5.6-r0 | LOW | CVE-2026-42770 | Validacao FFC-DH usa `q` fornecido pelo par | Risco aceito |
| libcrypto3, libssl3 | 3.5.6-r0 | LOW | CVE-2026-45446 | Processamento incorreto de tag para mensagem vazia em AES-GCM-SIV e AES-SIV | Risco aceito |
| libcrypto3, libssl3 | 3.5.6-r0 | LOW | CVE-2026-7383 | Overflow de heap por overflow de inteiro no dimensionamento de saida Unicode | Risco aceito |
| libcrypto3, libssl3 | 3.5.6-r0 | LOW | CVE-2026-9076 | Leitura fora de limites em decifragem CMS por senha | Risco aceito |

**Justificativa da decisao.** O processo da aplicacao nao carrega essas
bibliotecas. O binario do Node na imagem oficial e compilado com OpenSSL
estatico proprio, e nao linka o OpenSSL do sistema. Verifiquei diretamente:

```
$ docker run --rm --entrypoint sh soat-tech-challenge:latest -c 'ldd /usr/local/bin/node | grep -c ssl'
0
$ docker run --rm --entrypoint sh soat-tech-challenge:latest -c 'node -p "process.versions.openssl"'
3.0.19
```

Checando quem na imagem de fato linka `libssl.so.3` ou `libcrypto.so.3`:

| Binario | Referencias a libssl/libcrypto | Executado em runtime |
|---|---|---|
| `/usr/local/bin/node` | 0 | Sim, e o processo principal |
| `/bin/busybox` (fornece o `wget` do HEALTHCHECK) | 0 | Sim |
| `/sbin/tini` (PID 1) | 0 | Sim |
| `/sbin/apk` | 2 | Nao |

O unico consumidor e o gerenciador de pacotes `apk`, que nao roda em runtime e
nem conseguiria: o container executa como usuario nao-root (`Dockerfile:36`) e o
`apk` falha com permissao negada. Alem disso, os CVEs de QUIC nao tem caminho de
alcance nenhum, porque nada na imagem fala QUIC.

Por isso a classificacao e **Risco aceito**, e nao "critico a corrigir hoje".
Ainda assim, a correcao existe e e barata, e esta na secao 3.5.

### 3.3 Grupo 2: dependencias do npm CLI, 27 findings

Este grupo concentra o unico CRITICAL da imagem. Todos os 27 estao em pacotes sob
`/usr/local/lib/node_modules/npm/node_modules/`, ou seja, sao dependencias
internas do proprio npm que vem embutido na imagem base.

| Pacote | Versao na imagem | Sev. | CVE | Descricao | Decisao |
|---|---|---|---|---|---|
| tar | 6.2.1 | CRITICAL | CVE-2026-59873 | Negacao de servico via gzip bomb | Nao aplicavel |
| tar | 6.2.1 | HIGH | CVE-2026-23745 | Sobrescrita de arquivo e envenenamento de symlink via linkpath | Nao aplicavel |
| tar | 6.2.1 | HIGH | CVE-2026-23950 | Sobrescrita de arquivo por colisao de path Unicode | Nao aplicavel |
| tar | 6.2.1 | HIGH | CVE-2026-24842 | Criacao arbitraria de arquivo por bypass de path traversal em hardlink | Nao aplicavel |
| tar | 6.2.1 | HIGH | CVE-2026-26960 | Leitura e escrita arbitraria via hardlink malicioso | Nao aplicavel |
| tar | 6.2.1 | HIGH | CVE-2026-29786 | Path traversal de hardlink via linkpath relativo a drive | Nao aplicavel |
| tar | 6.2.1 | HIGH | CVE-2026-31802 | Sobrescrita de arquivo via symlink relativo a drive | Nao aplicavel |
| tar | 6.2.1 | HIGH | CVE-2026-59874 | DoS via cabecalho de tar malformado | Nao aplicavel |
| tar | 6.2.1 | HIGH | CVE-2026-73566 | DoS via arquivo tar com caminho muito longo | Nao aplicavel |
| tar | 6.2.1 | MEDIUM | CVE-2026-53655 | Contrabando de arquivo por parsing inconsistente | Nao aplicavel |
| tar | 6.2.1 | MEDIUM | CVE-2026-59871 | DoS por tratamento incorreto de path PAX | Nao aplicavel |
| tar | 6.2.1 | MEDIUM | CVE-2026-59875 | DoS via bytes NUL em metadados | Nao aplicavel |
| brace-expansion | 2.0.1 | HIGH | CVE-2026-13149 | DoS por complexidade exponencial | Nao aplicavel |
| brace-expansion | 2.0.1 | HIGH | CVE-2026-14257 | DoS por exaustao de memoria em `expand()` | Nao aplicavel |
| brace-expansion | 2.0.1 | HIGH | CVE-2026-69152 | DoS por arrays intermediarios sem limite | Nao aplicavel |
| brace-expansion | 2.0.1 | MEDIUM | CVE-2026-33750 | DoS via passo zero em padrao de chaves | Nao aplicavel |
| brace-expansion | 2.0.1 | LOW | CVE-2025-5889 | ReDoS em `expand` | Nao aplicavel |
| minimatch | 9.0.5 | HIGH | CVE-2026-26996 | DoS via padrao glob especialmente criado | Nao aplicavel |
| minimatch | 9.0.5 | HIGH | CVE-2026-27903 | DoS por backtracking recursivo sem limite | Nao aplicavel |
| minimatch | 9.0.5 | HIGH | CVE-2026-27904 | DoS por backtracking catastrofico | Nao aplicavel |
| glob | 10.4.2 | HIGH | CVE-2025-64756 | Injecao de comando via nome de arquivo malicioso | Nao aplicavel |
| cross-spawn | 7.0.3 | HIGH | CVE-2024-21538 | ReDoS | Nao aplicavel |
| ip-address | 9.0.5 | HIGH | CVE-2026-69192 | Parsing inconsistente de IP leva a SSRF | Nao aplicavel |
| ip-address | 9.0.5 | MEDIUM | CVE-2026-42338 | XSS por escape de HTML incorreto | Nao aplicavel |
| sigstore | 2.3.1 | HIGH | CVE-2026-48815 | Certificados nao autorizados aceitos por `certificateOIDs` ignorado | Nao aplicavel |
| @sigstore/core | 1.1.0 | MEDIUM | CVE-2026-48758 | Bypass de assinatura por encoding incorreto em `preAuthEncoding` | Nao aplicavel |
| diff | 5.2.0 | LOW | CVE-2026-24001 | DoS em `parsePatch` e `applyPatch` | Nao aplicavel |

**Justificativa da decisao.** Tres fatos, todos verificados na imagem.

Primeiro, o npm nunca executa em runtime. O entrypoint e
`["/sbin/tini", "--"]` e o comando e `["node", "dist/main"]` (`Dockerfile:45` e
`Dockerfile:47`). Nenhum codigo da aplicacao invoca o npm. Para que qualquer um
desses CVEs seja alcancado, seria preciso que um atacante ja tivesse execucao de
comando dentro do container, momento em que o comprometimento ja aconteceu por
outro caminho.

Segundo, e o ponto que evita um diagnostico errado: cinco desses pacotes tambem
existem em `/app/node_modules`, mas em versoes ja corrigidas. Nao e o caso de
dizer que a aplicacao usa `tar` vulneravel. Comparacao lado a lado dentro da
imagem:

| Pacote | Versao em `/app/node_modules` | Versao no bundle do npm | Versao reportada como vulneravel |
|---|---|---|---|
| tar | ausente | 6.2.1 | 6.2.1 |
| glob | 10.5.0 | 10.4.2 | 10.4.2 |
| minimatch | 9.0.9 | 9.0.5 | 9.0.5 |
| brace-expansion | 2.1.4 | 2.0.1 | 2.0.1 |
| cross-spawn | 7.0.6 | 7.0.3 | 7.0.3 |
| diff | 4.0.4 | 5.2.0 | 5.2.0 |
| ip-address | ausente | 9.0.5 | 9.0.5 |
| sigstore | ausente | 2.3.1 | 2.3.1 |

Toda versao vulneravel esta na coluna do npm. A arvore da aplicacao ja esta na
versao de correcao ou acima em todos os casos, que e exatamente o motivo de o
`npm audit` reportar zero e de os 453 alvos `app/node_modules` reportarem zero.

Terceiro, a natureza dos CVEs nao casa com a superficie da aplicacao. Os de
`tar`, `glob` e `minimatch` exigem que um atacante forneca um arquivo ou um
padrao glob para ser processado. A API nao aceita upload de arquivo, nao
descompacta nada e nao expande glob a partir de entrada do usuario. O CVE de SSRF
em `ip-address` e o de assinatura em `sigstore` pertencem ao fluxo de instalacao
e verificacao de pacotes do npm, que nao roda aqui.

### 3.4 Grupo 3: dependencias da aplicacao, 0 findings

O Trivy avaliou 453 alvos `package.json` sob `app/node_modules` e reportou zero
vulnerabilidades em todos. Isso e a confirmacao independente do resultado da
secao 2: o `npm audit` consulta a base do GitHub Advisory a partir do lockfile,
enquanto o Trivy le os pacotes de fato instalados dentro da imagem, com sua
propria base. As duas ferramentas, com fontes diferentes, chegaram ao mesmo
resultado.

No `docs/security/trivy-image.txt` esses 453 alvos aparecem colapsados em uma
unica linha marcada como elidida, para manter o arquivo legivel. A contagem por
alvo era zero em todos.

### 3.5 Correcao proposta e validada

As duas classes de finding tem a mesma origem, a imagem base, e a mesma correcao:
atualizar os pacotes do sistema e remover o npm do estagio de runtime, ja que ele
so e necessario durante o build.

Testei em uma imagem derivada, sem alterar o `Dockerfile` do projeto:

```dockerfile
FROM soat-tech-challenge:latest
USER root
RUN apk upgrade --no-cache && \
    rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx
USER nestjs
```

Rescan da imagem resultante:

```
$ trivy image --scanners vuln soat-hardening-test:latest
TOTAL: 0
```

De 57 para 0. Confirmei tambem que a aplicacao continua integra apos a remocao:

```
$ docker run --rm --entrypoint sh soat-hardening-test:latest -c 'node -e "require(\"/app/dist/main.js\")"'
[Nest] LOG [NestFactory] Starting Nest application...
[Nest] LOG [InstanceLoader] AppModule dependencies initialized
[Nest] LOG [InstanceLoader] TypeOrmModule dependencies initialized
```

O `apk upgrade` funciona porque a correcao `3.5.7-r0` ja esta publicada no
repositorio do Alpine 3.23:

```
$ apk policy libssl3
libssl3 policy:
  3.5.6-r0:  lib/apk/db/installed
  3.5.7-r0:  https://dl-cdn.alpinelinux.org/alpine/v3.23/main
```

Ha um trade-off que precisa ser decidido antes de aplicar. O `Dockerfile:4` fixa
a imagem base em versao exata para garantir build reproduzivel, e um
`apk upgrade` sem pin reintroduz variacao entre dois builds do mesmo commit. As
opcoes sao atualizar apenas os dois pacotes com versao fixada, ou bumpar a tag
base quando a imagem oficial do Node incorporar o OpenSSL corrigido. A mudanca
esta fora do escopo deste PR, que e de documentacao, e vira issue separada.

## 4. Analise estatica de codigo (Semgrep)

```
$ semgrep --config auto src/
Scanning 106 files tracked by git with 1074 Code rules
Findings: 1 (1 blocking)
Rules run: 210
```

### 4.1 Finding do Semgrep

| Regra | Arquivo | Severidade | Decisao |
|---|---|---|---|
| `typescript.nestjs.security.audit.nestjs-header-cors-any` | `src/main.ts:16` | MEDIUM | Confirmado, correcao recomendada |

```typescript
app.enableCors();   // src/main.ts:16
```

Sem argumentos, o `enableCors()` do Nest responde
`Access-Control-Allow-Origin: *`, liberando qualquer origem.

**Analise de impacto.** Nao ha CSRF classico aqui: o JWT viaja no header
`Authorization` (`src/infrastructure/auth/jwt.strategy.ts:16`), nao em cookie, e
o navegador nao anexa esse header automaticamente em requisicao de terceiro. O
impacto real e outro e recai sobre o endpoint publico. Como
`GET /consult/:clientId?cpf=...` nao exige autenticacao
(`src/interfaces/http/consult/consult.controller.ts:30`), qualquer site pode
fazer a requisicao a partir do navegador de um visitante e **ler a resposta**,
que traz dados pessoais: ordens de servico, veiculo e vinculo com CPF/CNPJ. Com
`Access-Control-Allow-Origin` restrito, o navegador bloquearia a leitura.

**Correcao.** Restringir `origin` aos dominios do frontend, via variavel de
ambiente. Detalhado na secao 6.

### 4.2 Revisao manual complementar

Analise estatica automatica tem ponto cego conhecido em autorizacao: nenhuma
regra generica sabe quais rotas desta API deveriam exigir login. Por isso revisei
manualmente os pontos que o Semgrep nao cobre.

O que foi verificado e esta correto:

- **Injecao de SQL: nao ha.** Todo acesso a dados passa pelo repositorio TypeORM
  com metodos tipados. O unico `createQueryBuilder` do projeto esta em
  `src/infrastructure/database/typeorm/repositories/service-order.typeorm-repository.ts:56`
  e monta um `CASE` dinamico, mas os status entram como bind parameter
  (`setParameter`, linha 62) e os inteiros de prioridade vem de um mapa constante
  do dominio, nunca de entrada do usuario. O `SELECT 1` do health check
  (`src/interfaces/http/health/health.controller.ts:60`) e literal.
- **Injecao de comando: nao ha.** Nenhuma ocorrencia de `eval`, `child_process`
  ou `exec` em `src/`.
- **Segredos commitados: nao ha `.env` no historico.** Confirmado com
  `git log --all --diff-filter=A -- '*.env'`, que retorna vazio. O `.env` esta no
  `.gitignore:8`. A unica credencial literal em `src/` e a senha do seed de
  admin, tratada como achado abaixo.
- **Desserializacao insegura: nao ha.** Nenhum `JSON.parse` sobre entrada nao
  validada com reconstrucao de prototipo. O `statusHistory` vem do banco e passa
  por `StatusHistory.fromJSON`.
- **SSRF: nao ha.** A aplicacao nao faz requisicao HTTP de saida em lugar nenhum.

Os problemas encontrados estao na tabela abaixo. A analise completa e a correcao
de cada um estao na secao 6.1.

| # | Severidade | Local | Problema |
|---|---|---|---|
| 1 | **CRITICAL** | `src/interfaces/http/auth/auth.controller.ts:87` | `POST /auth/register` sem autenticacao permite criar conta de administrador |
| 2 | **HIGH** | `src/infrastructure/auth/jwt.strategy.ts:18` e `src/interfaces/http/auth/auth.module.ts:20` | `JWT_SECRET` tem valor padrao no codigo, a aplicacao sobe sem segredo configurado |
| 3 | **HIGH** | `src/interfaces/http/auth/auth.controller.ts:68` | Seed automatico de admin com senha conhecida, em qualquer ambiente |
| 4 | MEDIUM | `src/main.ts:16` | CORS liberado para qualquer origem (finding do Semgrep) |
| 5 | MEDIUM | `src/interfaces/http/guards/rate-limit.guard.ts:113` e `:50` | Rate limit contornavel por troca de chave, e `Map` sem expurgo |
| 6 | MEDIUM | `src/interfaces/http/consult/consult.controller.ts:50` | Respostas 404 e 403 distintas permitem enumerar `clientId` |
| 7 | LOW | `src/main.ts:46` | Swagger publico em producao, sem gate de ambiente |
| 8 | LOW | `src/infrastructure/auth/roles.guard.ts` | `RolesGuard` nunca aplicado, o RBAC e aparente |
| 9 | LOW | `src/domain/admin/admin.entity.ts:47` | Senha minima de 6 caracteres, sem rate limit no login |

## 5. Medidas de seguranca implementadas

Cada item abaixo foi verificado no codigo do commit `4126155`.

### 5.1 Autenticacao e credenciais

| Medida | Onde | Detalhe |
|---|---|---|
| Hash de senha com bcrypt | `src/domain/admin/admin.entity.ts:10` e `:51` | `SALT_ROUNDS = 10`, aplicado em `Admin.create`. A senha em texto nunca e atribuida a um campo da entidade |
| Comparacao de senha sem vazamento | `src/domain/admin/admin.entity.ts:36-38` | `bcrypt.compare`, que ja e de tempo constante |
| Resposta de login indistinguivel | `src/interfaces/http/auth/auth.controller.ts:116-123` | Email inexistente e senha errada retornam o mesmo `401 Invalid credentials`, sem revelar qual dos dois falhou |
| JWT com expiracao obrigatoria | `src/infrastructure/auth/jwt.strategy.ts:17` | `ignoreExpiration: false`. TTL padrao de 1h (`src/interfaces/http/auth/auth.module.ts:23`) |
| Token apenas no header | `src/infrastructure/auth/jwt.strategy.ts:16` | `ExtractJwt.fromAuthHeaderAsBearerToken()`, nao aceita token por query string, que vazaria em log de acesso |

### 5.2 Controle de acesso nas rotas

Todos os controllers administrativos exigem JWT:

| Controller | Guard |
|---|---|
| `src/interfaces/http/client/client.controller.ts:26` | `JwtAuthGuard` |
| `src/interfaces/http/vehicle/vehicle.controller.ts:24` | `JwtAuthGuard` |
| `src/interfaces/http/part/part.controller.ts:26` | `JwtAuthGuard` |
| `src/interfaces/http/service/service.controller.ts:25` | `JwtAuthGuard` |
| `src/interfaces/http/service-order/service-order.controller.ts:32` | `JwtAuthGuard` |
| `src/interfaces/http/budget/budget.controller.ts:25` | `JwtAuthGuard` |

Os tres controllers sem JWT sao deliberados e cada um tem seu proprio controle:
`/consult` verifica identidade e tem rate limit (5.4), `/webhooks` autentica por
segredo pre-compartilhado (5.3) e `/health` nao expoe dado nenhum (5.5). A
excecao nao intencional e `POST /auth/register`, achado 1 da secao 4.2.

### 5.3 Autenticacao de webhook, Fase 2

`src/interfaces/http/guards/webhook-auth.guard.ts`, aplicado em
`src/interfaces/http/webhook/webhook.controller.ts:21`.

O endpoint `POST /webhooks/service-orders/:id/status` permite que sistemas
externos sem login mudem o status de uma OS. O guard resolve tres problemas que
uma comparacao ingenua com `===` deixaria abertos:

- **Falha fechada** (`webhook-auth.guard.ts:41-44`). Sem `WEBHOOK_SECRET`
  configurada, o guard recusa toda chamada e loga o motivo. Comparar direto
  contra `process.env.WEBHOOK_SECRET` faria `undefined === undefined` retornar
  `true` numa instalacao mal configurada, deixando o endpoint aberto sem erro
  visivel. Este e o comportamento correto, e contrasta com o achado 2 da
  secao 4.2, onde o `JWT_SECRET` faz o oposto.
- **Comparacao em tempo constante** (`webhook-auth.guard.ts:80-84`). Compara os
  digests SHA-256 com `timingSafeEqual`, e nao os segredos crus. Usar
  `timingSafeEqual` direto sobre os segredos lancaria excecao quando os tamanhos
  diferissem, e esse throw revelaria o comprimento do segredo. O hash iguala os
  dois lados em 32 bytes sempre.
- **Resposta unica** (`webhook-auth.guard.ts:43` e `:50`). Segredo ausente,
  errado ou nao configurado devolvem o mesmo `401 Invalid webhook credentials`. O
  motivo real vai para o log do servidor.

O segredo e aceito preferencialmente em `Authorization: Bearer`
(`webhook-auth.guard.ts:66-69`), com o campo `token` do corpo como alternativa
para integracoes que nao permitem header customizado. A escolha esta documentada
no proprio DTO
(`src/interfaces/http/webhook/dtos/webhook-change-status.dto.ts:28-33`), inclusive
o motivo de o header ser preferivel.

Autenticar nao e o unico controle: a transicao de status passa pelo mesmo
`ChangeServiceOrderStatusUseCase` da rota autenticada
(`webhook.controller.ts:44`), entao a matriz de transicao da entidade continua
valendo. Vir de fora nao permite pular etapa.

Cobertura: `test/unit/interfaces/guards/webhook-auth.guard.spec.ts` e
`test/integration/webhook/webhook-status.integration.spec.ts`.

### 5.4 Endpoint publico de consulta

| Medida | Onde |
|---|---|
| Verificacao de titularidade por CPF/CNPJ | `src/interfaces/http/consult/consult.controller.ts:55-60` |
| Rate limit de 20 requisicoes por minuto por `clientId` | `src/interfaces/http/consult/consult.module.ts:15`, guard em `consult.controller.ts:23` |
| Resposta 429 com `Retry-After` | `src/interfaces/http/guards/rate-limit.guard.ts:117-121` |
| Acesso somente leitura | `consult.controller.ts:30`, a unica rota e um `GET` |

O store fica atras de um port abstrato (`rate-limit.guard.ts:19-31`), o que
permite trocar a implementacao em memoria por Redis sem tocar no guard. As
limitacoes da implementacao atual estao no achado 5 da secao 4.2.

### 5.5 Health check, Fase 2

`src/interfaces/http/health/health.controller.ts`, registrado em
`src/app.module.ts:30`.

Publico e sem JWT por necessidade: o `HEALTHCHECK` do Docker
(`Dockerfile:42-43`) e as probes do Kubernetes nao tem como apresentar
credenciais. A exposicao foi mantida minima de proposito. A resposta e
`{ status, database }` e nada mais (`health.controller.ts:6-9`), sem versao,
hostname, string de conexao ou stack trace. A checagem e um `SELECT 1`
(`health.controller.ts:60`), que valida o pool sem tocar em tabela de dominio, e
o erro real e engolido no `catch` (`health.controller.ts:62`) para nao virar
canal de vazamento. Retorna 503 quando o banco esta inacessivel
(`health.controller.ts:45-49`), para o orquestrador tirar a instancia do
balanceamento.

Cobertura: `test/unit/interfaces/health/health.controller.spec.ts`.

### 5.6 Validacao de entrada

| Medida | Onde |
|---|---|
| `ValidationPipe` global com `whitelist`, `forbidNonWhitelisted` e `transform` | `src/main.ts:18-24` |
| DTOs com `class-validator` em toda rota de escrita | `src/application/**/dtos/` e `src/interfaces/http/webhook/dtos/` |
| Status de webhook restrito ao enum do dominio | `src/interfaces/http/webhook/dtos/webhook-change-status.dto.ts:16` |
| CPF e CNPJ com digito verificador | `src/domain/client/cpf-cnpj.vo.ts:44-70`, rejeita tambem digitos repetidos (linha 46) |
| Placa nos formatos antigo e Mercosul | `src/domain/vehicle/plate.vo.ts:22-25` |

O `forbidNonWhitelisted` importa mais do que parece: campo nao declarado no DTO
faz a requisicao falhar com 400, em vez de ser silenciosamente ignorado. Isso
fecha a porta para mass assignment.

### 5.7 Tratamento de erro

`DomainExceptionFilter` (`src/interfaces/http/filters/domain-exception.filter.ts`),
registrado como filtro global em `src/app.module.ts:34-37`. Converte
`DomainException` em 400 com corpo fixo de tres campos
(`domain-exception.filter.ts:11-15`). Nao serializa a excecao inteira e nao expoe
stack trace.

### 5.8 Banco de dados

| Medida | Onde |
|---|---|
| `synchronize` desligado em producao | `src/infrastructure/database/typeorm/config/typeorm.config.ts:18` |
| Schema por migration versionada | `typeorm.config.ts:19-20`, `migrationsRun` ativo apenas em producao |
| Logging de query desligado | `typeorm.config.ts:21`, evita parametro sensivel em log |

`synchronize: true` em producao permitiria que uma mudanca de entidade alterasse
o schema sem revisao, inclusive derrubando coluna.

### 5.9 Container e composicao, endurecidos na Fase 2

| Medida | Onde | Motivo |
|---|---|---|
| Build multi-stage | `Dockerfile:7` e `:18` | Ferramenta de build e devDependencies ficam fora da imagem final (ver 2.4) |
| Imagem base com versao exata | `Dockerfile:4` | `node:20.20.2-alpine`. Tag flutuante muda de patch sem aviso e torna o scan nao reproduzivel |
| Usuario nao-root | `Dockerfile:28-29` e `:36` | Roda como `nestjs`, uid 1001. Confirmado no container: `uid=1001(nestjs)` |
| `tini` como PID 1 | `Dockerfile:26` e `:45` | Encaminha SIGTERM ao Node e faz reap de zumbis. Sem isso o container so morre no SIGKILL, derrubando conexao em rolling update |
| Shutdown gracioso | `src/main.ts:12` | `enableShutdownHooks()`, fecha servidor HTTP e pool do TypeORM antes de sair |
| `HEALTHCHECK` | `Dockerfile:42-43` | Usa o `wget` do busybox, sem dependencia extra |
| Segredos fora do contexto de build | `.dockerignore:34-36` | `.env` e `.env.*` nunca chegam ao daemon |
| Segredos obrigatorios no compose | `docker-compose.yml:12`, `:59`, `:60`, `:65` | `DB_PASS`, `JWT_SECRET` e `WEBHOOK_SECRET` usam `${VAR:?erro}`, sem default. O compose falha na hora em vez de subir com senha conhecida |
| Postgres em loopback | `docker-compose.yml:20` | Bind padrao `127.0.0.1`, o banco nao fica exposto na rede da maquina |
| Limites de recurso | `docker-compose.yml:34-41` e `:73-80` | 1 CPU e 512M por servico, contem o efeito de um DoS de recurso |

### 5.10 Seguranca no pipeline

`.github/workflows/ci.yml`, job `security`, dispara em todo push e PR para `main`:

- `npm audit --audit-level=high`
- Trivy contra a imagem, severidade `CRITICAL,HIGH`, resultado publicado como
  artefato

O job reusa o tarball produzido pelo job `build`, entao escaneia exatamente a
imagem que o pipeline construiu, e nao uma reconstrucao.

Limitacao conhecida: os dois passos rodam com `|| true` e `exit-code: '0'`, ou
seja, reportam sem quebrar o build. Tratado na secao 6.2.

## 6. Recomendacoes para producao

### 6.1 Correcoes de codigo, em ordem de prioridade

Estes sao os achados da revisao manual da secao 4.2. Nenhum foi corrigido neste
PR, que e de documentacao.

**1. CRITICAL. `POST /auth/register` esta aberto para qualquer pessoa.**
`src/interfaces/http/auth/auth.controller.ts:87-107`.

O controller nao tem guard na classe nem no metodo, ao contrario de todos os
outros controllers administrativos (ver 5.2). Qualquer pessoa com acesso de rede
a API cria uma conta de administrador com privilegio total, e em seguida usa
`POST /auth/login` para obter um JWT valido. A partir dai tem acesso completo aos
dados de clientes, incluindo CPF e CNPJ, veiculos, ordens de servico, orcamentos
e estoque. A rota esta documentada no Swagger publico (achado 7), o que remove
ate a necessidade de descobri-la.

Correcao: exigir `@UseGuards(JwtAuthGuard)` no metodo `register`, de modo que so
um admin autenticado crie outro admin. Se houver necessidade de bootstrap do
primeiro administrador, faze-lo por comando de CLI ou migration, nunca por rota
HTTP aberta.

**2. HIGH. `JWT_SECRET` tem valor padrao embutido no codigo.**
`src/infrastructure/auth/jwt.strategy.ts:18` e
`src/interfaces/http/auth/auth.module.ts:20`.

```typescript
secretOrKey: config.get<string>('JWT_SECRET', 'dev-secret-key-do-not-use-in-production')
```

Se a variavel nao estiver definida, a aplicacao sobe normalmente e passa a
assinar e validar tokens com um segredo que esta publicado neste repositorio.
Quem tiver o segredo forja um JWT de admin e nao precisa nem de senha. O
`docker-compose.yml:60` exige a variavel, mas isso cobre so aquele caminho:
`npm run start:prod`, um deploy Kubernetes sem a env definida ou qualquer outro
runner caem no valor padrao, em silencio.

O projeto ja tem o padrao correto para isso. O `WebhookAuthGuard` falha fechado
de proposito quando o segredo esta ausente (5.3). O `JWT_SECRET` deveria seguir a
mesma regra.

Correcao: remover o segundo argumento do `config.get`, validar na inicializacao e
abortar o boot se a variavel estiver ausente ou vazia. Um servico que sobe calado
sem segredo e pior que um que falha na hora.

**3. HIGH. Seed automatico de admin com credencial publicada.**
`src/interfaces/http/auth/auth.controller.ts:68` e `:75-85`.

O construtor do controller chama `seedDefaultAdmin()`, que cria
`admin@oficina.com` com senha `admin123` se ainda nao existir. Nao ha nenhuma
verificacao de ambiente: isso roda igual com `NODE_ENV=production`. A credencial
esta neste repositorio e tambem no exemplo do Swagger
(`auth.controller.ts:17` e `:22`).

Ha um segundo problema no mesmo ponto: a chamada na linha 68 nao tem `await` e o
retorno nao e tratado. Se o seed falhar, a rejeicao fica sem tratamento, contra a
regra de nunca engolir excecao.

Correcao: condicionar o seed a `NODE_ENV !== 'production'`, ou remove-lo e criar
o primeiro admin por migration com senha vinda de variavel de ambiente. Tirar o
efeito colateral do construtor e trata-lo em um hook de ciclo de vida.

**4. MEDIUM. CORS liberado para qualquer origem.** `src/main.ts:16`. Finding do
Semgrep, analise completa em 4.1.

Correcao: `app.enableCors({ origin: process.env.CORS_ORIGINS?.split(','), credentials: false })`,
com a lista de dominios do frontend por ambiente.

**5. MEDIUM. Rate limit contornavel, e crescimento sem limite do store.**
`src/interfaces/http/guards/rate-limit.guard.ts:113` e `:50`.

A chave e o `clientId` da propria URL:

```typescript
const key: string = request.params?.clientId ?? request.ip ?? 'global';
```

Isso protege bem o caso pretendido, forca bruta de CPF contra um `clientId` fixo.
Mas um atacante que varie o `clientId` recebe um bucket novo a cada valor, e fica
sem limite efetivo para enumerar clientes. Combinado com o achado 6, e o que
torna a enumeracao viavel.

O `Map` de buckets (`rate-limit.guard.ts:50`) nunca remove entrada expirada. Cada
`clientId` novo cria um bucket permanente, entao um atacante enviando
identificadores aleatorios faz a memoria do processo crescer sem limite, o que e
um DoS por exaustao de memoria.

Terceiro ponto, ja previsto pelo port abstrato mas nao resolvido: o estado vive
no processo. Com N replicas o limite efetivo vira N vezes 20.

Correcao: aplicar limite composto por IP e por `clientId`, com o de IP como teto;
expurgar buckets expirados, por TTL ou varredura periodica; e implementar o
`RateLimitStore` sobre Redis para o limite valer no cluster inteiro.

**6. MEDIUM. Enumeracao de `clientId` pela diferenca de resposta.**
`src/interfaces/http/consult/consult.controller.ts:50-60`.

`clientId` inexistente retorna `404 Client not found`, enquanto `clientId` valido
com CPF errado retorna `403 CPF/CNPJ does not match this client`. A diferenca
confirma quais identificadores existem no sistema, sem precisar acertar o
CPF/CNPJ.

Correcao: retornar a mesma resposta nos dois casos, um 404 generico, do mesmo
modo que o login ja faz (5.1) e que o `WebhookAuthGuard` faz (5.3).

**7. LOW. Swagger publico em producao.** `src/main.ts:45-46`.

`SwaggerModule.setup('api-docs', app, document)` roda sem gate de ambiente e sem
autenticacao. Expoe todas as rotas, o formato dos DTOs e os exemplos, incluindo a
credencial do seed. Nao e vulnerabilidade por si, mas reduz a quase zero o custo
de reconhecimento para explorar os achados 1 e 3.

Correcao: registrar o Swagger apenas quando `NODE_ENV !== 'production'`, ou
proteger a rota com autenticacao.

**8. LOW. `RolesGuard` existe mas nunca e aplicado.**
`src/infrastructure/auth/roles.guard.ts` e
`src/infrastructure/auth/roles.decorator.ts`.

Busca em `src/` mostra que `RolesGuard` e `@Roles` nao aparecem em nenhum
controller. O RBAC e aparente. O risco pratico e futuro: alguem anota
`@Roles('admin')` em uma rota achando que restringiu acesso, mas sem
`@UseGuards(RolesGuard)` a anotacao nao tem efeito nenhum, e a falha e silenciosa.

Correcao: aplicar `RolesGuard` junto do `JwtAuthGuard` onde houver papel a
distinguir, ou remover o scaffold ate existir um segundo papel.

**9. LOW. Politica de senha fraca e login sem rate limit.**
`src/domain/admin/admin.entity.ts:47` e
`src/interfaces/http/auth/auth.controller.ts:41`.

Minimo de 6 caracteres, sem requisito de complexidade e sem bloqueio por
tentativa. O `RateLimitGuard` esta apenas no `/consult`
(`consult.controller.ts:23`), entao `POST /auth/login` aceita tentativas
ilimitadas. O bcrypt com 10 rounds encarece o ataque, mas nao o impede.

Correcao: elevar o minimo para 12 caracteres, aplicar rate limit por IP no login
e adicionar bloqueio temporario apos N falhas.

### 6.2 Infraestrutura e imagem

- **Aplicar o hardening validado na secao 3.5.** `apk upgrade` mais remocao do
  npm do estagio de runtime leva a imagem de 57 para 0 findings, com a aplicacao
  intacta. Decidir antes como preservar a reprodutibilidade do `Dockerfile:4`,
  fixando as versoes dos pacotes atualizados ou bumpando a tag base.
- **Quebrar o build no CI quando houver CRITICAL ou HIGH.** Hoje o job `security`
  roda `npm audit ... || true` e Trivy com `exit-code: '0'`, ou seja, so reporta.
  Com a arvore de dependencias em zero, este e o momento barato de tornar o gate
  obrigatorio, antes que uma regressao passe despercebida.
- **Reexecutar os tres scans a cada release** e atualizar este relatorio, para que
  os numeros nao envelhecam em silencio.

### 6.3 Gestao de segredos

- Tirar segredo de variavel de ambiente em texto e mover para um gerenciador
  dedicado. Em Kubernetes, `Secret` montado como volume, de preferencia via
  External Secrets ligado a um cofre.
- Rotacionar `JWT_SECRET` e `WEBHOOK_SECRET` periodicamente. Para o JWT, aceitar
  duas chaves durante a janela de rotacao evita invalidar todos os tokens de uma
  vez.
- Trocar as credenciais padrao antes de qualquer exposicao real: o admin do seed
  (achado 3) e os defaults de banco em
  `src/infrastructure/database/typeorm/config/typeorm.config.ts:9-13`, que fazem
  a aplicacao tentar conectar com `postgres/postgres` em vez de falhar quando as
  variaveis estao ausentes.

### 6.4 Rede e transporte

- TLS terminado no ingress, com redirecionamento de HTTP para HTTPS e HSTS.
- WAF a frente da API, com regras para os padroes comuns do OWASP Top 10.
- Habilitar TLS na conexao com o Postgres. O `typeorm.config.ts:7-22` nao define
  a opcao `ssl`, entao o trafego entre aplicacao e banco vai em texto claro.
- Restringir o trafego entre pods com NetworkPolicy, de modo que so a aplicacao
  alcance a porta do banco.
- Adicionar `helmet` para os cabecalhos de resposta padrao
  (`X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, entre outros),
  hoje ausentes.

### 6.5 Observabilidade

- Log estruturado de evento de seguranca: falha de login, 401 de webhook, 429 de
  rate limit. Hoje o `WebhookAuthGuard` ja loga o motivo real da recusa
  (`webhook-auth.guard.ts:42`), que e o comportamento desejado, mas nao ha
  agregacao nem alerta.
- Alerta sobre taxa anormal de 401 e 429, que e o sinal de forca bruta em
  andamento.
- Trilha de auditoria para mudanca de status de OS, guardando origem e ator. O
  `changedBy` ja e obrigatorio no webhook
  (`webhook-change-status.dto.ts:24-26`), o que da a base para isso.
- Nunca logar corpo de requisicao do endpoint de webhook, porque o segredo pode
  vir no campo `token`. E o motivo documentado de o header ser a forma preferida
  (`webhook-auth.guard.ts:56-61`).

## Como reproduzir estes scans

```bash
# Dependencias
npm audit --omit=dev          # producao
npm audit                     # producao mais desenvolvimento

# Imagem de container
docker build -t soat-tech-challenge:latest .
trivy image --scanners vuln soat-tech-challenge:latest

# Codigo
semgrep --config auto src/
```

Os scripts equivalentes estao no `package.json`: `security:audit`,
`security:container` e `security:sast`.

Os numeros de dependencia e de imagem mudam conforme novas vulnerabilidades sao
publicadas. Um resultado diferente do registrado aqui nao significa erro deste
relatorio, significa que a base de advisories avancou desde 25/08/2026.
