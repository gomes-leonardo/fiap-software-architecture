import {
  Entity,
  Column,
  Index,
  PrimaryColumn,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { ClientOrmEntity } from './client.orm-entity';

@Entity('vehicles')
@Index('IDX_vehicles_owner_client_id', ['ownerClientId'])
@Index('UQ_vehicles_plate', ['plate'], { unique: true, where: '"deleted_at" IS NULL' })
export class VehicleOrmEntity {
  @PrimaryColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 10 })
  plate!: string;

  @Column({ type: 'varchar', length: 100 })
  brand!: string;

  @Column({ type: 'varchar', length: 100 })
  model!: string;

  @Column({ type: 'int' })
  year!: number;

  @Column({ name: 'owner_client_id', type: 'uuid' })
  ownerClientId!: string;

  @ManyToOne(() => ClientOrmEntity, (client) => client.vehicles, { onDelete: 'RESTRICT' })
  @JoinColumn({
    name: 'owner_client_id',
    foreignKeyConstraintName: 'FK_vehicles_owner_client_id',
  })
  owner?: ClientOrmEntity;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamp', nullable: true })
  deletedAt!: Date | null;
}
