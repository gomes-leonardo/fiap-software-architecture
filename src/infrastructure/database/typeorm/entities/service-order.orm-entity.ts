import {
  Entity,
  Column,
  PrimaryColumn,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
} from 'typeorm';
import { ServiceOrderStatus } from '@domain/service-order/service-order-status.enum';

@Entity('service_orders')
export class ServiceOrderOrmEntity {
  @PrimaryColumn('uuid')
  id!: string;

  @Column({ name: 'client_id', type: 'uuid' })
  clientId!: string;

  @Column({ name: 'vehicle_id', type: 'uuid', nullable: true })
  vehicleId!: string | null;

  @Column({ type: 'text' })
  description!: string;

  @Column({ type: 'varchar', length: 50 })
  status!: ServiceOrderStatus;

  @Column({ name: 'budget_id', type: 'uuid', nullable: true })
  budgetId!: string | null;

  @Column({ name: 'status_history', type: 'jsonb', default: '[]' })
  statusHistory!: object[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamp', nullable: true })
  deletedAt!: Date | null;
}
