/**
 * Test Database Helper
 *
 * HOW THE TEST DB WORKS:
 *
 * We use the `testcontainers` library to spin up a real PostgreSQL container
 * for each test suite. This gives us:
 *
 * 1. Real database behavior (no mocks, no SQLite)
 * 2. Automatic cleanup (container destroyed after tests)
 * 3. Isolation (each suite gets its own container)
 *
 * MIGRATIONS:
 * We use `synchronize: true` in test environment, which auto-creates tables
 * from TypeORM entity metadata. This is faster than running migrations for tests.
 *
 * DATA ISOLATION:
 * Between tests within a suite, we truncate all tables. This ensures each test
 * starts with a clean database without the overhead of container recreation.
 *
 * ALTERNATIVE APPROACHES:
 * - docker-compose test service: manual setup, shared across all tests
 * - transaction rollback: wrap each test in a transaction and rollback
 *   (faster but can mask transaction-related bugs)
 */
import { DataSource } from 'typeorm';
import { GenericContainer, StartedTestContainer, Wait } from 'testcontainers';
import { AdminOrmEntity } from '@infrastructure/database/typeorm/entities/admin.orm-entity';
import { ClientOrmEntity } from '@infrastructure/database/typeorm/entities/client.orm-entity';
import { VehicleOrmEntity } from '@infrastructure/database/typeorm/entities/vehicle.orm-entity';
import { ServiceOrmEntity } from '@infrastructure/database/typeorm/entities/service.orm-entity';
import { ServiceOrderOrmEntity } from '@infrastructure/database/typeorm/entities/service-order.orm-entity';
import { PartOrmEntity } from '@infrastructure/database/typeorm/entities/part.orm-entity';
import { BudgetOrmEntity } from '@infrastructure/database/typeorm/entities/budget.orm-entity';

const POSTGRES_IMAGE = 'postgres:16-alpine';
const POSTGRES_DB = 'test_db';
const POSTGRES_USER = 'test';
const POSTGRES_PASSWORD = 'test';

/**
 * O entrypoint da imagem sobe um servidor temporario para rodar o `initdb` e o
 * derruba antes de subir o definitivo, entao a linha aparece DUAS vezes:
 *
 *   LOG:  database system is ready to accept connections   <- servidor do initdb
 *   LOG:  shutting down
 *   PostgreSQL init process complete; ready for start up.
 *   LOG:  database system is ready to accept connections   <- servidor definitivo
 *
 * Esperar a primeira ocorrencia devolveria um banco que esta prestes a fechar.
 */
const POSTGRES_READY_LOG = /database system is ready to accept connections/;
const POSTGRES_READY_LOG_OCCURRENCES = 2;

let container: StartedTestContainer;
let dataSource: DataSource;

/**
 * Credenciais e endereco de um Postgres efemero ja no ar.
 */
export interface TestPostgres {
  container: StartedTestContainer;
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
}

/**
 * Sobe apenas o container do Postgres, sem abrir um DataSource.
 *
 * Os testes de integracao falam direto com o banco pelo `setupTestDb` abaixo.
 * O smoke test, por outro lado, sobe o `AppModule` real e deixa o proprio
 * TypeORM da aplicacao abrir a conexao — ele so precisa saber para onde
 * apontar as variaveis `DB_*`.
 *
 * A wait strategy nao e opcional: sem ela o Testcontainers so espera a porta
 * 5432 abrir, e o Postgres abre a porta durante o `initdb`, antes de aceitar
 * conexao. O teste conectava cedo demais e falhava intermitentemente com
 * "the database system is starting up", em suites diferentes a cada rodada.
 */
export async function startPostgresContainer(): Promise<TestPostgres> {
  const started = await new GenericContainer(POSTGRES_IMAGE)
    .withEnvironment({
      POSTGRES_DB,
      POSTGRES_USER,
      POSTGRES_PASSWORD,
    })
    .withExposedPorts(5432)
    .withWaitStrategy(Wait.forLogMessage(POSTGRES_READY_LOG, POSTGRES_READY_LOG_OCCURRENCES))
    .start();

  return {
    container: started,
    host: started.getHost(),
    port: started.getMappedPort(5432),
    database: POSTGRES_DB,
    username: POSTGRES_USER,
    password: POSTGRES_PASSWORD,
  };
}

export async function setupTestDb(): Promise<DataSource> {
  const postgres = await startPostgresContainer();
  container = postgres.container;

  dataSource = new DataSource({
    type: 'postgres',
    host: postgres.host,
    port: postgres.port,
    username: postgres.username,
    password: postgres.password,
    database: postgres.database,
    entities: [
      AdminOrmEntity,
      ClientOrmEntity,
      VehicleOrmEntity,
      ServiceOrmEntity,
      ServiceOrderOrmEntity,
      PartOrmEntity,
      BudgetOrmEntity,
    ],
    synchronize: true,
    logging: false,
  });

  await dataSource.initialize();
  return dataSource;
}

export async function teardownTestDb(): Promise<void> {
  if (dataSource?.isInitialized) {
    await dataSource.destroy();
  }
  if (container) {
    await container.stop();
  }
}

export async function truncateAllTables(ds: DataSource): Promise<void> {
  const entities = ds.entityMetadatas;
  for (const entity of entities) {
    const repository = ds.getRepository(entity.name);
    await repository.query(`TRUNCATE TABLE "${entity.tableName}" CASCADE`);
  }
}

export function getTestDataSource(): DataSource {
  return dataSource;
}

/**
 * As chaves estrangeiras exigem que o cliente referenciado exista. Testes que
 * so precisam de "algum cliente" com um id fixo semeiam a linha por aqui, sem
 * passar pelo dominio.
 */
export async function seedClient(ds: DataSource, id: string): Promise<void> {
  const cpf = String(Math.floor(Math.random() * 1e11)).padStart(11, '0');
  await ds.query(`INSERT INTO "clients" ("id", "name", "cpf_cnpj") VALUES ($1, 'Cliente', $2)`, [
    id,
    cpf,
  ]);
}

export async function seedServiceOrder(
  ds: DataSource,
  id: string,
  clientId: string,
): Promise<void> {
  await seedClient(ds, clientId);
  await ds.query(
    `INSERT INTO "service_orders" ("id", "client_id", "description", "status")
     VALUES ($1, $2, 'OS semeada', 'RECEBIDA')`,
    [id, clientId],
  );
}

/**
 * OS e orcamento apontam um para o outro. Para gravar uma OS que ja carrega
 * `budgetId`, a linha da OS precisa existir antes do orcamento, e o orcamento
 * antes de a OS apontar para ele. O `save()` seguinte atualiza a linha.
 */
export async function seedBudgetFor(
  ds: DataSource,
  order: { id: string; clientId: string; budgetId: string | null },
): Promise<void> {
  if (!order.budgetId) return;
  await ds.query(
    `INSERT INTO "service_orders" ("id", "client_id", "description", "status")
     VALUES ($1, $2, 'OS semeada', 'RECEBIDA') ON CONFLICT ("id") DO NOTHING`,
    [order.id, order.clientId],
  );
  await ds.query(
    `INSERT INTO "budgets" ("id", "service_order_id", "lines", "status", "version", "total", "frozen_at")
     VALUES ($1, $2, '[]', 'APPROVED', 1, 0, now())`,
    [order.budgetId, order.id],
  );
}
