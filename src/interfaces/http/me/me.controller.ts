import { Controller, ForbiddenException, Get, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ClientRepository } from '@domain/client/client-repository.port';
import { VehicleRepository } from '@domain/vehicle/vehicle-repository.port';
import { FindServiceOrderUseCase } from '@application/service-order/find-service-order.use-case';
import { ServiceOrderResponseDto } from '@application/service-order/dtos/service-order-response.dto';
import { VehicleResponseDto } from '@application/vehicle/dtos/vehicle-response.dto';
import { JwtAuthGuard } from '@infrastructure/auth/jwt-auth.guard';
import { RolesGuard } from '@infrastructure/auth/roles.guard';
import { Roles } from '@infrastructure/auth/roles.decorator';
import { Role } from '@infrastructure/auth/role.enum';
import type { AuthenticatedUser } from '@infrastructure/auth/jwt.strategy';

/**
 * Rotas do cliente autenticado por CPF. O cliente nunca informa de quem sao os
 * dados: o id vem do `sub` do token, entao nao ha parametro para trocar por
 * outro cliente.
 */
@ApiTags('me')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.CLIENT)
@Controller('me')
export class MeController {
  constructor(
    private readonly clientRepository: ClientRepository,
    private readonly vehicleRepository: VehicleRepository,
    private readonly findServiceOrder: FindServiceOrderUseCase,
  ) {}

  @Get('service-orders')
  @ApiOperation({ summary: 'Ordens de servico do cliente autenticado' })
  @ApiResponse({ status: 200, type: [ServiceOrderResponseDto] })
  @ApiResponse({ status: 403, description: 'Token sem papel de cliente, ou cliente inativo' })
  async serviceOrders(@Req() req: { user: AuthenticatedUser }): Promise<ServiceOrderResponseDto[]> {
    const clientId = await this.activeClientId(req.user);
    return this.findServiceOrder.findByClientId(clientId);
  }

  @Get('vehicles')
  @ApiOperation({ summary: 'Veiculos do cliente autenticado' })
  @ApiResponse({ status: 200, type: [VehicleResponseDto] })
  @ApiResponse({ status: 403, description: 'Token sem papel de cliente, ou cliente inativo' })
  async vehicles(@Req() req: { user: AuthenticatedUser }): Promise<VehicleResponseDto[]> {
    const clientId = await this.activeClientId(req.user);
    const vehicles = await this.vehicleRepository.findByOwnerClientId(clientId);
    return vehicles.map(VehicleResponseDto.fromDomain);
  }

  /**
   * O token vale por uma hora. Um cliente inativado ou excluido nesse meio
   * tempo perde o acesso na hora, sem esperar o token expirar.
   */
  private async activeClientId(user: AuthenticatedUser): Promise<string> {
    const client = await this.clientRepository.findById(user.userId);
    if (!client || !client.isActive) {
      throw new ForbiddenException('Client is not active');
    }
    return client.id;
  }
}
