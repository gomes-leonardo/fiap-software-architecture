import { Injectable } from '@nestjs/common';
import { ServiceOrderRepository } from '@domain/service-order/service-order-repository.port';
import { ServiceOrderStatus } from '@domain/service-order/service-order-status.enum';
import { ServiceOrderResponseDto } from './dtos/service-order-response.dto';

@Injectable()
export class FindServiceOrderUseCase {
  constructor(private readonly serviceOrderRepository: ServiceOrderRepository) {}

  async findById(id: string): Promise<ServiceOrderResponseDto | null> {
    const so = await this.serviceOrderRepository.findById(id);
    if (!so) return null;
    return ServiceOrderResponseDto.fromDomain(so);
  }

  async findByClientId(clientId: string): Promise<ServiceOrderResponseDto[]> {
    const orders = await this.serviceOrderRepository.findByClientId(clientId);
    return orders.map(ServiceOrderResponseDto.fromDomain);
  }

  async findByStatus(status: ServiceOrderStatus): Promise<ServiceOrderResponseDto[]> {
    const orders = await this.serviceOrderRepository.findByStatus(status);
    return orders.map(ServiceOrderResponseDto.fromDomain);
  }

  async findAllActive(): Promise<ServiceOrderResponseDto[]> {
    const orders = await this.serviceOrderRepository.findAllActive();
    return orders.map(ServiceOrderResponseDto.fromDomain);
  }
}
