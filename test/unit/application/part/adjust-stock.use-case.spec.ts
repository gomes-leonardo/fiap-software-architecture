import { AdjustStockUseCase } from '@application/part/adjust-stock.use-case';
import { PartRepository } from '@domain/part/part-repository.port';
import { Part } from '@domain/part/part.entity';
describe('AdjustStockUseCase', () => {
  let useCase: AdjustStockUseCase;
  let mockRepo: jest.Mocked<PartRepository>;
  let samplePart: Part;

  beforeEach(() => {
    samplePart = new Part({
      name: 'Filtro',
      sku: 'FLT-001',
      unitPrice: 35.9,
      stockQuantity: 10,
    });

    mockRepo = {
      save: jest.fn().mockResolvedValue(undefined),
      findById: jest.fn().mockResolvedValue(samplePart),
      findBySku: jest.fn(),
      findAll: jest.fn(),
    } as unknown as jest.Mocked<PartRepository>;

    useCase = new AdjustStockUseCase(mockRepo);
  });

  it('should increment stock with positive quantity', async () => {
    const result = await useCase.execute({ partId: samplePart.id, quantity: 5 });
    expect(result.stockQuantity).toBe(15);
    expect(mockRepo.save).toHaveBeenCalledTimes(1);
  });

  it('should decrement stock with negative quantity', async () => {
    const result = await useCase.execute({ partId: samplePart.id, quantity: -3 });
    expect(result.stockQuantity).toBe(7);
  });

  it('should reject zero quantity', async () => {
    await expect(useCase.execute({ partId: samplePart.id, quantity: 0 })).rejects.toThrow(
      'cannot be zero',
    );
  });

  it('should reject when part not found', async () => {
    mockRepo.findById.mockResolvedValue(null);
    await expect(useCase.execute({ partId: 'non-existent', quantity: 5 })).rejects.toThrow(
      'not found',
    );
  });

  it('should reject when decrement would go negative', async () => {
    await expect(useCase.execute({ partId: samplePart.id, quantity: -20 })).rejects.toThrow(
      'Insufficient stock',
    );
  });
});
