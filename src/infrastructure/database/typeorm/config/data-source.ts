import { DataSource } from 'typeorm';
import { PostgresConnectionOptions } from 'typeorm/driver/postgres/PostgresConnectionOptions';
import { config } from 'dotenv';
import { getTypeOrmConfig } from './typeorm.config';
import { ENTITIES } from '../entities';

config();

/**
 * DataSource da CLI do TypeORM (`npm run migration:*`). Parte da mesma
 * configuracao da aplicacao, para herdar SSL e credenciais, e aponta para o
 * host direto quando DB_MIGRATION_HOST existe, como o Job de migration.
 */
export default new DataSource({
  ...(getTypeOrmConfig() as PostgresConnectionOptions),
  host: process.env.DB_MIGRATION_HOST || process.env.DB_HOST || 'localhost',
  entities: ENTITIES,
  synchronize: false,
  migrationsRun: false,
});
