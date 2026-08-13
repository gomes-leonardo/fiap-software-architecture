import { ServiceUnavailableException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { HealthController } from '@interfaces/http/health/health.controller';

describe('HealthController', () => {
  function createController(query: jest.Mock) {
    return new HealthController({ query } as unknown as DataSource);
  }

  it('should return ok/connected when the database answers', async () => {
    const query = jest.fn().mockResolvedValue([{ '?column?': 1 }]);
    const controller = createController(query);

    await expect(controller.check()).resolves.toEqual({
      status: 'ok',
      database: 'connected',
    });
    expect(query).toHaveBeenCalledWith('SELECT 1');
  });

  it('should throw 503 with error/disconnected when the database is unreachable', async () => {
    const query = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    const controller = createController(query);

    await expect(controller.check()).rejects.toBeInstanceOf(ServiceUnavailableException);

    // O corpo da resposta segue o mesmo contrato do caso saudavel, para que a
    // probe do Kubernetes/Docker consiga distinguir os dois estados.
    await expect(controller.check()).rejects.toMatchObject({
      response: { status: 'error', database: 'disconnected' },
    });
  });
});
