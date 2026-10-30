import {
  Entity,
  Column,
  Index,
  Check,
  OneToMany,
  PrimaryColumn,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
} from 'typeorm';
import { ClientStatus } from '@domain/client/client-status.enum';
import { VehicleOrmEntity } from './vehicle.orm-entity';

@Entity('clients')
@Check('CHK_clients_status', `"status" IN ('ATIVO', 'INATIVO')`)
@Index('UQ_clients_cpf_cnpj', ['cpfCnpj'], { unique: true, where: '"deleted_at" IS NULL' })
export class ClientOrmEntity {
  @PrimaryColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({ name: 'cpf_cnpj', type: 'varchar', length: 14 })
  cpfCnpj!: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  email!: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  phone!: string | null;

  @Column({ type: 'varchar', length: 10, default: ClientStatus.ATIVO })
  status!: ClientStatus;

  @OneToMany(() => VehicleOrmEntity, (vehicle) => vehicle.owner)
  vehicles?: VehicleOrmEntity[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamp', nullable: true })
  deletedAt!: Date | null;
}
