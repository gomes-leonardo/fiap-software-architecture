import { Budget } from './budget.entity';

export abstract class BudgetRepository {
  abstract save(budget: Budget): Promise<void>;
  abstract findById(id: string): Promise<Budget | null>;
  abstract findByServiceOrderId(serviceOrderId: string): Promise<Budget[]>;
  abstract findLatestByServiceOrderId(serviceOrderId: string): Promise<Budget | null>;
  abstract delete(id: string): Promise<void>;
  abstract restore(id: string): Promise<void>;
}
