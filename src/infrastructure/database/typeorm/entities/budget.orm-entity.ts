import { Entity, Column, PrimaryColumn, CreateDateColumn, DeleteDateColumn } from 'typeorm';

@Entity('budgets')
export class BudgetOrmEntity {
  @PrimaryColumn('uuid')
  id!: string;

  @Column({ name: 'service_order_id', type: 'uuid' })
  serviceOrderId!: string;

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
