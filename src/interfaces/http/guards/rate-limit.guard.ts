import {
  Injectable,
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
} from '@nestjs/common';

export interface RateLimitState {
  count: number;
  resetInSeconds: number;
  limit: number;
}

/**
 * Rate Limit Store Port — abstracao para o armazenamento do estado do rate limit.
 * Permite trocar a implementacao in-memory (dev) por uma Redis (prod) sem mudar o guard.
 */
export abstract class RateLimitStore {
  /**
   * Registra um acesso para a chave e retorna a contagem atual na janela,
   * o tempo (em segundos) ate a janela resetar e o limite configurado.
   */
  abstract hit(key: string): Promise<RateLimitState>;

  /**
   * Retorna o estado atual da chave sem incrementar (ou null se nao houver
   * janela ativa para a chave).
   */
  abstract get(key: string): Promise<RateLimitState | null>;
}

interface Bucket {
  count: number;
  windowStart: number;
}

/**
 * In-Memory Rate Limit Store — guarda o estado em um Map.
 *
 * Algoritmo: **fixed-window**. Escolhido por ser simples e suficiente para o
 * MVP (protege o endpoint publico de consulta contra abuso/forca-bruta no
 * CPF/CNPJ). Cada chave tem uma janela de `windowMs`; ao expirar, a contagem
 * zera. Trade-off conhecido: permite um burst na virada de janela — aceitavel
 * aqui; para producao com mais rigor, trocar por sliding-window/Redis atras
 * do mesmo port `RateLimitStore`.
 *
 * O estado e por processo: com N replicas o limite efetivo e N vezes o
 * configurado. Limitacao aceita por escrito; o rate limit do gateway (Kong),
 * que ve todo o trafego, e a barreira de borda. Janelas expiradas sao
 * expurgadas uma vez por janela, para o Map nao crescer enquanto o processo
 * viver.
 */
@Injectable()
export class InMemoryRateLimitStore extends RateLimitStore {
  private readonly buckets = new Map<string, Bucket>();
  private lastSweep = Date.now();

  constructor(
    private readonly maxRequests: number = 10,
    private readonly windowMs: number = 60_000,
  ) {
    super();
  }

  async hit(key: string): Promise<RateLimitState> {
    const now = Date.now();
    this.sweepExpired(now);
    let bucket = this.buckets.get(key);

    if (!bucket || now - bucket.windowStart >= this.windowMs) {
      bucket = { count: 0, windowStart: now };
      this.buckets.set(key, bucket);
    }

    bucket.count += 1;

    return {
      count: bucket.count,
      resetInSeconds: this.resetInSeconds(bucket.windowStart, now),
      limit: this.maxRequests,
    };
  }

  async get(key: string): Promise<RateLimitState | null> {
    const bucket = this.buckets.get(key);
    if (!bucket) {
      return null;
    }

    const now = Date.now();
    if (now - bucket.windowStart >= this.windowMs) {
      return null;
    }

    return {
      count: bucket.count,
      resetInSeconds: this.resetInSeconds(bucket.windowStart, now),
      limit: this.maxRequests,
    };
  }

  /** Quantidade de chaves em memoria. Exposto para teste do expurgo. */
  get size(): number {
    return this.buckets.size;
  }

  private sweepExpired(now: number): void {
    if (now - this.lastSweep < this.windowMs) {
      return;
    }
    for (const [key, bucket] of this.buckets) {
      if (now - bucket.windowStart >= this.windowMs) {
        this.buckets.delete(key);
      }
    }
    this.lastSweep = now;
  }

  private resetInSeconds(windowStart: number, now: number): number {
    return Math.ceil((windowStart + this.windowMs - now) / 1000);
  }
}

/**
 * Rate Limit Guard — protege endpoints de excesso de requisicoes.
 *
 * Chave = clientId da rota, ou o e-mail do corpo no login, ou o IP. Quando a
 * contagem na janela ultrapassa o limite, responde HTTP 429 com header
 * `Retry-After`. Aplicado na consulta publica (`/consult/:clientId`) e no
 * login, onde a chave por e-mail limita forca bruta numa conta mesmo quando
 * as tentativas chegam pelo mesmo IP do gateway.
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(private readonly store: RateLimitStore) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const email = typeof request.body?.email === 'string' ? request.body.email : undefined;
    const key: string =
      request.params?.clientId ??
      (email ? `login:${email.toLowerCase()}` : undefined) ??
      request.ip ??
      'global';

    const { count, resetInSeconds, limit } = await this.store.hit(key);

    if (count > limit) {
      const response = context.switchToHttp().getResponse();
      response.setHeader('Retry-After', resetInSeconds.toString());
      throw new HttpException('Too Many Requests', HttpStatus.TOO_MANY_REQUESTS);
    }

    return true;
  }
}
