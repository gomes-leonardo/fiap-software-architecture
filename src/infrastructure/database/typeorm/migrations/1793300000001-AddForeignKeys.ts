import { MigrationInterface, QueryRunner } from 'typeorm';

interface ForeignKey {
  name: string;
  table: string;
  column: string;
  references: string;
}

/**
 * ON DELETE RESTRICT em todas: a aplicacao so faz soft delete, entao um DELETE
 * fisico que deixaria orfaos e sempre um erro, e o banco deve recusa-lo.
 */
const FOREIGN_KEYS: ForeignKey[] = [
  {
    name: 'FK_vehicles_owner_client_id',
    table: 'vehicles',
    column: 'owner_client_id',
    references: 'clients',
  },
  {
    name: 'FK_service_orders_client_id',
    table: 'service_orders',
    column: 'client_id',
    references: 'clients',
  },
  {
    name: 'FK_service_orders_vehicle_id',
    table: 'service_orders',
    column: 'vehicle_id',
    references: 'vehicles',
  },
  {
    name: 'FK_service_orders_budget_id',
    table: 'service_orders',
    column: 'budget_id',
    references: 'budgets',
  },
  {
    name: 'FK_budgets_service_order_id',
    table: 'budgets',
    column: 'service_order_id',
    references: 'service_orders',
  },
];

export class AddForeignKeys1793300000001 implements MigrationInterface {
  name = 'AddForeignKeys1793300000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await this.failOnOrphans(queryRunner);

    for (const fk of FOREIGN_KEYS) {
      await queryRunner.query(
        `ALTER TABLE "${fk.table}" ADD CONSTRAINT "${fk.name}" FOREIGN KEY ("${fk.column}") REFERENCES "${fk.references}"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
      );
    }

    await queryRunner.query(
      `CREATE INDEX "IDX_service_orders_vehicle_id" ON "service_orders" ("vehicle_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_service_orders_budget_id" ON "service_orders" ("budget_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_service_orders_budget_id"`);
    await queryRunner.query(`DROP INDEX "IDX_service_orders_vehicle_id"`);
    for (const fk of [...FOREIGN_KEYS].reverse()) {
      await queryRunner.query(`ALTER TABLE "${fk.table}" DROP CONSTRAINT "${fk.name}"`);
    }
  }

  /**
   * Uma linha orfa faria o ADD CONSTRAINT falhar com uma mensagem generica.
   * Contar antes diz exatamente qual ligacao precisa de correcao manual.
   */
  private async failOnOrphans(queryRunner: QueryRunner): Promise<void> {
    const problems: string[] = [];
    for (const fk of FOREIGN_KEYS) {
      const [{ count }] = await queryRunner.query(
        `SELECT count(*)::int AS count FROM "${fk.table}" t
         WHERE t."${fk.column}" IS NOT NULL
           AND NOT EXISTS (SELECT 1 FROM "${fk.references}" r WHERE r."id" = t."${fk.column}")`,
      );
      if (count > 0) {
        problems.push(`${fk.table}.${fk.column}: ${count} linha(s) sem ${fk.references}`);
      }
    }
    if (problems.length > 0) {
      throw new Error(`Orfaos impedem as chaves estrangeiras: ${problems.join('; ')}`);
    }
  }
}
