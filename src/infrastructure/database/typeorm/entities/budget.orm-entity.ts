import {
  Entity,
  Index,
  Column,
  PrimaryColumn,
  CreateDateColumn,
  DeleteDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { ServiceOrderOrmEntity } from './service-order.orm-entity';

@Entity('budgets')
@Index('IDX_budgets_service_order_id', ['serviceOrderId'])
export class BudgetOrmEntity {
  @PrimaryColumn('uuid')
  id!: string;

  @Column({ name: 'service_order_id', type: 'uuid' })
  serviceOrderId!: string;

  @ManyToOne(() => ServiceOrderOrmEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({
    name: 'service_order_id',
    foreignKeyConstraintName: 'FK_budgets_service_order_id',
  })
  serviceOrder?: ServiceOrderOrmEntity;

  @Column({ type: 'jsonb' })
  lines!: Array<{
    type: string;
    referenceId: string;
    description: string;
    quantity: number;
    frozenUnitPrice: number;
  }>;

  @Column({ type: 'varchar', length: 20 })
  status!: string;

  @Column({ type: 'int' })
  version!: number;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  total!: number;

  @Column({ name: 'frozen_at', type: 'timestamp' })
  frozenAt!: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamp', nullable: true })
  deletedAt!: Date | null;
}
