# Documentação de API

Os dois arquivos deste diretório são **gerados**, não escritos à mão. Não edite
nenhum dos dois: a próxima regeração desfaz a edição.

| Arquivo | O que é | Quem gera |
| --- | --- | --- |
| `swagger.json` | Spec OpenAPI 3.0 da API, extraído do próprio código pelos decorators do `@nestjs/swagger` | `scripts/export-swagger.ts` |
| `postman-collection.json` | Collection Postman v2.1, derivada do `swagger.json` | `scripts/generate-postman-collection.ts` |

## Como regerar

```bash
npm run docs:api
```

Equivale a `npm run docs:swagger && npm run docs:postman` — a collection lê o
`swagger.json`, então a ordem importa.

**Não precisa de banco de dados nem de variáveis de ambiente.** O
`export-swagger.ts` monta o grafo de módulos do Nest só para ler os metadados
dos controllers e substitui o `DataSource` do TypeORM por uma instância não
inicializada, sem conexão. Roda em CI, em máquina limpa, offline.

O único requisito é ter as dependências instaladas (`npm ci`).

A saída é determinística: rodar duas vezes seguidas produz bytes idênticos. Se
um `npm run docs:api` sujar o `git status` sem que nenhum controller tenha
mudado, é bug do gerador, não ruído esperado.

## Este spec é um snapshot

O `swagger.json` descreve a `main` no momento em que foi gerado — não é
atualizado sozinho. Sempre que um endpoint for adicionado, removido ou tiver a
assinatura alterada, rode `npm run docs:api` e commite os dois arquivos junto
com a mudança.

Enquanto o spec não é regerado, a fonte da verdade em runtime continua sendo o
Swagger UI da aplicação:

```
http://localhost:3000/api-docs        # UI
http://localhost:3000/api-docs-json   # o mesmo spec, servido pela app
```

## Usando a collection do Postman

1. Importe `postman-collection.json` no Postman (File > Import).
2. Ajuste a variável `base_url` se a API não estiver em `http://localhost:3000`.
3. Rode **Auth > Autenticar administrador**. O ambiente do MVP já sobe com o
   admin padrão `admin@oficina.com` / `admin123`.
4. Copie o `access_token` da resposta para a variável `token`. Todas as pastas
   herdam o Bearer da collection; os endpoints públicos (`Auth`, `Consult`,
   `Health`, `Webhooks`) estão marcados como `noauth` e ignoram o token.
5. `Webhooks` usa credencial própria: preencha `webhook_secret` com o valor de
   `WEBHOOK_SECRET` do servidor.

As variáveis ficam vazias no arquivo de propósito — segredo em repositório é
segredo vazado.

### Sobre os exemplos

Os corpos de request e response vêm dos `@ApiProperty({ example })` dos DTOs.
Onde o DTO não declara exemplo, o gerador usa um placeholder do tipo
(`"string"`, `0`, `true`), em vez de inventar um dado plausível que não está
documentado em lugar nenhum. Exemplo pobre na collection significa DTO sem
`example` no `src/` — o conserto é lá.

## Por que um gerador próprio e não um conversor

`npx openapi-to-postmanv2 -s docs/swagger.json -o docs/postman-collection.json -p -O folderStrategy=Tags`
converte o spec, mas gera um UUID novo para a collection e para cada requisição
a cada execução (todo diff vira o arquivo inteiro), nomeia as variáveis como
`baseUrl` em vez de `base_url`, não cria a variável `token` nem liga o Bearer, e
usa `<string>` no lugar dos exemplos dos DTOs. O gerador daqui não tem
dependência nova, é determinístico e produz as pastas e variáveis que a issue
pede. O conversor continua útil para outros formatos (Insomnia, por exemplo).
