import { Body, Controller, HttpCode, HttpStatus, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBody, ApiHeader, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ChangeServiceOrderStatusUseCase } from '@application/service-order/change-service-order-status.use-case';
import { ServiceOrderResponseDto } from '@application/service-order/dtos/service-order-response.dto';
import { WebhookAuthGuard } from '../guards/webhook-auth.guard';
import { WebhookChangeStatusDto } from './dtos/webhook-change-status.dto';

@ApiTags('webhooks')
@Controller('webhooks/service-orders')
export class WebhookController {
  constructor(private readonly changeStatus: ChangeServiceOrderStatusUseCase) {}

  /**
   * Delega ao mesmo `ChangeServiceOrderStatusUseCase` do endpoint autenticado.
   * A matriz de transicao vive na entidade: vir de fora nao compra o direito de
   * pular etapa. Uma transicao ilegal cai como DomainException e o filtro
   * global a converte em 400.
   */
  @Post(':id/status')
  @HttpCode(HttpStatus.OK)
  @UseGuards(WebhookAuthGuard)
  @ApiOperation({
    summary: 'Atualizar status da OS a partir de um sistema externo',
    description:
      'Endpoint de integracao para sistemas sem login (gateway de email, ' +
      'sistema de pagamento). Autentica por segredo pre-compartilhado ' +
      '(`WEBHOOK_SECRET`), enviado em `Authorization: Bearer <segredo>` ou, ' +
      'como alternativa, no campo `token` do corpo. As mesmas regras de ' +
      'transicao do endpoint autenticado se aplicam.',
  })
  @ApiHeader({
    name: 'Authorization',
    description: 'Bearer <WEBHOOK_SECRET>. Forma preferida de apresentar o segredo.',
    required: false,
  })
  @ApiBody({ type: WebhookChangeStatusDto })
  @ApiResponse({ status: 200, type: ServiceOrderResponseDto })
  @ApiResponse({ status: 400, description: 'Transição de status inválida ou OS inexistente' })
  @ApiResponse({ status: 401, description: 'Segredo do webhook ausente ou inválido' })
  async updateStatus(
    @Param('id') id: string,
    @Body() dto: WebhookChangeStatusDto,
  ): Promise<ServiceOrderResponseDto> {
    return this.changeStatus.execute({
      serviceOrderId: id,
      newStatus: dto.status,
      changedBy: dto.changedBy,
    });
  }
}
