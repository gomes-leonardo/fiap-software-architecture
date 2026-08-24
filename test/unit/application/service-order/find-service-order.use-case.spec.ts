import { FindServiceOrderUseCase } from '@application/service-order/find-service-order.use-case';
import { ServiceOrderRepository } from '@domain/service-order/service-order-repository.port';
import { ServiceOrder } from '@domain/service-order/service-order.entity';
import { ServiceOrderStatus } from '@domain/service-order/service-order-status.enum';
import { StatusHistory } from '@domain/service-order/status-history.vo';

describe('FindServiceOrderUseCase', () => {
  let useCase: FindServiceOrderUseCase;
  let mockRepo: jest.Mocked<ServiceOrderRepository>;

  function buildOrder(id: string, status: ServiceOrderStatus): ServiceOrder {
    return ServiceOrder.reconstitute(
      id,
      'client-1',
      null,
      `OS ${id}`,
      status,
      new StatusHistory(),
      null,
    );
  }

  beforeEach(() => {
    mockRepo = {
      save: jest.fn(),
      findById: jest.fn(),
      findByClientId: jest.fn(),
      findByStatus: jest.fn(),
      findAll: jest.fn(),
      findAllActive: jest.fn(),
      delete: jest.fn(),
    } as unknown as jest.Mocked<ServiceOrderRepository>;

    useCase = new FindServiceOrderUseCase(mockRepo);
  });

  describe('findById', () => {
    it('should return the mapped dto when the order exists', async () => {
      mockRepo.findById.mockResolvedValue(buildOrder('so-1', ServiceOrderStatus.RECEBIDA));

      const result = await useCase.findById('so-1');

      expect(result).not.toBeNull();
      expect(result!.id).toBe('so-1');
      expect(result!.status).toBe(ServiceOrderStatus.RECEBIDA);
      expect(mockRepo.findById).toHaveBeenCalledWith('so-1');
    });

    it('should return null when the order does not exist', async () => {
      mockRepo.findById.mockResolvedValue(null);

      await expect(useCase.findById('missing')).resolves.toBeNull();
    });
  });

  describe('findByClientId', () => {
    it('should map every order of the client', async () => {
      mockRepo.findByClientId.mockResolvedValue([
        buildOrder('so-1', ServiceOrderStatus.RECEBIDA),
        buildOrder('so-2', ServiceOrderStatus.ENTREGUE),
      ]);

      const result = await useCase.findByClientId('client-1');

      expect(result.map((dto) => dto.id)).toEqual(['so-1', 'so-2']);
      expect(mockRepo.findByClientId).toHaveBeenCalledWith('client-1');
    });

    it('should return an empty list when the client has no orders', async () => {
      mockRepo.findByClientId.mockResolvedValue([]);

      await expect(useCase.findByClientId('client-9')).resolves.toEqual([]);
    });
  });

  describe('findByStatus', () => {
    it('should forward the requested status to the repository', async () => {
      mockRepo.findByStatus.mockResolvedValue([buildOrder('so-1', ServiceOrderStatus.EM_EXECUCAO)]);

      const result = await useCase.findByStatus(ServiceOrderStatus.EM_EXECUCAO);

      expect(result).toHaveLength(1);
      expect(mockRepo.findByStatus).toHaveBeenCalledWith(ServiceOrderStatus.EM_EXECUCAO);
    });
  });

  describe('findAllActive', () => {
    it('should preserve the order given by the repository', async () => {
      // Ordem deliberadamente errada: quem ordena e o banco. Se alguem colocar
      // um sort() aqui na aplicacao, este teste fica vermelho.
      mockRepo.findAllActive.mockResolvedValue([
        buildOrder('so-pausado', ServiceOrderStatus.PAUSADO),
        buildOrder('so-execucao', ServiceOrderStatus.EM_EXECUCAO),
        buildOrder('so-recebida', ServiceOrderStatus.RECEBIDA),
      ]);

      const result = await useCase.findAllActive();

      expect(result.map((dto) => dto.id)).toEqual(['so-pausado', 'so-execucao', 'so-recebida']);
      expect(mockRepo.findAllActive).toHaveBeenCalledTimes(1);
    });

    it('should not fall back to the unfiltered listing', async () => {
      mockRepo.findAllActive.mockResolvedValue([]);

      await expect(useCase.findAllActive()).resolves.toEqual([]);
      expect(mockRepo.findAll).not.toHaveBeenCalled();
    });
  });
});
