import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Body,
  Param,
  HttpCode,
  HttpStatus,
  NotFoundException,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { CreateBudgetUseCase } from '@application/budget/create-budget.use-case';
import { ApproveBudgetUseCase } from '@application/budget/approve-budget.use-case';
import { RefuseBudgetUseCase } from '@application/budget/refuse-budget.use-case';
import { CreateBudgetDto } from '@application/budget/dtos/create-budget.dto';
import { BudgetResponseDto } from '@application/budget/dtos/budget-response.dto';
import { BudgetRepository } from '@domain/budget/budget-repository.port';
import { JwtAuthGuard } from '@infrastructure/auth/jwt-auth.guard';
import { RolesGuard } from '@infrastructure/auth/roles.guard';
import { Roles } from '@infrastructure/auth/roles.decorator';
import { Role } from '@infrastructure/auth/role.enum';

@ApiTags('budgets')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@Controller('budgets')
export class BudgetController {
  constructor(
    private readonly createBudget: CreateBudgetUseCase,
    private readonly approveBudget: ApproveBudgetUseCase,
    private readonly refuseBudget: RefuseBudgetUseCase,
    private readonly budgetRepository: BudgetRepository,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Criar orçamento para uma ordem de serviço' })
  @ApiResponse({ status: 201, type: BudgetResponseDto })
  async create(@Body() dto: CreateBudgetDto): Promise<BudgetResponseDto> {
    return this.createBudget.execute(dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Buscar orçamento por ID' })
  @ApiResponse({ status: 200, type: BudgetResponseDto })
  async findById(@Param('id') id: string): Promise<BudgetResponseDto> {
    const budget = await this.budgetRepository.findById(id);
    if (!budget) throw new NotFoundException('Budget not found');
    return BudgetResponseDto.fromDomain(budget);
  }

  @Get('service-order/:serviceOrderId')
  @ApiOperation({ summary: 'Listar orçamentos de uma ordem de serviço' })
  @ApiResponse({ status: 200, type: [BudgetResponseDto] })
  async findByServiceOrder(
    @Param('serviceOrderId') serviceOrderId: string,
  ): Promise<BudgetResponseDto[]> {
    const budgets = await this.budgetRepository.findByServiceOrderId(serviceOrderId);
    return budgets.map(BudgetResponseDto.fromDomain);
  }

  @Patch(':id/approve')
  @ApiOperation({ summary: 'Aprovar orçamento' })
  @ApiResponse({ status: 200, type: BudgetResponseDto })
  async approve(@Param('id') id: string): Promise<BudgetResponseDto> {
    return this.approveBudget.execute(id);
  }

  @Patch(':id/refuse')
  @ApiOperation({ summary: 'Recusar orçamento' })
  @ApiResponse({ status: 200, type: BudgetResponseDto })
  async refuse(@Param('id') id: string): Promise<BudgetResponseDto> {
    return this.refuseBudget.execute(id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remover orçamento' })
  @ApiResponse({ status: 204 })
  async remove(@Param('id') id: string): Promise<void> {
    const budget = await this.budgetRepository.findById(id);
    if (!budget) throw new NotFoundException('Budget not found');
    await this.budgetRepository.delete(id);
  }
}
