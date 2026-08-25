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
import { RegisterVehicleUseCase } from '@application/vehicle/register-vehicle.use-case';
import { RegisterVehicleDto } from '@application/vehicle/dtos/register-vehicle.dto';
import { UpdateVehicleDto } from '@application/vehicle/dtos/update-vehicle.dto';
import { VehicleResponseDto } from '@application/vehicle/dtos/vehicle-response.dto';
import { VehicleRepository } from '@domain/vehicle/vehicle-repository.port';
import { JwtAuthGuard } from '@infrastructure/auth/jwt-auth.guard';

@ApiTags('vehicles')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('vehicles')
export class VehicleController {
  constructor(
    private readonly registerVehicle: RegisterVehicleUseCase,
    private readonly vehicleRepository: VehicleRepository,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Registrar novo veículo' })
  @ApiResponse({ status: 201, type: VehicleResponseDto })
  async register(@Body() dto: RegisterVehicleDto): Promise<VehicleResponseDto> {
    return this.registerVehicle.execute(dto);
  }

  @Get()
  @ApiOperation({ summary: 'Listar todos os veículos' })
  @ApiResponse({ status: 200, type: [VehicleResponseDto] })
  async findAll(): Promise<VehicleResponseDto[]> {
    const vehicles = await this.vehicleRepository.findAll();
    return vehicles.map(VehicleResponseDto.fromDomain);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Buscar veículo por ID' })
  @ApiResponse({ status: 200, type: VehicleResponseDto })
  async findById(@Param('id') id: string): Promise<VehicleResponseDto> {
    const vehicle = await this.vehicleRepository.findById(id);
    if (!vehicle) throw new NotFoundException('Vehicle not found');
    return VehicleResponseDto.fromDomain(vehicle);
  }

  @Get('client/:clientId')
  @ApiOperation({ summary: 'Buscar veículos por cliente' })
  @ApiResponse({ status: 200, type: [VehicleResponseDto] })
  async findByClient(@Param('clientId') clientId: string): Promise<VehicleResponseDto[]> {
    const vehicles = await this.vehicleRepository.findByOwnerClientId(clientId);
    return vehicles.map(VehicleResponseDto.fromDomain);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Atualizar veículo' })
  @ApiResponse({ status: 200, type: VehicleResponseDto })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateVehicleDto,
  ): Promise<VehicleResponseDto> {
    const vehicle = await this.vehicleRepository.findById(id);
    if (!vehicle) throw new NotFoundException('Vehicle not found');

    vehicle.updateInfo(dto);
    await this.vehicleRepository.save(vehicle);

    return VehicleResponseDto.fromDomain(vehicle);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remover veículo' })
  @ApiResponse({ status: 204 })
  async remove(@Param('id') id: string): Promise<void> {
    const vehicle = await this.vehicleRepository.findById(id);
    if (!vehicle) throw new NotFoundException('Vehicle not found');
    await this.vehicleRepository.delete(id);
  }
}
