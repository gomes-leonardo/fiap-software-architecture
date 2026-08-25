import { RegisterVehicleUseCase } from '@application/vehicle/register-vehicle.use-case';
import { VehicleRepository } from '@domain/vehicle/vehicle-repository.port';
import { ClientRepository } from '@domain/client/client-repository.port';
import { Client } from '@domain/client/client.entity';

describe('RegisterVehicleUseCase', () => {
  let useCase: RegisterVehicleUseCase;
  let mockVehicleRepo: jest.Mocked<VehicleRepository>;
  let mockClientRepo: jest.Mocked<ClientRepository>;

  const validInput = {
    plate: 'ABC-1234',
    brand: 'Toyota',
    model: 'Corolla',
    year: 2022,
    ownerClientId: 'client-123',
  };

  beforeEach(() => {
    mockVehicleRepo = {
      save: jest.fn().mockResolvedValue(undefined),
      findById: jest.fn().mockResolvedValue(null),
      findByPlate: jest.fn().mockResolvedValue(null),
      findByOwnerClientId: jest.fn().mockResolvedValue([]),
      findAll: jest.fn().mockResolvedValue([]),
      existsByPlate: jest.fn().mockResolvedValue(false),
      delete: jest.fn().mockResolvedValue(undefined),
    } as any;

    mockClientRepo = {
      save: jest.fn(),
      findById: jest
        .fn()
        .mockResolvedValue(
          Client.reconstitute('client-123', 'João', '52998224725', null, null, []),
        ),
      findByCpfCnpj: jest.fn(),
      findAll: jest.fn(),
      existsByCpfCnpj: jest.fn(),
      delete: jest.fn(),
    } as any;

    useCase = new RegisterVehicleUseCase(mockVehicleRepo, mockClientRepo);
  });

  it('should register a vehicle successfully', async () => {
    const result = await useCase.execute(validInput);

    expect(result.id).toBeDefined();
    expect(result.plate).toBe('ABC1234');
    expect(result.brand).toBe('Toyota');
    expect(result.ownerClientId).toBe('client-123');
    expect(mockVehicleRepo.save).toHaveBeenCalledTimes(1);
  });

  it('should reject when client does not exist', async () => {
    mockClientRepo.findById.mockResolvedValue(null);

    await expect(useCase.execute(validInput)).rejects.toThrow('not found');
  });

  it('should reject duplicate plate', async () => {
    mockVehicleRepo.existsByPlate.mockResolvedValue(true);

    await expect(useCase.execute(validInput)).rejects.toThrow('already exists');
  });
});
