import { AdminOrmEntity } from './admin.orm-entity';
import { BudgetOrmEntity } from './budget.orm-entity';
import { ClientOrmEntity } from './client.orm-entity';
import { PartOrmEntity } from './part.orm-entity';
import { ServiceOrderOrmEntity } from './service-order.orm-entity';
import { ServiceOrmEntity } from './service.orm-entity';
import { VehicleOrmEntity } from './vehicle.orm-entity';

export const ENTITIES = [
  AdminOrmEntity,
  ClientOrmEntity,
  VehicleOrmEntity,
  ServiceOrmEntity,
  PartOrmEntity,
  ServiceOrderOrmEntity,
  BudgetOrmEntity,
];
