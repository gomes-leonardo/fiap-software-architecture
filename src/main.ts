import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Shutdown gracioso: com o tini encaminhando o SIGTERM (ver Dockerfile), o
  // Nest fecha o servidor HTTP e o pool do TypeORM antes de sair, em vez de
  // derrubar conexoes em aberto durante um rolling update do Kubernetes.
  app.enableShutdownHooks();

  // CORS liberado para o MVP (permite o app/cliente consumir a API e a consulta
  // publica de OS). Em producao, restringir `origin` aos dominios confiaveis.
  app.enableCors();

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const swaggerConfig = new DocumentBuilder()
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
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api-docs', app, document);

  const port = process.env.PORT || 3000;
  await app.listen(port);
  console.log(`Application running on port ${port}`);
  console.log(`Swagger docs at http://localhost:${port}/api-docs`);
}
bootstrap();
