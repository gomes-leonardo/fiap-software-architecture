import { DataSource } from 'typeorm';
import { PostgresConnectionOptions } from 'typeorm/driver/postgres/PostgresConnectionOptions';
import { getTypeOrmConfig } from './config/typeorm.config';
import { ENTITIES } from './entities';

/**
 * Ponto de entrada do Job de migration no Kubernetes:
 * `node dist/infrastructure/database/typeorm/run-migrations.js`.
 * Usa DB_MIGRATION_HOST quando definido, porque o pooler do banco gerenciado
 * nao segura o advisory lock que as migrations usam.
 */
async function run(): Promise<void> {
  const config = getTypeOrmConfig() as PostgresConnectionOptions;
  const dataSource = new DataSource({
    ...config,
    host: process.env.DB_MIGRATION_HOST || process.env.DB_HOST || 'localhost',
    entities: ENTITIES,
    synchronize: false,
    migrationsRun: false,
  });

  await dataSource.initialize();
  try {
    const applied = await dataSource.runMigrations({ transaction: 'each' });
    process.stdout.write(
      `${applied.length} migration(s) aplicada(s): ${applied.map((m) => m.name).join(', ') || '-'}\n`,
    );
  } finally {
    await dataSource.destroy();
  }
}

run().catch((error: unknown) => {
  process.stderr.write(`Falha ao rodar as migrations: ${String(error)}\n`);
  process.exit(1);
});
