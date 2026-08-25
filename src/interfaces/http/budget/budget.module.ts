import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BudgetController } from './budget.controller';
import { CreateBudgetUseCase } from '@application/budget/create-budget.use-case';
import { BudgetLineResolver } from '@application/budget/budget-line-resolver';
import { ApproveBudgetUseCase } from '@application/budget/approve-budget.use-case';
import { RefuseBudgetUseCase } from '@application/budget/refuse-budget.use-case';
import { BudgetRepository } from '@domain/budget/budget-repository.port';
import { BudgetTypeOrmRepository } from '@infrastructure/database/typeorm/repositories/budget.typeorm-repository';
import { BudgetOrmEntity } from '@infrastructure/database/typeorm/entities/budget.orm-entity';
import { ServiceOrderModule } from '@interfaces/http/service-order/service-order.module';
import { ServiceModule } from '@interfaces/http/service/service.module';
import { PartModule } from '@interfaces/http/part/part.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([BudgetOrmEntity]),
    ServiceOrderModule,
    ServiceModule,
    PartModule,
  ],
  controllers: [BudgetController],
  providers: [
    BudgetLineResolver,
    CreateBudgetUseCase,
    ApproveBudgetUseCase,
    RefuseBudgetUseCase,
    {
      provide: BudgetRepository,
      useClass: BudgetTypeOrmRepository,
    },
  ],
  // Os dois casos de uso saem do modulo para o `WebhookModule`: o canal externo
  // do cliente precisa da mesma baixa de estoque e do mesmo vinculo com a OS.
  exports: [BudgetRepository, ApproveBudgetUseCase, RefuseBudgetUseCase],
})
export class BudgetModule {}
