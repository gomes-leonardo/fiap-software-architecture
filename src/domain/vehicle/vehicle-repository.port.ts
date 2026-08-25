import { Vehicle } from './vehicle.entity';

export abstract class VehicleRepository {
  abstract save(vehicle: Vehicle): Promise<void>;
  abstract findById(id: string): Promise<Vehicle | null>;
  abstract findByPlate(plate: string): Promise<Vehicle | null>;
  abstract findByOwnerClientId(clientId: string): Promise<Vehicle[]>;
  abstract findAll(): Promise<Vehicle[]>;
  abstract existsByPlate(plate: string): Promise<boolean>;
  abstract delete(id: string): Promise<void>;
  abstract restore(id: string): Promise<void>;
}
