import { MigrationInterface, QueryRunner } from 'typeorm';

const TABLES = ['admins', 'clients', 'vehicles', 'services', 'parts', 'service_orders', 'budgets'];

/**
 * Indices unicos que precisam virar parciais. Com soft delete a linha excluida
 * permanece na tabela; uma UNIQUE comum bloquearia para sempre a reutilizacao
 * do CPF, da placa, do nome do servico, do SKU ou do e-mail.
 */
const UNIQUE_INDEXES: Array<{ table: string; name: string; column: string }> = [
  { table: 'admins', name: 'UQ_admins_email', column: 'email' },
  { table: 'clients', name: 'UQ_clients_cpf_cnpj', column: 'cpf_cnpj' },
  { table: 'vehicles', name: 'UQ_vehicles_plate', column: 'plate' },
  { table: 'services', name: 'UQ_services_name', column: 'name' },
  { table: 'parts', name: 'UQ_parts_sku', column: 'sku' },
];

/**
 * Soft delete — adiciona `deleted_at` em todas as tabelas e troca as UNIQUE
 * constraints por indices unicos parciais.
 */
export class AddSoftDelete1787616000000 implements MigrationInterface {
  name = 'AddSoftDelete1787616000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const table of TABLES) {
      await queryRunner.query(`ALTER TABLE "${table}" ADD "deleted_at" TIMESTAMP`);
    }

    for (const { table, name, column } of UNIQUE_INDEXES) {
      await queryRunner.query(`ALTER TABLE "${table}" DROP CONSTRAINT "${name}"`);
      await queryRunner.query(
        `CREATE UNIQUE INDEX "${name}" ON "${table}" ("${column}") WHERE "deleted_at" IS NULL`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const { table, name, column } of UNIQUE_INDEXES) {
      await queryRunner.query(`DROP INDEX "${name}"`);
      await queryRunner.query(
        `ALTER TABLE "${table}" ADD CONSTRAINT "${name}" UNIQUE ("${column}")`,
      );
    }

    for (const table of TABLES) {
      await queryRunner.query(`ALTER TABLE "${table}" DROP COLUMN "deleted_at"`);
    }
  }
}
