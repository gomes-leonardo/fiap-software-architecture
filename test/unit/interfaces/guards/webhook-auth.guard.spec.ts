import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WebhookAuthGuard } from '@interfaces/http/guards/webhook-auth.guard';

const SECRET = 'segredo-do-webhook-bem-longo';

function contextWith(request: unknown): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

function guardWithSecret(secret: string | undefined): WebhookAuthGuard {
  const configService = { get: jest.fn().mockReturnValue(secret) } as unknown as ConfigService;
  return new WebhookAuthGuard(configService);
}

describe('WebhookAuthGuard', () => {
  describe('quando o segredo confere', () => {
    it('aceita o segredo no header Authorization', () => {
      const guard = guardWithSecret(SECRET);

      const allowed = guard.canActivate(
        contextWith({ headers: { authorization: `Bearer ${SECRET}` }, body: {} }),
      );

      expect(allowed).toBe(true);
    });

    it('aceita o segredo no campo token do corpo', () => {
      const guard = guardWithSecret(SECRET);

      const allowed = guard.canActivate(contextWith({ headers: {}, body: { token: SECRET } }));

      expect(allowed).toBe(true);
    });

    it('prefere o header quando o corpo traz um token diferente', () => {
      const guard = guardWithSecret(SECRET);

      expect(() =>
        guard.canActivate(
          contextWith({ headers: { authorization: 'Bearer errado' }, body: { token: SECRET } }),
        ),
      ).toThrow(UnauthorizedException);
    });
  });

  describe('quando o segredo nao confere', () => {
    it.each([
      ['segredo errado', { headers: { authorization: 'Bearer errado' }, body: {} }],
      ['sem credencial nenhuma', { headers: {}, body: {} }],
      ['header sem o prefixo Bearer', { headers: { authorization: SECRET }, body: {} }],
      ['token vazio no corpo', { headers: {}, body: { token: '' } }],
      ['token nao textual no corpo', { headers: {}, body: { token: 12345 } }],
    ])('recusa: %s', (_caso, request) => {
      const guard = guardWithSecret(SECRET);

      expect(() => guard.canActivate(contextWith(request))).toThrow(UnauthorizedException);
    });

    it('recusa um prefixo correto do segredo', () => {
      const guard = guardWithSecret(SECRET);

      expect(() =>
        guard.canActivate(
          contextWith({ headers: { authorization: `Bearer ${SECRET.slice(0, -1)}` }, body: {} }),
        ),
      ).toThrow(UnauthorizedException);
    });
  });

  /**
   * O caso que motiva o guard existir. Comparar direto com
   * `process.env.WEBHOOK_SECRET` faria `undefined === undefined` dar `true`, e
   * uma instalacao sem a variavel deixaria o endpoint de mudanca de status
   * aberto para qualquer um — sem erro, sem log, sem sintoma.
   */
  describe('quando WEBHOOK_SECRET nao esta configurada', () => {
    it.each([
      ['ausente', undefined],
      ['string vazia', ''],
    ])('recusa toda chamada — segredo %s', (_caso, secret) => {
      const guard = guardWithSecret(secret);

      expect(() =>
        guard.canActivate(contextWith({ headers: { authorization: 'Bearer qualquer' }, body: {} })),
      ).toThrow(UnauthorizedException);
    });

    it('recusa inclusive quem apresenta undefined como credencial', () => {
      const guard = guardWithSecret(undefined);

      expect(() => guard.canActivate(contextWith({ headers: {}, body: {} }))).toThrow(
        UnauthorizedException,
      );
    });
  });

  /**
   * Segredo errado, ausente e nao configurado devem ser indistinguiveis de
   * fora: a mensagem e um canal lateral tao util quanto o tempo de resposta.
   */
  it('devolve sempre a mesma mensagem, seja qual for o motivo', () => {
    const mensagens = new Set<string>();
    const casos: Array<[string | undefined, unknown]> = [
      [SECRET, { headers: { authorization: 'Bearer errado' }, body: {} }],
      [SECRET, { headers: {}, body: {} }],
      [undefined, { headers: { authorization: `Bearer ${SECRET}` }, body: {} }],
    ];

    for (const [secret, request] of casos) {
      try {
        guardWithSecret(secret).canActivate(contextWith(request));
      } catch (error) {
        mensagens.add((error as UnauthorizedException).message);
      }
    }

    expect(mensagens.size).toBe(1);
    expect([...mensagens][0]).toBe('Invalid webhook credentials');
  });
});
