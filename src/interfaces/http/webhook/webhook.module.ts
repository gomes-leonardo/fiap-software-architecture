import { Module } from '@nestjs/common';
import { WebhookController } from './webhook.controller';
import { BudgetWebhookController } from './budget-webhook.controller';
import { WebhookAuthGuard } from '../guards/webhook-auth.guard';
import { ServiceOrderModule } from '../service-order/service-order.module';
import { BudgetModule } from '../budget/budget.module';

@Module({
  imports: [ServiceOrderModule, BudgetModule],
  controllers: [WebhookController, BudgetWebhookController],
  providers: [WebhookAuthGuard],
})
export class WebhookModule {}
