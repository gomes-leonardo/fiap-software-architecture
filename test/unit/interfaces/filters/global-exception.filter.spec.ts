import { BadRequestException, Controller, Get, INestApplication, Post } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { DomainException } from '@domain/shared';
import { GlobalExceptionFilter } from '@interfaces/http/filters/global-exception.filter';
import { recordIntegrationError } from '@infrastructure/observability/integration-errors';
import { logger } from '@infrastructure/logging/logger';

jest.mock('@infrastructure/observability/integration-errors', () => ({
  ...jest.requireActual('@infrastructure/observability/integration-errors'),
  recordIntegrationError: jest.fn(),
}));

const ORDER_ID = '33333333-3333-4333-8333-333333333333';

@Controller()
class ThrowingController {
  @Post('service-orders/:id/status')
  domain(): void {
    throw DomainException.of('Invalid transition');
  }

  @Post('webhooks/service-orders/:id/status')
  webhookDomain(): void {
    throw DomainException.of('Invalid transition');
  }

  @Get('boom')
  boom(): void {
    throw new Error('connection terminated');
  }

  @Get('validation')
  validation(): void {
    throw new BadRequestException(['status must be an enum']);
  }

  @Get('too-large')
  tooLarge(): void {
    throw Object.assign(new Error('request entity too large'), { statusCode: 413 });
  }
}

/**
 * Pelo HTTP e com o filtro registrado como APP_FILTER, como no AppModule: o
 * que importa e o status e o corpo que o cliente recebe, e o que e contado.
 */
describe('GlobalExceptionFilter (HTTP)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [ThrowingController],
      providers: [{ provide: APP_FILTER, useClass: GlobalExceptionFilter }],
    }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => jest.mocked(recordIntegrationError).mockClear());

  it('erro de dominio: 400, contado como domain_rejected pela rota', async () => {
    const response = await request(app.getHttpServer()).post(`/service-orders/${ORDER_ID}/status`);

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      statusCode: 400,
      error: 'Domain Error',
      message: 'Invalid transition',
    });
    expect(recordIntegrationError).toHaveBeenCalledWith(
      'domain_rejected',
      '/service-orders/:id/status',
    );
  });

  it('transicao recusada no webhook do parceiro loga o serviceOrderId', async () => {
    const warn = jest.spyOn(logger, 'warn').mockImplementation(() => undefined);

    await request(app.getHttpServer()).post(`/webhooks/service-orders/${ORDER_ID}/status`);

    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({ serviceOrderId: ORDER_ID }),
      'domain exception',
    );
    warn.mockRestore();
  });

  it('erro inesperado: 500 sem vazar a mensagem, contado como internal_error', async () => {
    const error = jest.spyOn(logger, 'error').mockImplementation(() => undefined);

    const response = await request(app.getHttpServer()).get('/boom');

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ statusCode: 500, message: 'Internal server error' });
    expect(recordIntegrationError).toHaveBeenCalledWith('internal_error', '/boom');
    error.mockRestore();
  });

  it('HttpException 4xx: mesmo corpo do Nest, sem contagem', async () => {
    const response = await request(app.getHttpServer()).get('/validation');

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      statusCode: 400,
      message: ['status must be an enum'],
      error: 'Bad Request',
    });
    expect(recordIntegrationError).not.toHaveBeenCalled();
  });

  it('erro HTTP do body parser (413) mantem o status e nao conta como erro interno', async () => {
    const response = await request(app.getHttpServer()).get('/too-large');

    expect(response.status).toBe(413);
    expect(recordIntegrationError).not.toHaveBeenCalled();
  });
});
