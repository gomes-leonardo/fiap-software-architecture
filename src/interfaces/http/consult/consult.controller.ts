import { Controller, Get, Param, Query, NotFoundException, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { FindClientUseCase } from '@application/client/find-client.use-case';
import { FindServiceOrderUseCase } from '@application/service-order/find-service-order.use-case';
import { ServiceOrderResponseDto } from '@application/service-order/dtos/service-order-response.dto';
import { RateLimitGuard } from '../guards/rate-limit.guard';

/**
 * Public consult endpoint — no JWT required.
 * Clients verify their identity with clientId + CPF/CNPJ.
 * Returns read-only service order status.
 */
@ApiTags('consult')
@Controller('consult')
@UseGuards(RateLimitGuard)
export class ConsultController {
  constructor(
    private readonly findClient: FindClientUseCase,
    private readonly findServiceOrder: FindServiceOrderUseCase,
  ) {}

  @Get(':clientId')
  @ApiOperation({
    summary: 'Consulta pública de ordens de serviço do cliente',
    description:
      'Endpoint público para o cliente acompanhar o status das suas OS. ' +
      'Requer clientId na URL e CPF/CNPJ como query parameter para verificação de identidade.',
  })
  @ApiQuery({
    name: 'cpf',
    required: true,
    description: 'CPF ou CNPJ do cliente (para verificação)',
  })
  @ApiResponse({ status: 200, type: [ServiceOrderResponseDto] })
  @ApiResponse({
    status: 404,
    description:
      'Cliente inexistente ou CPF/CNPJ que não corresponde — mesma resposta nos dois casos',
  })
  async consultByClient(
    @Param('clientId') clientId: string,
    @Query('cpf') cpf: string,
  ): Promise<ServiceOrderResponseDto[]> {
    // Cliente inexistente e CPF errado respondem igual: respostas diferentes
    // confirmariam que um clientId existe sem que se conheca o CPF dele.
    const client = await this.findClient.findById(clientId);
    const inputDigits = (cpf || '').replace(/\D/g, '');
    if (!client || inputDigits !== client.cpfCnpj.replace(/\D/g, '')) {
      throw new NotFoundException('Not found');
    }

    return this.findServiceOrder.findByClientId(clientId);
  }
}
