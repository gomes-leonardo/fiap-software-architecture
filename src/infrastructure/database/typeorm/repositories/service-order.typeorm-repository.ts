import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ServiceOrder } from '@domain/service-order/service-order.entity';
import { ServiceOrderRepository } from '@domain/service-order/service-order-repository.port';
import {
  ACTIVE_SERVICE_ORDER_STATUSES,
  SERVICE_ORDER_STATUS_RULES,
  ServiceOrderStatus,
} from '@domain/service-order/service-order-status.enum';
import { StatusHistory, StatusHistoryEntry } from '@domain/service-order/status-history.vo';
import { ServiceOrderOrmEntity } from '../entities/service-order.orm-entity';

@Injectable()
export class ServiceOrderTypeOrmRepository extends ServiceOrderRepository {
  constructor(
    @InjectRepository(ServiceOrderOrmEntity)
    private readonly ormRepo: Repository<ServiceOrderOrmEntity>,
  ) {
    super();
  }

  async save(serviceOrder: ServiceOrder): Promise<void> {
    const orm = this.toOrmEntity(serviceOrder);
    await this.ormRepo.save(orm);
  }

  async findById(id: string): Promise<ServiceOrder | null> {
    const orm = await this.ormRepo.findOne({ where: { id } });
    if (!orm) return null;
    return this.toDomainEntity(orm);
  }

  async findByClientId(clientId: string): Promise<ServiceOrder[]> {
    const orms = await this.ormRepo.find({ where: { clientId } });
    return orms.map((orm) => this.toDomainEntity(orm));
  }

  async findByStatus(status: ServiceOrderStatus): Promise<ServiceOrder[]> {
    const orms = await this.ormRepo.find({ where: { status } });
    return orms.map((orm) => this.toDomainEntity(orm));
  }

  async findAll(): Promise<ServiceOrder[]> {
    const orms = await this.ormRepo.find();
    return orms.map((orm) => this.toDomainEntity(orm));
  }

  /**
   * Lista as OS ainda em andamento, da maior para a menor prioridade de status
   * e, dentro do mesmo status, da mais antiga para a mais recente. O CASE e o
   * ORDER BY rodam no banco: ordenar em memoria seria impossivel, porque
   * ServiceOrder.reconstitute() recarimba createdAt no instante da hidratacao.
   */
  async findAllActive(): Promise<ServiceOrder[]> {
    const qb = this.ormRepo.createQueryBuilder('so');

    // O CASE cobre exatamente os status que o WHERE deixa passar, por isso nao
    // precisa de ELSE. Os status entram como bind param, nunca interpolados.
    const whenClauses: string[] = [];
    for (const [index, status] of ACTIVE_SERVICE_ORDER_STATUSES.entries()) {
      qb.setParameter(`priorityStatus${index}`, status);
      whenClauses.push(
        `WHEN so.status = :priorityStatus${index} THEN ${SERVICE_ORDER_STATUS_RULES[status].priority}`,
      );
    }

    const orms = await qb
      .where('so.status IN (:...activeStatuses)', {
        activeStatuses: [...ACTIVE_SERVICE_ORDER_STATUSES],
      })
      .orderBy(`CASE ${whenClauses.join(' ')} END`, 'ASC')
      .addOrderBy('so.createdAt', 'ASC')
      .getMany();

    return orms.map((orm) => this.toDomainEntity(orm));
  }

  async delete(id: string): Promise<void> {
    await this.ormRepo.delete(id);
  }

  private toOrmEntity(so: ServiceOrder): ServiceOrderOrmEntity {
    const orm = new ServiceOrderOrmEntity();
    orm.id = so.id;
    orm.clientId = so.clientId;
    orm.vehicleId = so.vehicleId;
    orm.description = so.description;
    orm.status = so.status;
    orm.budgetId = so.budgetId;
    orm.statusHistory = so.statusHistory.toJSON();
    return orm;
  }

  private toDomainEntity(orm: ServiceOrderOrmEntity): ServiceOrder {
    const history = StatusHistory.fromJSON(orm.statusHistory as StatusHistoryEntry[]);
    return ServiceOrder.reconstitute(
      orm.id,
      orm.clientId,
      orm.vehicleId,
      orm.description,
      orm.status,
      history,
      orm.budgetId,
    );
  }
}
