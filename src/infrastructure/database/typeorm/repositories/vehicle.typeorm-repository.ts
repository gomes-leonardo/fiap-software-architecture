import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Vehicle } from '@domain/vehicle/vehicle.entity';
import { VehicleRepository } from '@domain/vehicle/vehicle-repository.port';
import { VehicleOrmEntity } from '../entities/vehicle.orm-entity';

@Injectable()
export class VehicleTypeOrmRepository extends VehicleRepository {
  constructor(
    @InjectRepository(VehicleOrmEntity)
    private readonly ormRepo: Repository<VehicleOrmEntity>,
  ) {
    super();
  }

  async save(vehicle: Vehicle): Promise<void> {
    const orm = this.toOrmEntity(vehicle);
    await this.ormRepo.save(orm);
  }

  async findById(id: string): Promise<Vehicle | null> {
    const orm = await this.ormRepo.findOne({ where: { id } });
    if (!orm) return null;
    return this.toDomainEntity(orm);
  }

  async findByPlate(plate: string): Promise<Vehicle | null> {
    const orm = await this.ormRepo.findOne({ where: { plate } });
    if (!orm) return null;
    return this.toDomainEntity(orm);
  }

  async findByOwnerClientId(clientId: string): Promise<Vehicle[]> {
    const orms = await this.ormRepo.find({ where: { ownerClientId: clientId } });
    return orms.map((orm) => this.toDomainEntity(orm));
  }

  async findAll(): Promise<Vehicle[]> {
    const orms = await this.ormRepo.find();
    return orms.map((orm) => this.toDomainEntity(orm));
  }

  async existsByPlate(plate: string): Promise<boolean> {
    const count = await this.ormRepo.count({ where: { plate } });
    return count > 0;
  }

  async delete(id: string): Promise<void> {
    await this.ormRepo.softDelete(id);
  }

  async restore(id: string): Promise<void> {
    await this.ormRepo.restore(id);
  }

  private toOrmEntity(vehicle: Vehicle): VehicleOrmEntity {
    const orm = new VehicleOrmEntity();
    orm.id = vehicle.id;
    orm.plate = vehicle.plate.value;
    orm.brand = vehicle.brand;
    orm.model = vehicle.model;
    orm.year = vehicle.year;
    orm.ownerClientId = vehicle.ownerClientId;
    return orm;
  }

  private toDomainEntity(orm: VehicleOrmEntity): Vehicle {
    return Vehicle.reconstitute(
      orm.id,
      orm.plate,
      orm.brand,
      orm.model,
      orm.year,
      orm.ownerClientId,
    );
  }
}
