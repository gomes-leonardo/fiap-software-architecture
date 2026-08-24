import { Module } from '@nestjs/common';
import { WebhookController } from './webhook.controller';
import { WebhookAuthGuard } from '../guards/webhook-auth.guard';
import { ServiceOrderModule } from '../service-order/service-order.module';

@Module({
  imports: [ServiceOrderModule],
  controllers: [WebhookController],
  providers: [WebhookAuthGuard],
})
export class WebhookModule {}
