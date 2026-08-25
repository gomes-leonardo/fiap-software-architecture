import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Client } from '@domain/client/client.entity';
import { ClientRepository } from '@domain/client/client-repository.port';
import { ClientOrmEntity } from '../entities/client.orm-entity';

@Injectable()
export class ClientTypeOrmRepository extends ClientRepository {
  constructor(
    @InjectRepository(ClientOrmEntity)
    private readonly ormRepo: Repository<ClientOrmEntity>,
  ) {
    super();
  }

  async save(client: Client): Promise<void> {
    const ormEntity = this.toOrmEntity(client);
    await this.ormRepo.save(ormEntity);
  }

  async findById(id: string): Promise<Client | null> {
    const orm = await this.ormRepo.findOne({ where: { id } });
    if (!orm) return null;
    return this.toDomainEntity(orm);
  }

  async findByCpfCnpj(cpfCnpj: string): Promise<Client | null> {
    const orm = await this.ormRepo.findOne({ where: { cpfCnpj } });
    if (!orm) return null;
    return this.toDomainEntity(orm);
  }

  async findAll(): Promise<Client[]> {
    const orms = await this.ormRepo.find();
    return orms.map((orm) => this.toDomainEntity(orm));
  }

  async existsByCpfCnpj(cpfCnpj: string): Promise<boolean> {
    const count = await this.ormRepo.count({ where: { cpfCnpj } });
    return count > 0;
  }

  async delete(id: string): Promise<void> {
    await this.ormRepo.softDelete(id);
  }

  async restore(id: string): Promise<void> {
    await this.ormRepo.restore(id);
  }

  private toOrmEntity(client: Client): ClientOrmEntity {
    const orm = new ClientOrmEntity();
    orm.id = client.id;
    orm.name = client.name;
    orm.cpfCnpj = client.cpfCnpj.value;
    orm.email = client.email;
    orm.phone = client.phone;
    orm.vehicleIds = [...client.vehicleIds];
    return orm;
  }

  private toDomainEntity(orm: ClientOrmEntity): Client {
    return Client.reconstitute(
      orm.id,
      orm.name,
      orm.cpfCnpj,
      orm.email,
      orm.phone,
      orm.vehicleIds || [],
    );
  }
}
