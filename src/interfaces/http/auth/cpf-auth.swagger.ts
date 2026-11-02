import { OpenAPIObject } from '@nestjs/swagger';

/**
 * `POST /auth/cpf` nao passa por esta aplicacao: o Kong encaminha a rota para a
 * funcao de autenticacao (Lambda na AWS, ou o substituto auth-local no
 * cluster), que devolve o JWT de cliente. Nao ha controller para o Swagger
 * ler, entao a operacao e descrita aqui, para que o `/api-docs` e a collection
 * do Postman mostrem o fluxo completo do cliente.
 */
export function addCpfAuthRoute(document: OpenAPIObject): OpenAPIObject {
  document.paths['/auth/cpf'] = {
    post: {
      tags: ['auth'],
      summary: 'Autenticar cliente por CPF (servido pelo API Gateway)',
      description:
        'Disponivel apenas pelo Kong (base_url do gateway, ex.: http://localhost:18080). ' +
        'Devolve um token de cliente para as rotas /me. Limite de 10 chamadas por minuto por IP.',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['cpf'],
              properties: {
                cpf: {
                  type: 'string',
                  example: '529.982.247-25',
                  description: 'Com ou sem mascara',
                },
              },
            },
          },
        },
      },
      responses: {
        '200': {
          description: 'Cliente ativo encontrado: token de cliente',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  access_token: { type: 'string' },
                  token_type: { type: 'string', example: 'Bearer' },
                  expires_in: { type: 'number', example: 3600 },
                },
              },
            },
          },
        },
        '400': { description: 'CPF invalido' },
        '401': { description: 'Nenhum cliente ativo com este CPF' },
        '429': { description: 'Limite de chamadas do gateway excedido' },
      },
    },
  };
  return document;
}
