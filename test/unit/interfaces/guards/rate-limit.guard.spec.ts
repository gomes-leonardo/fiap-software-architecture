/**
 * GAP C — Rate Limiting Guard Tests
 *
 * These tests are COMPLETE and will FAIL until you implement:
 * 1. InMemoryRateLimitStore (the hit/get methods)
 * 2. RateLimitGuard.canActivate (the guard logic)
 *
 * Study the JWT auth guard tests for the guard testing pattern.
 * Use Jest fake timers to control time advancement.
 *
 * Key concepts:
 * - Fixed-window or sliding-window algorithm
 * - HTTP 429 Too Many Requests with Retry-After header
 * - Per-key (per-client) rate limiting
 * - Window reset after time expires
 */
import { ExecutionContext, HttpException, HttpStatus } from '@nestjs/common';
import { RateLimitGuard, InMemoryRateLimitStore } from '@interfaces/http/guards/rate-limit.guard';

describe('RateLimitGuard', () => {
  const MAX_REQUESTS = 3;
  const WINDOW_MS = 60_000; // 1 minute

  let store: InMemoryRateLimitStore;
  let guard: RateLimitGuard;

  function createMockContext(clientId: string): ExecutionContext {
    const mockResponse = {
      setHeader: jest.fn(),
    };
    const mockRequest = {
      params: { clientId },
      ip: '127.0.0.1',
    };

    return {
      switchToHttp: () => ({
        getRequest: () => mockRequest,
        getResponse: () => mockResponse,
      }),
      getHandler: () => ({}),
      getClass: () => ({}),
    } as unknown as ExecutionContext;
  }

  beforeEach(() => {
    jest.useFakeTimers();
    store = new InMemoryRateLimitStore(MAX_REQUESTS, WINDOW_MS);
    guard = new RateLimitGuard(store);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('InMemoryRateLimitStore', () => {
    it('should count hits for a key', async () => {
      const result1 = await store.hit('client-1');
      expect(result1.count).toBe(1);

      const result2 = await store.hit('client-1');
      expect(result2.count).toBe(2);
    });

    it('should return reset time in seconds', async () => {
      const result = await store.hit('client-1');
      expect(result.resetInSeconds).toBeGreaterThan(0);
      expect(result.resetInSeconds).toBeLessThanOrEqual(60);
    });

    it('should track different keys independently', async () => {
      await store.hit('client-1');
      await store.hit('client-1');
      const result1 = await store.hit('client-1');

      const result2 = await store.hit('client-2');

      expect(result1.count).toBe(3);
      expect(result2.count).toBe(1);
    });

    it('should reset count after window expires', async () => {
      await store.hit('client-1');
      await store.hit('client-1');
      await store.hit('client-1');

      // Advance time past the window
      jest.advanceTimersByTime(WINDOW_MS + 1);

      const result = await store.hit('client-1');
      expect(result.count).toBe(1); // Reset!
    });

    it('should return null for unknown key on get()', async () => {
      const result = await store.get('unknown');
      expect(result).toBeNull();
    });

    it('should return current state on get() without incrementing', async () => {
      await store.hit('client-1');
      await store.hit('client-1');

      const state = await store.get('client-1');
      expect(state).not.toBeNull();
      expect(state!.count).toBe(2);

      // get() should NOT increment
      const stateAgain = await store.get('client-1');
      expect(stateAgain!.count).toBe(2);
    });
  });

  describe('RateLimitGuard.canActivate', () => {
    it('should allow requests under the limit', async () => {
      const context = createMockContext('client-1');

      const result = await guard.canActivate(context);
      expect(result).toBe(true);
    });

    it('should allow up to MAX_REQUESTS', async () => {
      const context = createMockContext('client-1');

      for (let i = 0; i < MAX_REQUESTS; i++) {
        const result = await guard.canActivate(context);
        expect(result).toBe(true);
      }
    });

    it('should block when limit is exceeded with 429', async () => {
      const context = createMockContext('client-1');

      // Use up the limit
      for (let i = 0; i < MAX_REQUESTS; i++) {
        await guard.canActivate(context);
      }

      // Next request should be blocked
      await expect(guard.canActivate(context)).rejects.toThrow(HttpException);

      try {
        await guard.canActivate(context);
      } catch (e) {
        expect((e as HttpException).getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
      }
    });

    it('should set Retry-After header when blocked', async () => {
      const context = createMockContext('client-1');
      const response = context.switchToHttp().getResponse();

      // Use up the limit
      for (let i = 0; i < MAX_REQUESTS; i++) {
        await guard.canActivate(context);
      }

      // Should set header before throwing
      try {
        await guard.canActivate(context);
      } catch {
        // Expected
      }

      expect(response.setHeader).toHaveBeenCalledWith('Retry-After', expect.any(String));
    });

    it('should allow requests again after window resets', async () => {
      const context = createMockContext('client-1');

      // Use up the limit
      for (let i = 0; i < MAX_REQUESTS; i++) {
        await guard.canActivate(context);
      }

      // Advance time past the window
      jest.advanceTimersByTime(WINDOW_MS + 1);

      // Should work again
      const result = await guard.canActivate(context);
      expect(result).toBe(true);
    });

    it('should track different clients independently', async () => {
      const context1 = createMockContext('client-1');
      const context2 = createMockContext('client-2');

      // Use up client-1's limit
      for (let i = 0; i < MAX_REQUESTS; i++) {
        await guard.canActivate(context1);
      }

      // client-2 should still be allowed
      const result = await guard.canActivate(context2);
      expect(result).toBe(true);
    });
  });

  describe('expurgo', () => {
    it('remove as janelas expiradas em vez de guardar toda chave para sempre', async () => {
      for (let i = 0; i < 50; i++) {
        await store.hit(`client-${i}`);
      }
      expect(store.size).toBe(50);

      jest.advanceTimersByTime(WINDOW_MS + 1);
      await store.hit('client-novo');

      expect(store.size).toBe(1);
    });
  });

  describe('login', () => {
    function loginContext(email: string): ExecutionContext {
      return {
        switchToHttp: () => ({
          getRequest: () => ({ params: {}, body: { email }, ip: '10.0.0.1' }),
          getResponse: () => ({ setHeader: jest.fn() }),
        }),
      } as unknown as ExecutionContext;
    }

    it('conta por e-mail, mesmo com todas as tentativas vindo do mesmo IP', async () => {
      for (let i = 0; i < MAX_REQUESTS; i++) {
        await guard.canActivate(loginContext('alvo@oficina.com'));
      }

      await expect(guard.canActivate(loginContext('ALVO@oficina.com'))).rejects.toThrow(
        HttpException,
      );
      await expect(guard.canActivate(loginContext('outro@oficina.com'))).resolves.toBe(true);
    });
  });
});
