import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Budget } from '@domain/budget/budget.entity';
import { BudgetRepository } from '@domain/budget/budget-repository.port';
import { BudgetOrmEntity } from '../entities/budget.orm-entity';
import { BudgetLine, BudgetLineType } from '@domain/budget/budget-line.vo';

@Injectable()
export class BudgetTypeOrmRepository extends BudgetRepository {
  constructor(
    @InjectRepository(BudgetOrmEntity)
    private readonly ormRepo: Repository<BudgetOrmEntity>,
  ) {
    super();
  }

  async save(budget: Budget): Promise<void> {
    const orm = this.toOrmEntity(budget);
    await this.ormRepo.save(orm);
  }

  async findById(id: string): Promise<Budget | null> {
    const orm = await this.ormRepo.findOne({ where: { id } });
    if (!orm) return null;
    return this.toDomainEntity(orm);
  }

  async findByServiceOrderId(serviceOrderId: string): Promise<Budget[]> {
    const orms = await this.ormRepo.find({
      where: { serviceOrderId },
      order: { version: 'ASC' },
    });
    return orms.map((orm) => this.toDomainEntity(orm));
  }

  async findLatestByServiceOrderId(serviceOrderId: string): Promise<Budget | null> {
    const orm = await this.ormRepo.findOne({
      where: { serviceOrderId },
      order: { version: 'DESC' },
    });
    if (!orm) return null;
    return this.toDomainEntity(orm);
  }

  async delete(id: string): Promise<void> {
    await this.ormRepo.softDelete(id);
  }

  async restore(id: string): Promise<void> {
    await this.ormRepo.restore(id);
  }

  private toOrmEntity(budget: Budget): BudgetOrmEntity {
    const orm = new BudgetOrmEntity();
    orm.id = budget.id;
    orm.serviceOrderId = budget.serviceOrderId;
    orm.lines = budget.lines.map((line) => ({
      type: line.type,
      referenceId: line.referenceId,
      description: line.description,
      quantity: line.quantity,
      frozenUnitPrice: line.frozenUnitPrice,
    }));
    orm.status = budget.status;
    orm.version = budget.version;
    orm.total = budget.total;
    orm.frozenAt = budget.frozenAt;
    return orm;
  }

  private toDomainEntity(orm: BudgetOrmEntity): Budget {
    const budget = Object.create(Budget.prototype) as Budget;
    Object.defineProperty(budget, 'id', { value: orm.id, writable: false });
    Object.defineProperty(budget, 'createdAt', { value: orm.createdAt, writable: false });

    // Use object property assignment for private fields
    (budget as any)._serviceOrderId = orm.serviceOrderId;
    (budget as any)._status = orm.status;
    (budget as any)._version = orm.version;
    (budget as any)._frozenAt = orm.frozenAt;

    // Reconstruct BudgetLine value objects
    (budget as any)._lines = orm.lines.map((line: any) =>
      BudgetLine.create(
        line.type as BudgetLineType,
        line.referenceId,
        line.description,
        line.quantity,
        line.frozenUnitPrice,
      ),
    );

    return budget;
  }
}
