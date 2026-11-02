import {
  Controller,
  Post,
  Get,
  Put,
  Delete,
  Body,
  Param,
  HttpCode,
  HttpStatus,
  NotFoundException,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { RegisterServiceUseCase } from '@application/service/register-service.use-case';
import { UpdateServiceUseCase } from '@application/service/update-service.use-case';
import { RegisterServiceDto } from '@application/service/dtos/register-service.dto';
import { UpdateServiceDto } from '@application/service/dtos/update-service.dto';
import { ServiceResponseDto } from '@application/service/dtos/service-response.dto';
import { ServiceRepository } from '@domain/service/service-repository.port';
import { JwtAuthGuard } from '@infrastructure/auth/jwt-auth.guard';
import { RolesGuard } from '@infrastructure/auth/roles.guard';
import { Roles } from '@infrastructure/auth/roles.decorator';
import { Role } from '@infrastructure/auth/role.enum';

@ApiTags('services')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@Controller('services')
export class ServiceController {
  constructor(
    private readonly registerService: RegisterServiceUseCase,
    private readonly updateService: UpdateServiceUseCase,
    private readonly serviceRepository: ServiceRepository,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Registrar novo serviço' })
  @ApiResponse({ status: 201, type: ServiceResponseDto })
  async register(@Body() dto: RegisterServiceDto): Promise<ServiceResponseDto> {
    return this.registerService.execute(dto);
  }

  @Get()
  @ApiOperation({ summary: 'Listar todos os serviços' })
  @ApiResponse({ status: 200, type: [ServiceResponseDto] })
  async findAll(): Promise<ServiceResponseDto[]> {
    const services = await this.serviceRepository.findAll();
    return services.map(ServiceResponseDto.fromDomain);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Buscar serviço por ID' })
  @ApiResponse({ status: 200, type: ServiceResponseDto })
  async findById(@Param('id') id: string): Promise<ServiceResponseDto> {
    const service = await this.serviceRepository.findById(id);
    if (!service) throw new NotFoundException('Service not found');
    return ServiceResponseDto.fromDomain(service);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Atualizar serviço' })
  @ApiResponse({ status: 200, type: ServiceResponseDto })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateServiceDto,
  ): Promise<ServiceResponseDto> {
    return this.updateService.execute({ serviceId: id, ...dto });
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remover serviço' })
  @ApiResponse({ status: 204 })
  async remove(@Param('id') id: string): Promise<void> {
    const service = await this.serviceRepository.findById(id);
    if (!service) throw new NotFoundException('Service not found');
    await this.serviceRepository.delete(id);
  }
}
