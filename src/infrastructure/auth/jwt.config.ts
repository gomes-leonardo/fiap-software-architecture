import { ConfigService } from '@nestjs/config';
import { JwtModuleOptions, JwtSignOptions } from '@nestjs/jwt';

const MISSING_SECRET_MESSAGE =
  'JWT_SECRET nao configurada: defina a variavel antes de subir a aplicacao ' +
  '(cp .env.example .env). Em producao, gere um valor aleatorio: openssl rand -base64 48.';

/**
 * Unico ponto que decide qual segredo assina e valida os JWTs da aplicacao.
 *
 * Ele existe para nao haver default. Um fallback como
 * `config.get('JWT_SECRET', 'dev-secret-key-do-not-use-in-production')` deixa a
 * aplicacao subir normalmente quando a variavel falta, assinando token com um
 * segredo que esta publicado neste repositorio: qualquer pessoa forja um JWT de
 * admin valido, e nao ha nada no log que denuncie o estado. Um `start:prod` ou
 * um deploy no Kubernetes sem a env cai exatamente nesse caso — o
 * `docker-compose` e o unico caminho que ja exigia a variavel.
 *
 * Falhar no boot troca uma brecha silenciosa por um erro barulhento antes de a
 * primeira requisicao ser atendida. E o mesmo criterio do `WebhookAuthGuard`,
 * que recusa toda chamada quando o `WEBHOOK_SECRET` nao esta configurado.
 */
export function resolveJwtSecret(config: ConfigService): string {
  const secret = config.get<string>('JWT_SECRET');

  if (!secret) {
    throw new Error(MISSING_SECRET_MESSAGE);
  }

  return secret;
}

export function buildJwtModuleOptions(config: ConfigService): JwtModuleOptions {
  return {
    secret: resolveJwtSecret(config),
    // Value comes from env, so it can't be checked against the `ms` string literal union.
    signOptions: {
      expiresIn: config.get<string>('JWT_EXPIRES_IN', '1h') as JwtSignOptions['expiresIn'],
    },
  };
}
