import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { OpenAPIObject } from '@nestjs/swagger';

type PathItem = OpenAPIObject['paths'][string];
type Operation = NonNullable<PathItem['get']>;
type Parameter = Exclude<NonNullable<Operation['parameters']>[number], { $ref: string }>;
type RequestBody = Exclude<NonNullable<Operation['requestBody']>, { $ref: string }>;
type ApiResponse = Exclude<NonNullable<Operation['responses'][string]>, { $ref: string }>;
type Schemas = NonNullable<NonNullable<OpenAPIObject['components']>['schemas']>;
type SchemaOrRef = Schemas[string];

interface PostmanUrl {
  raw: string;
  host: string[];
  path: string[];
  variable?: { key: string; value: string; description?: string }[];
  query?: { key: string; value: string; disabled?: boolean; description?: string }[];
}

interface PostmanHeader {
  key: string;
  value: string;
  description?: string;
}

interface PostmanRequest {
  method: string;
  header: PostmanHeader[];
  url: PostmanUrl;
  description?: string;
  auth?: { type: 'noauth' };
  body?: { mode: 'raw'; raw: string; options: { raw: { language: 'json' } } };
}

interface PostmanResponse {
  name: string;
  originalRequest: PostmanRequest;
  status: string;
  code: number;
  header: PostmanHeader[];
  body: string;
  _postman_previewlanguage: string;
}

interface PostmanItem {
  name: string;
  request: PostmanRequest;
  response: PostmanResponse[];
}

interface PostmanFolder {
  name: string;
  description?: string;
  item: PostmanItem[];
}

const SPEC_PATH = join(__dirname, '..', 'docs', 'swagger.json');
const OUTPUT_PATH = join(__dirname, '..', 'docs', 'postman-collection.json');

/**
 * Fixo de proposito: o Postman usa este id para reconhecer a collection ao
 * reimportar. Gerar um id novo a cada execucao criaria uma collection duplicada
 * e sujaria o diff a cada regeracao.
 */
const COLLECTION_ID = '6f0f4a4e-3f2c-4d1b-9a55-7c1e2b0f9d41';

const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete'] as const;

/**
 * Ordem e nomes das pastas. As tags do OpenAPI sao minusculas e tecnicas; aqui
 * viram os nomes de recurso que a issue pede. Uma tag fora desta lista vira uma
 * pasta com o proprio nome, para nenhum endpoint sumir da collection.
 */
const FOLDER_NAMES: Record<string, string> = {
  auth: 'Auth',
  clients: 'Clients',
  vehicles: 'Vehicles',
  parts: 'Parts',
  services: 'Services',
  'service-orders': 'Service Orders',
  budgets: 'Budgets',
  consult: 'Consult',
  webhooks: 'Webhooks',
  health: 'Health',
};

const STATUS_TEXTS: Record<string, string> = {
  '200': 'OK',
  '201': 'Created',
  '204': 'No Content',
  '400': 'Bad Request',
  '401': 'Unauthorized',
  '403': 'Forbidden',
  '404': 'Not Found',
  '503': 'Service Unavailable',
};

const UUID_PLACEHOLDER = '00000000-0000-0000-0000-000000000000';

function isRef(schema: SchemaOrRef): schema is { $ref: string } {
  return '$ref' in schema;
}

function deref(spec: OpenAPIObject, schema: SchemaOrRef): SchemaOrRef | undefined {
  if (!isRef(schema)) {
    return schema;
  }
  const name = schema.$ref.replace('#/components/schemas/', '');
  return spec.components?.schemas?.[name];
}

/**
 * Monta um corpo de exemplo a partir do schema. Usa o que o spec declara
 * (`example`, `enum`, `format`) e cai em placeholders por tipo quando o DTO nao
 * documenta exemplo — inventar dado plausivel aqui seria mentir sobre o que a
 * API descreve. `visited` corta schemas recursivos.
 */
function buildExample(spec: OpenAPIObject, schema: SchemaOrRef, visited: Set<string>): unknown {
  if (isRef(schema)) {
    if (visited.has(schema.$ref)) {
      return null;
    }
    const resolved = deref(spec, schema);
    if (!resolved) {
      return null;
    }
    return buildExample(spec, resolved, new Set([...visited, schema.$ref]));
  }

  if (schema.example !== undefined) {
    return schema.example;
  }
  if (Array.isArray(schema.enum) && schema.enum.length > 0) {
    return schema.enum[0];
  }

  switch (schema.type) {
    case 'array':
      return schema.items ? [buildExample(spec, schema.items as SchemaOrRef, visited)] : [];
    case 'object': {
      const properties = schema.properties ?? {};
      return Object.fromEntries(
        Object.entries(properties).map(([name, property]) => [
          name,
          buildExample(spec, property as SchemaOrRef, visited),
        ]),
      );
    }
    case 'integer':
    case 'number':
      return 0;
    case 'boolean':
      return true;
    case 'string':
      if (schema.format === 'date-time') {
        return '2026-01-01T00:00:00.000Z';
      }
      return schema.format === 'uuid' ? UUID_PLACEHOLDER : 'string';
    default:
      return null;
  }
}

function jsonBody(spec: OpenAPIObject, schema: SchemaOrRef): string {
  return JSON.stringify(buildExample(spec, schema, new Set()), null, 2);
}

function parameterValue(spec: OpenAPIObject, parameter: Parameter): string {
  const example = parameter.schema
    ? buildExample(spec, parameter.schema as SchemaOrRef, new Set())
    : null;
  if (typeof example === 'string' && example !== 'string') {
    return example;
  }
  return parameter.name.toLowerCase().endsWith('id') ? UUID_PLACEHOLDER : 'string';
}

function buildUrl(spec: OpenAPIObject, path: string, parameters: Parameter[]): PostmanUrl {
  const segments = path
    .split('/')
    .filter(Boolean)
    .map((segment) => (segment.startsWith('{') ? `:${segment.slice(1, -1)}` : segment));

  const variables = parameters
    .filter((parameter) => parameter.in === 'path')
    .map((parameter) => ({
      key: parameter.name,
      value: parameterValue(spec, parameter),
      description: parameter.description,
    }));

  const query = parameters
    .filter((parameter) => parameter.in === 'query')
    .map((parameter) => ({
      key: parameter.name,
      value: parameterValue(spec, parameter),
      description: parameter.description,
      disabled: parameter.required !== true,
    }));

  const queryString =
    query.length > 0 ? `?${query.map((q) => `${q.key}=${q.value}`).join('&')}` : '';

  const url: PostmanUrl = {
    raw: `{{base_url}}/${segments.join('/')}${queryString}`,
    host: ['{{base_url}}'],
    path: segments,
  };
  if (variables.length > 0) {
    url.variable = variables;
  }
  if (query.length > 0) {
    url.query = query;
  }
  return url;
}

function buildHeaders(spec: OpenAPIObject, parameters: Parameter[], hasBody: boolean) {
  const headers: PostmanHeader[] = [];
  if (hasBody) {
    headers.push({ key: 'Content-Type', value: 'application/json' });
  }
  for (const parameter of parameters.filter((p) => p.in === 'header')) {
    // O webhook nao usa o JWT dos admins: apresenta o WEBHOOK_SECRET no mesmo
    // header. Sem uma variavel propria a requisicao chega inutilizavel.
    const value =
      parameter.name.toLowerCase() === 'authorization'
        ? 'Bearer {{webhook_secret}}'
        : parameterValue(spec, parameter);
    headers.push({ key: parameter.name, value, description: parameter.description });
  }
  return headers;
}

function buildRequest(
  spec: OpenAPIObject,
  path: string,
  method: string,
  operation: Operation,
): PostmanRequest {
  const parameters = (operation.parameters ?? []) as Parameter[];
  const requestBody = operation.requestBody as RequestBody | undefined;
  const bodySchema = requestBody?.content?.['application/json']?.schema;

  const request: PostmanRequest = {
    method: method.toUpperCase(),
    header: buildHeaders(spec, parameters, Boolean(bodySchema)),
    url: buildUrl(spec, path, parameters),
  };

  if (operation.description) {
    request.description = operation.description;
  }
  if (!operation.security || operation.security.length === 0) {
    request.auth = { type: 'noauth' };
  }
  if (bodySchema) {
    request.body = {
      mode: 'raw',
      raw: jsonBody(spec, bodySchema as SchemaOrRef),
      options: { raw: { language: 'json' } },
    };
  }
  return request;
}

function buildResponses(
  spec: OpenAPIObject,
  operation: Operation,
  request: PostmanRequest,
): PostmanResponse[] {
  const responses = Object.entries(operation.responses) as [string, ApiResponse][];

  return responses.map(([code, response]) => {
    const schema = response.content?.['application/json']?.schema;
    const body = schema ? jsonBody(spec, schema as SchemaOrRef) : '';
    return {
      name: response.description || `HTTP ${code}`,
      originalRequest: request,
      status: STATUS_TEXTS[code] ?? '',
      code: Number(code),
      header: body ? [{ key: 'Content-Type', value: 'application/json' }] : [],
      body,
      _postman_previewlanguage: body ? 'json' : 'text',
    };
  });
}

function buildFolders(spec: OpenAPIObject): PostmanFolder[] {
  const byTag = new Map<string, PostmanItem[]>();

  for (const [path, pathItem] of Object.entries(spec.paths)) {
    for (const method of HTTP_METHODS) {
      const operation = pathItem[method];
      if (!operation) {
        continue;
      }
      const request = buildRequest(spec, path, method, operation);
      const item: PostmanItem = {
        name: operation.summary || `${method.toUpperCase()} ${path}`,
        request,
        response: buildResponses(spec, operation, request),
      };
      const tag = operation.tags?.[0] ?? 'other';
      const items = byTag.get(tag);
      if (items) {
        items.push(item);
      } else {
        byTag.set(tag, [item]);
      }
    }
  }

  const known = Object.keys(FOLDER_NAMES).filter((tag) => byTag.has(tag));
  const unknown = [...byTag.keys()].filter((tag) => !(tag in FOLDER_NAMES)).sort();

  return [...known, ...unknown].map((tag) => ({
    name: FOLDER_NAMES[tag] ?? tag,
    description: spec.tags?.find((declared) => declared.name === tag)?.description,
    item: byTag.get(tag) as PostmanItem[],
  }));
}

function buildCollection(spec: OpenAPIObject) {
  return {
    info: {
      _postman_id: COLLECTION_ID,
      name: `${spec.info.title} API`,
      description: `${spec.info.description}\n\nGerado a partir de docs/swagger.json por scripts/generate-postman-collection.ts. Nao edite a mao.`,
      schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
    },
    auth: {
      type: 'bearer',
      bearer: [{ key: 'token', value: '{{token}}', type: 'string' }],
    },
    variable: [
      { key: 'base_url', value: 'http://localhost:3000', type: 'string' },
      { key: 'token', value: '', type: 'string' },
      { key: 'webhook_secret', value: '', type: 'string' },
    ],
    item: buildFolders(spec),
  };
}

function main(): void {
  const spec = JSON.parse(readFileSync(SPEC_PATH, 'utf8')) as OpenAPIObject;
  const collection = buildCollection(spec);

  writeFileSync(OUTPUT_PATH, `${JSON.stringify(collection, null, 2)}\n`, 'utf8');

  const requests = collection.item.reduce((total, folder) => total + folder.item.length, 0);
  console.log(
    `Collection do Postman gravada em ${OUTPUT_PATH} (${collection.item.length} pastas, ${requests} requisições)`,
  );
}

main();
