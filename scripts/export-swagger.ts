import { mkdirSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { DocumentBuilder, OpenAPIObject, SwaggerModule } from '@nestjs/swagger';
import { Test } from '@nestjs/testing';
import { DataSource, DataSourceOptions } from 'typeorm';
import { AppModule } from '../src/app.module';
import { getTypeOrmConfig } from '@infrastructure/database/typeorm/config/typeorm.config';

const OUTPUT_PATH = join(__dirname, '..', 'docs', 'swagger.json');

/**
 * Copia da configuracao de `src/main.ts`. As duas precisam andar juntas: se
 * divergirem, o spec exportado descreve uma API que nao e a que o `/api-docs`
 * serve em runtime. Ao mexer no DocumentBuilder do `main.ts`, replique aqui.
 */
function buildSwaggerConfig() {
  return new DocumentBuilder()
    .setTitle('Auto Repair Shop OS Management')
    .setDescription(
      'API para gerenciamento de ordens de serviço de uma oficina mecânica. ' +
        'Sistema completo com gestão de clientes, veículos, peças, orçamentos e ordens de serviço.',
    )
    .setVersion('1.0')
    .addBearerAuth()
    .addTag('auth', 'Autenticação de administradores')
    .addTag('clients', 'Gerenciamento de clientes')
    .addTag('vehicles', 'Gerenciamento de veículos')
    .addTag('parts', 'Gerenciamento de peças e estoque')
    .addTag('service-orders', 'Gerenciamento de ordens de serviço')
    .addTag('budgets', 'Gerenciamento de orçamentos')
    .addTag('consult', 'Consulta pública de OS pelo cliente')
    .addTag('health', 'Health check da aplicação e do banco')
    .addTag('webhooks', 'Integração com sistemas externos (sem login)')
    .build();
}

/**
 * O Swagger le metadados dos controllers, mas para chegar neles o Nest precisa
 * instanciar o grafo inteiro — e o provider de `DataSource` do
 * `TypeOrmModule.forRoot` chama `initialize()`, que abre conexao com o Postgres
 * (e ainda tenta 10 vezes antes de desistir). Trocamos esse provider por um
 * `DataSource` construido mas nao inicializado: `getRepository()` e `manager`
 * funcionam sem conexao, que e tudo o que os repositorios precisam para serem
 * resolvidos. Assim o script roda em CI, sem banco.
 */
async function createDocument(): Promise<OpenAPIObject> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(DataSource)
    .useFactory({
      factory: () => new DataSource(getTypeOrmConfig() as DataSourceOptions),
    })
    .compile();

  const app = moduleRef.createNestApplication();
  try {
    return SwaggerModule.createDocument(app, buildSwaggerConfig());
  } finally {
    await app.close();
  }
}

/**
 * Alguns controllers disparam trabalho de banco no construtor sem esperar pela
 * promise (o `seedDefaultAdmin` do `AuthController`, por exemplo). Sem conexao
 * essas promises rejeitam depois que o spec ja foi gerado, e o Node derruba o
 * processo por unhandled rejection. Aqui elas viram aviso visivel: nao afetam o
 * documento, mas continuam sendo impressas em vez de sumirem.
 */
function reportDetachedRejections(): void {
  process.on('unhandledRejection', (reason: unknown) => {
    const message = reason instanceof Error ? reason.message : String(reason);
    console.warn(`aviso: efeito colateral falhou sem banco (esperado) — ${message}`);
  });
}

async function main(): Promise<void> {
  reportDetachedRejections();

  const document = await createDocument();

  mkdirSync(dirname(OUTPUT_PATH), { recursive: true });
  writeFileSync(OUTPUT_PATH, `${JSON.stringify(document, null, 2)}\n`, 'utf8');

  const operations = Object.values(document.paths).reduce(
    (total, pathItem) => total + Object.keys(pathItem).length,
    0,
  );
  console.log(
    `OpenAPI spec gravado em ${OUTPUT_PATH} (${Object.keys(document.paths).length} paths, ${operations} operações)`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
