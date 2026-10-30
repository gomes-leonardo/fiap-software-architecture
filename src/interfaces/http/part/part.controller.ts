import {
  Controller,
  Post,
  Get,
  Put,
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
import { RegisterPartUseCase } from '@application/part/register-part.use-case';
import { AdjustStockUseCase } from '@application/part/adjust-stock.use-case';
import { RegisterPartDto } from '@application/part/dtos/register-part.dto';
import { UpdatePartDto } from '@application/part/dtos/update-part.dto';
import { PartResponseDto } from '@application/part/dtos/part-response.dto';
import { PartRepository } from '@domain/part/part-repository.port';
import { JwtAuthGuard } from '@infrastructure/auth/jwt-auth.guard';
import { RolesGuard } from '@infrastructure/auth/roles.guard';
import { Roles } from '@infrastructure/auth/roles.decorator';
import { Role } from '@infrastructure/auth/role.enum';

@ApiTags('parts')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@Controller('parts')
export class PartController {
  constructor(
    private readonly registerPart: RegisterPartUseCase,
    private readonly adjustStock: AdjustStockUseCase,
    private readonly partRepository: PartRepository,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Registrar nova peça' })
  @ApiResponse({ status: 201, type: PartResponseDto })
  async register(@Body() dto: RegisterPartDto): Promise<PartResponseDto> {
    return this.registerPart.execute(dto);
  }

  @Get()
  @ApiOperation({ summary: 'Listar todas as peças' })
  @ApiResponse({ status: 200, type: [PartResponseDto] })
  async findAll(): Promise<PartResponseDto[]> {
    const parts = await this.partRepository.findAll();
    return parts.map(PartResponseDto.fromDomain);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Buscar peça por ID' })
  @ApiResponse({ status: 200, type: PartResponseDto })
  async findById(@Param('id') id: string): Promise<PartResponseDto> {
    const part = await this.partRepository.findById(id);
    if (!part) throw new NotFoundException('Part not found');
    return PartResponseDto.fromDomain(part);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Atualizar peça (nome, preço)' })
  @ApiResponse({ status: 200, type: PartResponseDto })
  async update(@Param('id') id: string, @Body() dto: UpdatePartDto): Promise<PartResponseDto> {
    const part = await this.partRepository.findById(id);
    if (!part) throw new NotFoundException('Part not found');

    if (dto.name !== undefined) {
      part.updateName(dto.name);
    }
    if (dto.unitPrice !== undefined) {
      part.updatePrice(dto.unitPrice);
    }

    await this.partRepository.save(part);
    return PartResponseDto.fromDomain(part);
  }

  @Patch(':id/stock')
  @ApiOperation({ summary: 'Ajustar estoque (positivo = entrada, negativo = saída)' })
  @ApiResponse({ status: 200, type: PartResponseDto })
  async stock(
    @Param('id') id: string,
    @Body('quantity') quantity: number,
  ): Promise<PartResponseDto> {
    return this.adjustStock.execute({ partId: id, quantity });
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remover peça' })
  @ApiResponse({ status: 204 })
  async remove(@Param('id') id: string): Promise<void> {
    const part = await this.partRepository.findById(id);
    if (!part) throw new NotFoundException('Part not found');
    await this.partRepository.delete(id);
  }
}
