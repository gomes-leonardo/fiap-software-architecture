import { ArgumentsHost, BadRequestException, HttpStatus } from '@nestjs/common';
import { DomainException } from '@domain/shared';
import { GlobalExceptionFilter } from '@interfaces/http/filters/global-exception.filter';
import { recordIntegrationError } from '@infrastructure/observability/integration-errors';

jest.mock('@infrastructure/observability/integration-errors', () => ({
  ...jest.requireActual('@infrastructure/observability/integration-errors'),
  recordIntegrationError: jest.fn(),
}));

function hostFor(request: object) {
  const response = { status: jest.fn().mockReturnThis(), json: jest.fn() };
  const host = {
    switchToHttp: () => ({ getRequest: () => request, getResponse: () => response }),
  } as unknown as ArgumentsHost;
  return { host, response };
}

const ORDER_ID = '33333333-3333-4333-8333-333333333333';
const statusRoute = {
  baseUrl: '',
  route: { path: '/service-orders/:id/status' },
  params: { id: ORDER_ID },
};

describe('GlobalExceptionFilter', () => {
  const filter = new GlobalExceptionFilter();

  beforeEach(() => jest.mocked(recordIntegrationError).mockClear());

  it('conta erro de dominio como domain_rejected e responde 400', () => {
    const { host, response } = hostFor(statusRoute);

    filter.catch(DomainException.of('Invalid transition'), host);

    expect(response.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    expect(recordIntegrationError).toHaveBeenCalledWith(
      'domain_rejected',
      '/service-orders/:id/status',
    );
  });

  it('conta erro inesperado como internal_error e responde 500 sem vazar a mensagem', () => {
    const { host, response } = hostFor(statusRoute);

    filter.catch(new Error('connection terminated'), host);

    expect(response.status).toHaveBeenCalledWith(500);
    expect(response.json).toHaveBeenCalledWith({
      statusCode: 500,
      message: 'Internal server error',
    });
    expect(recordIntegrationError).toHaveBeenCalledWith(
      'internal_error',
      '/service-orders/:id/status',
    );
  });

  it('repassa HttpException 4xx no formato do Nest, sem contar como erro', () => {
    const { host, response } = hostFor(statusRoute);

    filter.catch(new BadRequestException(['status must be an enum']), host);

    expect(response.status).toHaveBeenCalledWith(400);
    expect(response.json).toHaveBeenCalledWith({
      statusCode: 400,
      message: ['status must be an enum'],
      error: 'Bad Request',
    });
    expect(recordIntegrationError).not.toHaveBeenCalled();
  });

  it('usa o template da rota, nao o caminho com o id', () => {
    const { host } = hostFor({ params: {} });

    filter.catch(new Error('boom'), host);

    expect(recordIntegrationError).toHaveBeenCalledWith('internal_error', 'unmatched');
  });
});
