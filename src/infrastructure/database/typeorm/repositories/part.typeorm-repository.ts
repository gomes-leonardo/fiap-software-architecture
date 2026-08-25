import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Part } from '@domain/part/part.entity';
import { PartRepository } from '@domain/part/part-repository.port';
import { PartOrmEntity } from '../entities/part.orm-entity';

@Injectable()
export class PartTypeOrmRepository extends PartRepository {
  constructor(
    @InjectRepository(PartOrmEntity)
    private readonly ormRepo: Repository<PartOrmEntity>,
  ) {
    super();
  }

  async save(part: Part): Promise<void> {
    const orm = this.toOrmEntity(part);
    await this.ormRepo.save(orm);
  }

  async findById(id: string): Promise<Part | null> {
    const orm = await this.ormRepo.findOne({ where: { id } });
    if (!orm) return null;
    return this.toDomainEntity(orm);
  }

  async findBySku(sku: string): Promise<Part | null> {
    const orm = await this.ormRepo.findOne({ where: { sku } });
    if (!orm) return null;
    return this.toDomainEntity(orm);
  }

  async findAll(): Promise<Part[]> {
    const orms = await this.ormRepo.find();
    return orms.map((orm) => this.toDomainEntity(orm));
  }

  async delete(id: string): Promise<void> {
    await this.ormRepo.softDelete(id);
  }

  async restore(id: string): Promise<void> {
    await this.ormRepo.restore(id);
  }

  private toOrmEntity(part: Part): PartOrmEntity {
    const orm = new PartOrmEntity();
    orm.id = part.id;
    orm.name = part.name;
    orm.sku = part.sku;
    orm.unitPrice = part.unitPrice;
    orm.stockQuantity = part.stockQuantity;
    return orm;
  }

  private toDomainEntity(orm: PartOrmEntity): Part {
    return Part.reconstitute(orm.id, orm.name, orm.sku, Number(orm.unitPrice), orm.stockQuantity);
  }
}
