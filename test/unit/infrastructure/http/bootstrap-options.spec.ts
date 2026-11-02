import { corsOrigins, isSwaggerEnabled } from '@infrastructure/http/bootstrap-options';

describe('corsOrigins', () => {
  it('nao libera nenhuma origem quando CORS_ORIGINS nao esta definida', () => {
    expect(corsOrigins({})).toEqual([]);
  });

  it('le a allowlist separada por virgula, ignorando espacos e entradas vazias', () => {
    expect(corsOrigins({ CORS_ORIGINS: ' https://a.com, ,https://b.com ' })).toEqual([
      'https://a.com',
      'https://b.com',
    ]);
  });
});

describe('isSwaggerEnabled', () => {
  it.each([
    [{ NODE_ENV: 'development' }, true],
    [{ NODE_ENV: 'production' }, false],
    [{ NODE_ENV: 'production', SWAGGER_ENABLED: 'true' }, true],
    [{ NODE_ENV: 'development', SWAGGER_ENABLED: 'false' }, false],
  ])('com %j responde %s', (env, expected) => {
    expect(isSwaggerEnabled(env)).toBe(expected);
  });
});
