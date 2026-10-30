import { Injectable } from '@nestjs/common';
import { Vehicle } from '@domain/vehicle/vehicle.entity';
import { VehicleRepository } from '@domain/vehicle/vehicle-repository.port';
import { ClientRepository } from '@domain/client/client-repository.port';
import { DomainException } from '@domain/shared';
import { VehicleResponseDto } from './dtos/vehicle-response.dto';

export interface RegisterVehicleInput {
  plate: string;
  brand: string;
  model: string;
  year: number;
  ownerClientId: string;
}

@Injectable()
export class RegisterVehicleUseCase {
  constructor(
    private readonly vehicleRepository: VehicleRepository,
    private readonly clientRepository: ClientRepository,
  ) {}

  async execute(input: RegisterVehicleInput): Promise<VehicleResponseDto> {
    const client = await this.clientRepository.findById(input.ownerClientId);
    if (!client) {
      throw DomainException.of(`Client '${input.ownerClientId}' not found`);
    }

    const existingPlate = await this.vehicleRepository.existsByPlate(
      input.plate.toUpperCase().replace(/[-\s]/g, ''),
    );
    if (existingPlate) {
      throw DomainException.of(`Vehicle with plate '${input.plate}' already exists`);
    }

    const vehicle = new Vehicle({
      plate: input.plate,
      brand: input.brand,
      model: input.model,
      year: input.year,
      ownerClientId: input.ownerClientId,
    });

    await this.vehicleRepository.save(vehicle);

    return VehicleResponseDto.fromDomain(vehicle);
  }
}
