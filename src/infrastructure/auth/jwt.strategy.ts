import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { resolveJwtSecret } from './jwt.config';
import { ADMIN_TOKEN_ISSUER, CLIENT_TOKEN_ISSUER, Role } from './role.enum';

export interface JwtPayload {
  sub: string;
  role: string;
  email?: string;
  iss?: string;
}

export interface AuthenticatedUser {
  userId: string;
  role: Role;
  email?: string;
}

const ISSUER_BY_ROLE: Record<Role, string> = {
  [Role.ADMIN]: ADMIN_TOKEN_ISSUER,
  [Role.CLIENT]: CLIENT_TOKEN_ISSUER,
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isRole(value: string): value is Role {
  return (Object.values(Role) as string[]).includes(value);
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: resolveJwtSecret(config),
    });
  }

  /**
   * A assinatura ja foi conferida pelo passport. Aqui o que se valida e o
   * conteudo: so existem dois papeis, cada um so pode vir do seu emissor, e o
   * `sub` e o id de uma linha do banco. Token de admin sem `iss`, emitido antes
   * da Fase 3, e recusado: o custo e um novo login.
   */
  validate(payload: JwtPayload): AuthenticatedUser {
    if (!UUID.test(payload.sub ?? '') || !isRole(payload.role)) {
      throw new UnauthorizedException();
    }

    if (payload.iss !== ISSUER_BY_ROLE[payload.role]) {
      throw new UnauthorizedException();
    }

    return { userId: payload.sub, role: payload.role, email: payload.email };
  }
}
