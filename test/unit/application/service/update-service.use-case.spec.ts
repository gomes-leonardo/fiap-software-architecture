import { UpdateServiceUseCase } from '@application/service/update-service.use-case';
import { ServiceRepository } from '@domain/service/service-repository.port';
import { Service } from '@domain/service/service.entity';

describe('UpdateServiceUseCase', () => {
  let useCase: UpdateServiceUseCase;
  let mockRepo: jest.Mocked<ServiceRepository>;

  beforeEach(() => {
    mockRepo = {
      save: jest.fn().mockResolvedValue(undefined),
      findById: jest.fn().mockResolvedValue(null),
      findByName: jest.fn().mockResolvedValue(null),
      findAll: jest.fn().mockResolvedValue([]),
      delete: jest.fn().mockResolvedValue(undefined),
    } as any;
    useCase = new UpdateServiceUseCase(mockRepo);
  });

  it('should update service name', async () => {
    mockRepo.findById.mockResolvedValue(Service.reconstitute('svc-1', 'Troca de óleo', 150, 30));

    const result = await useCase.execute({
      serviceId: 'svc-1',
      name: 'Troca de óleo sintético',
    });

    expect(result.name).toBe('Troca de óleo sintético');
    expect(mockRepo.save).toHaveBeenCalledTimes(1);
  });

  it('should update service price', async () => {
    mockRepo.findById.mockResolvedValue(Service.reconstitute('svc-1', 'Troca de óleo', 150, 30));

    const result = await useCase.execute({
      serviceId: 'svc-1',
      basePrice: 200,
    });

    expect(result.basePrice).toBe(200);
  });

  it('should update estimated time', async () => {
    mockRepo.findById.mockResolvedValue(Service.reconstitute('svc-1', 'Troca de óleo', 150, 30));

    const result = await useCase.execute({
      serviceId: 'svc-1',
      estimatedMinutes: 60,
    });

    expect(result.estimatedMinutes).toBe(60);
  });

  it('should throw when service not found', async () => {
    await expect(useCase.execute({ serviceId: 'nonexistent', name: 'X' })).rejects.toThrow(
      'not found',
    );
  });
});
