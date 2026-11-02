type Env = Record<string, string | undefined>;

/**
 * Origens liberadas para CORS, de CORS_ORIGINS separado por virgula. Vazio
 * significa nenhuma: a API e consumida servidor a servidor e pelo gateway, e
 * so um front-end declarado precisa ler respostas de outra origem no browser.
 */
export function corsOrigins(env: Env): string[] {
  return (env.CORS_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
}

/**
 * O Swagger publica o mapa inteiro da API, rotas de webhook incluidas. Fica
 * ligado por padrao fora de producao e desligado em producao, e
 * SWAGGER_ENABLED vence nos dois sentidos (a homologacao liga explicitamente).
 */
export function isSwaggerEnabled(env: Env): boolean {
  if (env.SWAGGER_ENABLED === 'true') return true;
  if (env.SWAGGER_ENABLED === 'false') return false;
  return env.NODE_ENV !== 'production';
}
