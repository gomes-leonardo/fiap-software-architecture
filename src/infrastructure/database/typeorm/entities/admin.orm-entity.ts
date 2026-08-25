import {
  Entity,
  Column,
  Index,
  PrimaryColumn,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
} from 'typeorm';

/**
 * A unicidade e um indice parcial (`WHERE deleted_at IS NULL`): com soft delete
 * a linha excluida continua na tabela, e uma UNIQUE comum bloquearia para
 * sempre a reutilizacao do valor.
 */
@Entity('admins')
@Index('UQ_admins_email', ['email'], { unique: true, where: '"deleted_at" IS NULL' })
export class AdminOrmEntity {
  @PrimaryColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({ type: 'varchar', length: 255 })
  email!: string;

  @Column({ name: 'password_hash', type: 'varchar', length: 255 })
  passwordHash!: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamp', nullable: true })
  deletedAt!: Date | null;
}
