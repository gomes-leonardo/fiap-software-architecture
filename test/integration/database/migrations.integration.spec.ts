/**
 * Os outros testes de integracao criam o schema com `synchronize`. Producao
 * nao: la o schema vem das migrations. Este teste roda as migrations reais e
 * prova que o resultado e o mesmo schema que as entidades descrevem, com as
 * chaves estrangeiras e o status do cliente que o modelo ER documenta.
 */
import { DataSource, DataSourceOptions } from 'typeorm';
import { randomUUID } from 'crypto';

import { startPostgresContainer, TestPostgres } from '../../helpers/test-db.helper';
import { ENTITIES } from '@infrastructure/database/typeorm/entities';
import { InitialSchema1719000000000 } from '@infrastructure/database/typeorm/migrations/1719000000000-InitialSchema';
import { AddSoftDelete1787616000000 } from '@infrastructure/database/typeorm/migrations/1787616000000-AddSoftDelete';
import { AddClientStatus1793300000000 } from '@infrastructure/database/typeorm/migrations/1793300000000-AddClientStatus';
import { AddForeignKeys1793300000001 } from '@infrastructure/database/typeorm/migrations/1793300000001-AddForeignKeys';
import { DropClientVehicleIds1793300000002 } from '@infrastructure/database/typeorm/migrations/1793300000002-DropClientVehicleIds';

const ALL_MIGRATIONS = [
  InitialSchema1719000000000,
  AddSoftDelete1787616000000,
  AddClientStatus1793300000000,
  AddForeignKeys1793300000001,
  DropClientVehicleIds1793300000002,
];

const FK_VIOLATION = '23503';
const CHECK_VIOLATION = '23514';

function dataSourceFor(
  postgres: TestPostgres,
  database: string,
  migrations: DataSourceOptions['migrations'],
) {
  return new DataSource({
    type: 'postgres',
    host: postgres.host,
    port: postgres.port,
    username: postgres.username,
    password: postgres.password,
    database,
    entities: ENTITIES,
    migrations,
    synchronize: false,
    logging: false,
  });
}

async function createDatabase(postgres: TestPostgres, name: string): Promise<void> {
  const admin = dataSourceFor(postgres, postgres.database, []);
  await admin.initialize();
  await admin.query(`CREATE DATABASE "${name}"`);
  await admin.destroy();
}

async function insertClient(ds: DataSource, id = randomUUID()): Promise<string> {
  await ds.query(`INSERT INTO "clients" ("id", "name", "cpf_cnpj") VALUES ($1, 'Ana', $2)`, [
    id,
    id.replace(/\D/g, '').slice(0, 11).padEnd(11, '0'),
  ]);
  return id;
}

describe('Migrations', () => {
  let postgres: TestPostgres;

  beforeAll(async () => {
    postgres = await startPostgresContainer();
  });

  afterAll(async () => {
    await postgres.container.stop();
  });

  describe('schema completo', () => {
    let ds: DataSource;

    beforeAll(async () => {
      await createDatabase(postgres, 'migrated');
      ds = dataSourceFor(postgres, 'migrated', ALL_MIGRATIONS);
      await ds.initialize();
      await ds.runMigrations({ transaction: 'each' });
    });

    afterAll(async () => {
      await ds.destroy();
    });

    it('coincide com as entidades: o synchronize nao teria nada a mudar', async () => {
      const pending = await ds.driver.createSchemaBuilder().log();
      expect(pending.upQueries.map((q) => q.query)).toEqual([]);
    });

    it('declara as cinco chaves estrangeiras com ON DELETE RESTRICT', async () => {
      const rows: Array<{ name: string; delete_rule: string }> = await ds.query(`
        SELECT constraint_name AS name, delete_rule
        FROM information_schema.referential_constraints
        ORDER BY constraint_name
      `);
      expect(rows).toEqual([
        { name: 'FK_budgets_service_order_id', delete_rule: 'RESTRICT' },
        { name: 'FK_service_orders_budget_id', delete_rule: 'RESTRICT' },
        { name: 'FK_service_orders_client_id', delete_rule: 'RESTRICT' },
        { name: 'FK_service_orders_vehicle_id', delete_rule: 'RESTRICT' },
        { name: 'FK_vehicles_owner_client_id', delete_rule: 'RESTRICT' },
      ]);
    });

    it('nao tem mais clients.vehicle_ids', async () => {
      const rows = await ds.query(
        `SELECT 1 FROM information_schema.columns WHERE table_name = 'clients' AND column_name = 'vehicle_ids'`,
      );
      expect(rows).toHaveLength(0);
    });

    it('cria cliente ATIVO por padrao e recusa status fora do dominio', async () => {
      const id = await insertClient(ds);
      const [{ status }] = await ds.query(`SELECT status FROM "clients" WHERE id = $1`, [id]);
      expect(status).toBe('ATIVO');

      await expect(
        ds.query(`UPDATE "clients" SET status = 'BLOQUEADO' WHERE id = $1`, [id]),
      ).rejects.toMatchObject({ code: CHECK_VIOLATION });
    });

    it('recusa ordem de servico de cliente inexistente', async () => {
      await expect(
        ds.query(
          `INSERT INTO "service_orders" ("id", "client_id", "description", "status")
           VALUES ($1, $2, 'troca de oleo', 'RECEBIDA')`,
          [randomUUID(), randomUUID()],
        ),
      ).rejects.toMatchObject({ code: FK_VIOLATION });
    });

    it('recusa DELETE fisico de cliente com veiculo', async () => {
      const clientId = await insertClient(ds);
      await ds.query(
        `INSERT INTO "vehicles" ("id", "plate", "brand", "model", "year", "owner_client_id")
         VALUES ($1, 'FKT1A23', 'Fiat', 'Uno', 2010, $2)`,
        [randomUUID(), clientId],
      );

      await expect(
        ds.query(`DELETE FROM "clients" WHERE id = $1`, [clientId]),
      ).rejects.toMatchObject({ code: FK_VIOLATION });
    });
  });

  it('aponta a ligacao orfa em vez de falhar com erro generico', async () => {
    await createDatabase(postgres, 'with_orphans');
    const before = dataSourceFor(postgres, 'with_orphans', ALL_MIGRATIONS.slice(0, 3));
    await before.initialize();
    await before.runMigrations();
    await before.query(
      `INSERT INTO "vehicles" ("id", "plate", "brand", "model", "year", "owner_client_id")
       VALUES ($1, 'ORF1A23', 'Fiat', 'Uno', 2010, $2)`,
      [randomUUID(), randomUUID()],
    );
    await before.destroy();

    const after = dataSourceFor(postgres, 'with_orphans', ALL_MIGRATIONS);
    await after.initialize();
    try {
      await expect(after.runMigrations()).rejects.toThrow(
        'vehicles.owner_client_id: 1 linha(s) sem clients',
      );
    } finally {
      await after.destroy();
    }
  });
});
