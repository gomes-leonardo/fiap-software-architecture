import {
  serializeError,
  serializeRequest,
  serializeResponse,
} from '@infrastructure/logging/serializers';

describe('serializers do log de requisicao', () => {
  const CPF = '52998224725';
  const JWT = 'eyJhbGciOiJIUzI1NiJ9.PAYLOAD_DO_TOKEN.ASSINATURA';
  const SENHA = 'senha-super-secreta';
  const WEBHOOK_SECRET = 'segredo-do-webhook';

  const requisicao = {
    id: 7,
    method: 'POST',
    url: `/consult/9f1c/orders?cpf=${CPF}`,
    query: { cpf: CPF },
    params: { clientId: '9f1c' },
    headers: {
      authorization: `Bearer ${JWT}`,
      'x-webhook-secret': WEBHOOK_SECRET,
      'content-type': 'application/json',
    },
    body: { email: 'admin@oficina.com', password: SENHA },
    remoteAddress: '::1',
    remotePort: 53342,
  };

  it('nao deixa CPF, JWT, senha nem segredo de webhook chegarem ao log', () => {
    const linha = JSON.stringify(serializeRequest(requisicao));

    expect(linha).not.toContain(CPF);
    expect(linha).not.toContain(JWT);
    expect(linha).not.toContain(SENHA);
    expect(linha).not.toContain(WEBHOOK_SECRET);
  });

  it('emite exatamente dois campos, e nenhum outro', () => {
    expect(serializeRequest(requisicao)).toEqual({
      method: 'POST',
      path: '/consult/9f1c/orders',
    });
  });

  it('mantem o que e preciso para investigar', () => {
    const saida = serializeRequest(requisicao);

    expect(saida.method).toBe('POST');
    expect(saida.path).toBe('/consult/9f1c/orders');
  });

  it('sobrevive a uma requisicao sem url', () => {
    expect(serializeRequest({ method: 'GET' })).toEqual({
      method: 'GET',
      path: undefined,
    });
  });

  it('da resposta, guarda so o status', () => {
    expect(
      serializeResponse({
        statusCode: 401,
        headers: { 'set-cookie': 'sessao=segredo' },
      } as { statusCode?: number }),
    ).toEqual({ statusCode: 401 });
  });

  it('do erro, descarta a stack fabricada pelo pino-http', () => {
    expect(
      serializeError({
        type: 'Error',
        message: 'failed with status code 500',
        stack: 'at onResFinished (node_modules/pino-http/logger.js:115:39)',
      } as { type?: string; message?: string }),
    ).toEqual({ type: 'Error', message: 'failed with status code 500' });
  });
});
