import { ServiceOrder } from './service-order.entity';
import { ServiceOrderStatus } from './service-order-status.enum';

export abstract class ServiceOrderRepository {
  abstract save(serviceOrder: ServiceOrder): Promise<void>;
  abstract findById(id: string): Promise<ServiceOrder | null>;
  abstract findByClientId(clientId: string): Promise<ServiceOrder[]>;
  abstract findByStatus(status: ServiceOrderStatus): Promise<ServiceOrder[]>;
  abstract findAll(): Promise<ServiceOrder[]>;
  abstract findAllActive(): Promise<ServiceOrder[]>;
  abstract delete(id: string): Promise<void>;
}
