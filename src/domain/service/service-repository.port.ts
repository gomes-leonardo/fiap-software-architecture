import { Service } from './service.entity';

export abstract class ServiceRepository {
  abstract save(service: Service): Promise<void>;
  abstract findById(id: string): Promise<Service | null>;
  abstract findByName(name: string): Promise<Service | null>;
  abstract findAll(): Promise<Service[]>;
  abstract delete(id: string): Promise<void>;
  abstract restore(id: string): Promise<void>;
}
