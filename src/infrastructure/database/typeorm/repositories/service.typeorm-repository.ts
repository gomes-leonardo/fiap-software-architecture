import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Service } from '@domain/service/service.entity';
import { ServiceRepository } from '@domain/service/service-repository.port';
import { ServiceOrmEntity } from '../entities/service.orm-entity';

@Injectable()
export class ServiceTypeOrmRepository extends ServiceRepository {
  constructor(
    @InjectRepository(ServiceOrmEntity)
    private readonly ormRepo: Repository<ServiceOrmEntity>,
  ) {
    super();
  }

  async save(service: Service): Promise<void> {
    const orm = this.toOrmEntity(service);
    await this.ormRepo.save(orm);
  }

  async findById(id: string): Promise<Service | null> {
    const orm = await this.ormRepo.findOne({ where: { id } });
    if (!orm) return null;
    return this.toDomainEntity(orm);
  }

  async findByName(name: string): Promise<Service | null> {
    const orm = await this.ormRepo.findOne({ where: { name } });
    if (!orm) return null;
    return this.toDomainEntity(orm);
  }

  async findAll(): Promise<Service[]> {
    const orms = await this.ormRepo.find();
    return orms.map((orm) => this.toDomainEntity(orm));
  }

  async delete(id: string): Promise<void> {
    await this.ormRepo.softDelete(id);
  }

  async restore(id: string): Promise<void> {
    await this.ormRepo.restore(id);
  }

  private toOrmEntity(service: Service): ServiceOrmEntity {
    const orm = new ServiceOrmEntity();
    orm.id = service.id;
    orm.name = service.name;
    orm.basePrice = service.basePrice;
    orm.estimatedMinutes = service.estimatedMinutes;
    return orm;
  }

  private toDomainEntity(orm: ServiceOrmEntity): Service {
    return Service.reconstitute(orm.id, orm.name, Number(orm.basePrice), orm.estimatedMinutes);
  }
}
