import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { join } from 'path';

export function getTypeOrmConfig(): TypeOrmModuleOptions {
  const isProduction = process.env.NODE_ENV === 'production';

  return {
    type: 'postgres',
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    username: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASS || 'postgres',
    database: process.env.DB_NAME || 'soat_repair_shop',
    autoLoadEntities: true,
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: true } : false,
    // As colunas sao `timestamp` sem fuso preenchidas por now(): a sessao em
    // UTC garante que o valor gravado seja UTC em qualquer servidor.
    extra: { options: '-c timezone=UTC' },
    // Em dev/test usamos synchronize para agilidade. Em producao o schema e
    // criado/migrado pelas migrations, nunca por synchronize. No Kubernetes
    // elas rodam num Job antes do rollout (DB_MIGRATIONS_ON_BOOT=false): o
    // TypeORM nao trava a tabela de migrations, e varias replicas subindo
    // juntas aplicariam a mesma migration em paralelo.
    synchronize: !isProduction,
    migrations: [join(__dirname, '..', 'migrations', '*.{js,ts}')],
    migrationsRun: isProduction && process.env.DB_MIGRATIONS_ON_BOOT !== 'false',
    logging: false,
  };
}
