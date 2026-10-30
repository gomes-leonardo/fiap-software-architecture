import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `clients.vehicle_ids` duplicava `vehicles.owner_client_id`, sem nada que
 * garantisse que os dois lados concordassem. A fonte da verdade passa a ser a
 * chave estrangeira em `vehicles`.
 */
export class DropClientVehicleIds1793300000002 implements MigrationInterface {
  name = 'DropClientVehicleIds1793300000002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "clients" DROP COLUMN "vehicle_ids"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "clients" ADD "vehicle_ids" jsonb NOT NULL DEFAULT '[]'`);
    await queryRunner.query(`
      UPDATE "clients" c SET "vehicle_ids" = sub.ids
      FROM (
        SELECT "owner_client_id", jsonb_agg("id") AS ids
        FROM "vehicles" WHERE "deleted_at" IS NULL
        GROUP BY "owner_client_id"
      ) sub
      WHERE sub."owner_client_id" = c."id"
    `);
  }
}
