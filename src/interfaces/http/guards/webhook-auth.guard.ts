import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, timingSafeEqual } from 'crypto';

const BEARER_PREFIX = 'Bearer ';

/**
 * Autentica sistemas externos que nao tem login: eles apresentam um segredo
 * pre-compartilhado (`WEBHOOK_SECRET`) em vez de um JWT.
 *
 * Tres decisoes que o `===` ingenuo erraria:
 *
 * 1. **Falha fechada.** Sem `WEBHOOK_SECRET` configurada, o guard recusa tudo.
 *    Comparar direto com `process.env.WEBHOOK_SECRET` faria `undefined ===
 *    undefined` dar `true` numa instalacao mal configurada: o endpoint que
 *    muda status de OS ficaria aberto para qualquer um, sem nenhum erro visivel.
 *
 * 2. **Comparacao de tempo constante.** `===` sai no primeiro byte diferente,
 *    e a diferenca de tempo entre "errou no primeiro caractere" e "errou no
 *    ultimo" permite descobrir o segredo caractere a caractere.
 *
 * 3. **Resposta unica.** Segredo errado, ausente ou nao configurado devolvem o
 *    mesmo 401 generico. Distinguir os casos entrega ao atacante um mapa do que
 *    tentar em seguida; o motivo real vai para o log do servidor.
 */
@Injectable()
export class WebhookAuthGuard implements CanActivate {
  private readonly logger = new Logger(WebhookAuthGuard.name);

  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const secret = this.configService.get<string>('WEBHOOK_SECRET');

    if (!secret) {
      this.logger.error('WEBHOOK_SECRET nao configurada: recusando toda chamada de webhook.');
      throw new UnauthorizedException('Invalid webhook credentials');
    }

    const request = context.switchToHttp().getRequest();
    const presented = this.extractToken(request);

    if (!presented || !this.matchesSecret(presented, secret)) {
      throw new UnauthorizedException('Invalid webhook credentials');
    }

    return true;
  }

  /**
   * Header primeiro, body como alternativa. O header e preferivel: corpo de
   * requisicao costuma acabar em log de acesso e em dump de erro, e o segredo
   * vaza junto. O campo `token` existe porque nem todo sistema externo permite
   * customizar cabecalhos.
   */
  private extractToken(request: {
    headers?: Record<string, unknown>;
    body?: Record<string, unknown>;
  }): string | null {
    const header = request.headers?.authorization;
    if (typeof header === 'string' && header.startsWith(BEARER_PREFIX)) {
      return header.slice(BEARER_PREFIX.length);
    }

    const bodyToken = request.body?.token;
    return typeof bodyToken === 'string' && bodyToken.length > 0 ? bodyToken : null;
  }

  /**
   * Compara os digests SHA-256, nao os segredos crus: `timingSafeEqual` lanca
   * quando os buffers tem tamanhos diferentes, e esse throw revelaria o
   * comprimento do segredo. O hash deixa os dois lados com 32 bytes sempre.
   */
  private matchesSecret(presented: string, expected: string): boolean {
    const presentedDigest = createHash('sha256').update(presented).digest();
    const expectedDigest = createHash('sha256').update(expected).digest();
    return timingSafeEqual(presentedDigest, expectedDigest);
  }
}
