import {
  Entity,
  Index,
  Column,
  PrimaryColumn,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { ServiceOrderStatus } from '@domain/service-order/service-order-status.enum';
import { ClientOrmEntity } from './client.orm-entity';
import { VehicleOrmEntity } from './vehicle.orm-entity';
import { BudgetOrmEntity } from './budget.orm-entity';

@Entity('service_orders')
@Index('IDX_service_orders_client_id', ['clientId'])
@Index('IDX_service_orders_status', ['status'])
@Index('IDX_service_orders_vehicle_id', ['vehicleId'])
@Index('IDX_service_orders_budget_id', ['budgetId'])
export class ServiceOrderOrmEntity {
  @PrimaryColumn('uuid')
  id!: string;

  @Column({ name: 'client_id', type: 'uuid' })
  clientId!: string;

  @ManyToOne(() => ClientOrmEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'client_id', foreignKeyConstraintName: 'FK_service_orders_client_id' })
  client?: ClientOrmEntity;

  @Column({ name: 'vehicle_id', type: 'uuid', nullable: true })
  vehicleId!: string | null;

  @ManyToOne(() => VehicleOrmEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'vehicle_id', foreignKeyConstraintName: 'FK_service_orders_vehicle_id' })
  vehicle?: VehicleOrmEntity | null;

  @Column({ type: 'text' })
  description!: string;

  @Column({ type: 'varchar', length: 50 })
  status!: ServiceOrderStatus;

  @Column({ name: 'budget_id', type: 'uuid', nullable: true })
  budgetId!: string | null;

  /** Orcamento vigente. O historico de versoes fica em budgets.service_order_id. */
  @ManyToOne(() => BudgetOrmEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'budget_id', foreignKeyConstraintName: 'FK_service_orders_budget_id' })
  budget?: BudgetOrmEntity | null;

  @Column({ name: 'status_history', type: 'jsonb', default: '[]' })
  statusHistory!: object[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamp', nullable: true })
  deletedAt!: Date | null;
}
