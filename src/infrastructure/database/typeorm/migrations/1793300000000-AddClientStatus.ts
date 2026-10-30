import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Status explicito do cliente. A autenticacao por CPF so emite token para
 * cliente ATIVO e nao excluido; soft delete continua significando "removido".
 */
export class AddClientStatus1793300000000 implements MigrationInterface {
  name = 'AddClientStatus1793300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "clients" ADD "status" character varying(10) NOT NULL DEFAULT 'ATIVO'`,
    );
    await queryRunner.query(
      `ALTER TABLE "clients" ADD CONSTRAINT "CHK_clients_status" CHECK ("status" IN ('ATIVO', 'INATIVO'))`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "clients" DROP CONSTRAINT "CHK_clients_status"`);
    await queryRunner.query(`ALTER TABLE "clients" DROP COLUMN "status"`);
  }
}
