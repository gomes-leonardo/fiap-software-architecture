import {
  Controller,
  Post,
  Get,
  Put,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  NotFoundException,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { CreateServiceOrderUseCase } from '@application/service-order/create-service-order.use-case';
import { ChangeServiceOrderStatusUseCase } from '@application/service-order/change-service-order-status.use-case';
import { FindServiceOrderUseCase } from '@application/service-order/find-service-order.use-case';
import { AverageExecutionTimeUseCase } from '@application/service-order/average-execution-time.use-case';
import { OperationalReportUseCase } from '@application/service-order/operational-report.use-case';
import { CreateServiceOrderDto } from '@application/service-order/dtos/create-service-order.dto';
import { ChangeStatusDto } from '@application/service-order/dtos/change-status.dto';
import { ServiceOrderResponseDto } from '@application/service-order/dtos/service-order-response.dto';
import { CreateServiceOrderResponseDto } from '@application/service-order/dtos/create-service-order-response.dto';
import { ServiceOrderStatus } from '@domain/service-order/service-order-status.enum';
import { ServiceOrderRepository } from '@domain/service-order/service-order-repository.port';
import { JwtAuthGuard } from '@infrastructure/auth/jwt-auth.guard';

@ApiTags('service-orders')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('service-orders')
export class ServiceOrderController {
  constructor(
    private readonly createServiceOrder: CreateServiceOrderUseCase,
    private readonly changeStatus: ChangeServiceOrderStatusUseCase,
    private readonly findServiceOrder: FindServiceOrderUseCase,
    private readonly averageExecutionTime: AverageExecutionTimeUseCase,
    private readonly operationalReport: OperationalReportUseCase,
    private readonly serviceOrderRepository: ServiceOrderRepository,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Criar nova ordem de serviço',
    description:
      'Aceita `services` e `parts` opcionais. Informando qualquer um deles, a OS nasce com um ' +
      'orcamento PENDENTE (precos congelados do catalogo) e ja em AGUARDANDO_APROVACAO; o id ' +
      'vem em `createdBudgetId`. Sem itens, o comportamento e o de sempre: OS em RECEBIDA, sem ' +
      'orcamento. Estoque insuficiente nao bloqueia — vira aviso em `stockWarnings`.',
  })
  @ApiResponse({ status: 201, type: CreateServiceOrderResponseDto })
  @ApiResponse({ status: 400, description: 'Cliente, servico ou peca inexistente' })
  async create(@Body() dto: CreateServiceOrderDto): Promise<CreateServiceOrderResponseDto> {
    return this.createServiceOrder.execute(dto);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Alterar status da ordem de serviço' })
  @ApiResponse({ status: 200, type: ServiceOrderResponseDto })
  @ApiResponse({ status: 400, description: 'Transição de status inválida' })
  async updateStatus(
    @Param('id') id: string,
    @Body() dto: ChangeStatusDto,
  ): Promise<ServiceOrderResponseDto> {
    return this.changeStatus.execute({
      serviceOrderId: id,
      newStatus: dto.status,
      changedBy: dto.changedBy,
    });
  }

  @Get('metrics/average-execution-time')
  @ApiOperation({ summary: 'Tempo medio de execucao dos servicos (em minutos)' })
  @ApiResponse({ status: 200 })
  async getAverageExecutionTime() {
    return this.averageExecutionTime.execute();
  }

  @Get('metrics/operational-report')
  @ApiOperation({
    summary: 'Relatorio operacional (OS por status, estoque baixo, tempo medio)',
  })
  @ApiResponse({ status: 200 })
  async getOperationalReport() {
    return this.operationalReport.execute();
  }

  @Get()
  @ApiOperation({
    summary: 'Listar ordens de serviço',
    description:
      'Sem filtro, lista apenas as OS ativas (exclui FINALIZADA, ENTREGUE e ' +
      'ENCERRADA_SEM_EXECUCAO), ordenadas por prioridade de status ' +
      '(EM_EXECUCAO > AGUARDANDO_APROVACAO > EM_DIAGNOSTICO > RECEBIDA > PAUSADO) e, ' +
      'dentro do mesmo status, da mais antiga para a mais recente. Os filtros ' +
      '`status` e `clientId` ignoram essa regra e retornam as OS correspondentes.',
  })
  @ApiQuery({ name: 'status', required: false, enum: ServiceOrderStatus })
  @ApiQuery({ name: 'clientId', required: false })
  async findAll(
    @Query('status') status?: ServiceOrderStatus,
    @Query('clientId') clientId?: string,
  ): Promise<ServiceOrderResponseDto[]> {
    if (status) return this.findServiceOrder.findByStatus(status);
    if (clientId) return this.findServiceOrder.findByClientId(clientId);
    return this.findServiceOrder.findAllActive();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Buscar ordem de serviço por ID' })
  @ApiResponse({ status: 200, type: ServiceOrderResponseDto })
  @ApiResponse({ status: 404 })
  async findById(@Param('id') id: string): Promise<ServiceOrderResponseDto> {
    const so = await this.findServiceOrder.findById(id);
    if (!so) throw new NotFoundException('Service order not found');
    return so;
  }

  @Put(':id')
  @ApiOperation({ summary: 'Atualizar descrição da ordem de serviço' })
  @ApiResponse({ status: 200, type: ServiceOrderResponseDto })
  async update(
    @Param('id') id: string,
    @Body('description') description: string,
  ): Promise<ServiceOrderResponseDto> {
    const so = await this.serviceOrderRepository.findById(id);
    if (!so) throw new NotFoundException('Service order not found');
    so.updateDescription(description);
    await this.serviceOrderRepository.save(so);
    return ServiceOrderResponseDto.fromDomain(so);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remover ordem de serviço' })
  @ApiResponse({ status: 204 })
  async remove(@Param('id') id: string): Promise<void> {
    const so = await this.serviceOrderRepository.findById(id);
    if (!so) throw new NotFoundException('Service order not found');
    await this.serviceOrderRepository.delete(id);
  }
}
