import { OpenAPIObject } from '@nestjs/swagger';
import { addCpfAuthRoute } from '@interfaces/http/auth/cpf-auth.swagger';

describe('addCpfAuthRoute', () => {
  const baseDocument = (): OpenAPIObject => ({
    openapi: '3.0.0',
    info: { title: 'test', version: '1.0' },
    paths: { '/auth/login': { post: { responses: {} } } },
  });

  it('documents POST /auth/cpf as a public route of the auth tag', () => {
    const operation = addCpfAuthRoute(baseDocument()).paths['/auth/cpf']?.post;

    expect(operation?.tags).toEqual(['auth']);
    expect(operation?.security).toBeUndefined();
  });

  it('asks for the cpf in the body and lists the gateway answers', () => {
    const operation = addCpfAuthRoute(baseDocument()).paths['/auth/cpf']?.post;

    expect(operation?.requestBody).toMatchObject({
      required: true,
      content: { 'application/json': { schema: { required: ['cpf'] } } },
    });
    expect(Object.keys(operation?.responses ?? {}).sort()).toEqual(['200', '400', '401', '429']);
  });

  it('keeps the routes the controllers already documented', () => {
    expect(addCpfAuthRoute(baseDocument()).paths['/auth/login']).toBeDefined();
  });
});
