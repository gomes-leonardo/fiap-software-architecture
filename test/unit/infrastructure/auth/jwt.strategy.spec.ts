import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtStrategy } from '@infrastructure/auth/jwt.strategy';

const SECRET = 'segredo-de-teste-bem-longo';
const ADMIN_ID = '11111111-1111-4111-8111-111111111111';
const CLIENT_ID = '22222222-2222-4222-8222-222222222222';

function configWith(values: Record<string, string | undefined>): ConfigService {
  return {
    get: jest.fn((key: string, fallback?: string) => values[key] ?? fallback),
  } as unknown as ConfigService;
}

describe('JwtStrategy', () => {
  /**
   * A strategy e instanciada pelo container do Nest durante o boot. Estourar
   * aqui e o que impede a aplicacao de comecar a validar tokens contra um
   * segredo que nao foi escolhido por ninguem.
   */
  it('nao pode ser construida sem JWT_SECRET', () => {
    expect(() => new JwtStrategy(configWith({}))).toThrow(/JWT_SECRET/);
  });

  it('e construida quando o segredo existe', () => {
    expect(() => new JwtStrategy(configWith({ JWT_SECRET: SECRET }))).not.toThrow();
  });

  describe('validate', () => {
    const strategy = new JwtStrategy(configWith({ JWT_SECRET: SECRET }));

    it('expoe o token de admin como o usuario da requisicao', () => {
      expect(
        strategy.validate({
          sub: ADMIN_ID,
          email: 'a@oficina.com',
          role: 'admin',
          iss: 'soat-app',
        }),
      ).toEqual({ userId: ADMIN_ID, email: 'a@oficina.com', role: 'admin' });
    });

    it('aceita token de cliente emitido pela autenticacao por CPF', () => {
      expect(
        strategy.validate({ sub: CLIENT_ID, role: 'client', iss: 'soat-auth-lambda' }),
      ).toEqual({
        userId: CLIENT_ID,
        email: undefined,
        role: 'client',
      });
    });

    it.each([
      ['papel desconhecido', { sub: ADMIN_ID, role: 'superuser', iss: 'soat-app' }],
      ['sem sub', { sub: '', role: 'admin', iss: 'soat-app' }],
      ['sub que nao e uuid', { sub: 'nao-e-uuid', role: 'client', iss: 'soat-auth-lambda' }],
      ['admin sem iss, emitido antes da Fase 3', { sub: ADMIN_ID, role: 'admin' }],
      ['cliente sem iss', { sub: CLIENT_ID, role: 'client' }],
      ['cliente se dizendo emitido pela app', { sub: CLIENT_ID, role: 'client', iss: 'soat-app' }],
      [
        'admin emitido pela funcao de CPF',
        { sub: CLIENT_ID, role: 'admin', iss: 'soat-auth-lambda' },
      ],
    ])('recusa %s', (_caso, payload) => {
      expect(() => strategy.validate(payload)).toThrow(UnauthorizedException);
    });
  });
});
