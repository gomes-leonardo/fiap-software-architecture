import { ServiceOrder } from '@domain/service-order/service-order.entity';
import { ServiceOrderStatus } from '@domain/service-order/service-order-status.enum';

describe('ServiceOrder Entity', () => {
  const validProps = {
    clientId: 'client-123',
    vehicleId: 'vehicle-456',
    description: 'Troca de óleo e filtro',
  };

  function createSO() {
    return new ServiceOrder(validProps);
  }

  describe('creation', () => {
    it('should create with status RECEBIDA', () => {
      const so = createSO();
      expect(so.status).toBe(ServiceOrderStatus.RECEBIDA);
      expect(so.clientId).toBe('client-123');
      expect(so.vehicleId).toBe('vehicle-456');
      expect(so.description).toBe('Troca de óleo e filtro');
      expect(so.budgetId).toBeNull();
    });

    it('should record initial status in history', () => {
      const so = createSO();
      expect(so.statusHistory.length).toBe(1);
      const entry = so.statusHistory.entries[0];
      expect(entry.fromStatus).toBeNull();
      expect(entry.toStatus).toBe(ServiceOrderStatus.RECEBIDA);
      expect(entry.changedBy).toBe('system');
    });

    it('should throw when clientId is missing', () => {
      expect(() => new ServiceOrder({ ...validProps, clientId: '' })).toThrow(
        'Client ID is required',
      );
    });

    it('should throw when description is missing', () => {
      expect(() => new ServiceOrder({ ...validProps, description: '' })).toThrow(
        'description is required',
      );
    });

    it('should create without vehicleId', () => {
      const so = new ServiceOrder({ clientId: 'c1', description: 'test' });
      expect(so.vehicleId).toBeNull();
    });
  });

  describe('happy path transitions', () => {
    it('RECEBIDA → EM_DIAGNOSTICO', () => {
      const so = createSO();
      so.changeStatus(ServiceOrderStatus.EM_DIAGNOSTICO, 'admin-1');
      expect(so.status).toBe(ServiceOrderStatus.EM_DIAGNOSTICO);
      expect(so.statusHistory.length).toBe(2);
    });

    it('EM_DIAGNOSTICO → AGUARDANDO_APROVACAO', () => {
      const so = createSO();
      so.changeStatus(ServiceOrderStatus.EM_DIAGNOSTICO, 'admin-1');
      so.changeStatus(ServiceOrderStatus.AGUARDANDO_APROVACAO, 'admin-1');
      expect(so.status).toBe(ServiceOrderStatus.AGUARDANDO_APROVACAO);
    });

    it('AGUARDANDO_APROVACAO → EM_EXECUCAO (with budget)', () => {
      const so = createSO();
      so.changeStatus(ServiceOrderStatus.EM_DIAGNOSTICO, 'admin-1');
      so.changeStatus(ServiceOrderStatus.AGUARDANDO_APROVACAO, 'admin-1');
      so.setBudget('budget-1');
      so.changeStatus(ServiceOrderStatus.EM_EXECUCAO, 'admin-1');
      expect(so.status).toBe(ServiceOrderStatus.EM_EXECUCAO);
    });

    it('EM_EXECUCAO → FINALIZADA', () => {
      const so = createSO();
      so.changeStatus(ServiceOrderStatus.EM_DIAGNOSTICO, 'admin-1');
      so.changeStatus(ServiceOrderStatus.AGUARDANDO_APROVACAO, 'admin-1');
      so.setBudget('budget-1');
      so.changeStatus(ServiceOrderStatus.EM_EXECUCAO, 'admin-1');
      so.changeStatus(ServiceOrderStatus.FINALIZADA, 'admin-1');
      expect(so.status).toBe(ServiceOrderStatus.FINALIZADA);
    });

    it('FINALIZADA → ENTREGUE', () => {
      const so = createSO();
      so.changeStatus(ServiceOrderStatus.EM_DIAGNOSTICO, 'admin-1');
      so.changeStatus(ServiceOrderStatus.AGUARDANDO_APROVACAO, 'admin-1');
      so.setBudget('budget-1');
      so.changeStatus(ServiceOrderStatus.EM_EXECUCAO, 'admin-1');
      so.changeStatus(ServiceOrderStatus.FINALIZADA, 'admin-1');
      so.changeStatus(ServiceOrderStatus.ENTREGUE, 'admin-1');
      expect(so.status).toBe(ServiceOrderStatus.ENTREGUE);
    });

    it('full happy path records all history entries', () => {
      const so = createSO();
      so.changeStatus(ServiceOrderStatus.EM_DIAGNOSTICO, 'admin-1');
      so.changeStatus(ServiceOrderStatus.AGUARDANDO_APROVACAO, 'admin-1');
      so.setBudget('budget-1');
      so.changeStatus(ServiceOrderStatus.EM_EXECUCAO, 'admin-1');
      so.changeStatus(ServiceOrderStatus.FINALIZADA, 'admin-1');
      so.changeStatus(ServiceOrderStatus.ENTREGUE, 'admin-1');

      // 1 initial + 5 transitions = 6 entries
      expect(so.statusHistory.length).toBe(6);
    });
  });

  describe('exception transitions', () => {
    describe('re-budget: EM_EXECUCAO → AGUARDANDO_APROVACAO', () => {
      it('should allow re-budget transition', () => {
        const so = createSO();
        so.changeStatus(ServiceOrderStatus.EM_DIAGNOSTICO, 'admin-1');
        so.changeStatus(ServiceOrderStatus.AGUARDANDO_APROVACAO, 'admin-1');
        so.setBudget('budget-1');
        so.changeStatus(ServiceOrderStatus.EM_EXECUCAO, 'admin-1');

        // Re-budget: back to AGUARDANDO_APROVACAO
        so.changeStatus(ServiceOrderStatus.AGUARDANDO_APROVACAO, 'admin-1');
        expect(so.status).toBe(ServiceOrderStatus.AGUARDANDO_APROVACAO);
      });

      it('should allow continuing after re-budget with new budget', () => {
        const so = createSO();
        so.changeStatus(ServiceOrderStatus.EM_DIAGNOSTICO, 'admin-1');
        so.changeStatus(ServiceOrderStatus.AGUARDANDO_APROVACAO, 'admin-1');
        so.setBudget('budget-1');
        so.changeStatus(ServiceOrderStatus.EM_EXECUCAO, 'admin-1');

        // Re-budget
        so.changeStatus(ServiceOrderStatus.AGUARDANDO_APROVACAO, 'admin-1');
        so.setBudget('budget-2');
        so.changeStatus(ServiceOrderStatus.EM_EXECUCAO, 'admin-1');

        expect(so.status).toBe(ServiceOrderStatus.EM_EXECUCAO);
        expect(so.budgetId).toBe('budget-2');
      });
    });

    describe('stock pause: EM_EXECUCAO ↔ PAUSADO', () => {
      it('should allow pausing execution', () => {
        const so = createSO();
        so.changeStatus(ServiceOrderStatus.EM_DIAGNOSTICO, 'admin-1');
        so.changeStatus(ServiceOrderStatus.AGUARDANDO_APROVACAO, 'admin-1');
        so.setBudget('budget-1');
        so.changeStatus(ServiceOrderStatus.EM_EXECUCAO, 'admin-1');
        so.changeStatus(ServiceOrderStatus.PAUSADO, 'admin-1');
        expect(so.status).toBe(ServiceOrderStatus.PAUSADO);
      });

      it('should allow resuming from pause', () => {
        const so = createSO();
        so.changeStatus(ServiceOrderStatus.EM_DIAGNOSTICO, 'admin-1');
        so.changeStatus(ServiceOrderStatus.AGUARDANDO_APROVACAO, 'admin-1');
        so.setBudget('budget-1');
        so.changeStatus(ServiceOrderStatus.EM_EXECUCAO, 'admin-1');
        so.changeStatus(ServiceOrderStatus.PAUSADO, 'admin-1');
        so.changeStatus(ServiceOrderStatus.EM_EXECUCAO, 'admin-1');
        expect(so.status).toBe(ServiceOrderStatus.EM_EXECUCAO);
      });

      it('should allow multiple pause/resume cycles', () => {
        const so = createSO();
        so.changeStatus(ServiceOrderStatus.EM_DIAGNOSTICO, 'admin-1');
        so.changeStatus(ServiceOrderStatus.AGUARDANDO_APROVACAO, 'admin-1');
        so.setBudget('budget-1');
        so.changeStatus(ServiceOrderStatus.EM_EXECUCAO, 'admin-1');

        // Pause and resume twice
        so.changeStatus(ServiceOrderStatus.PAUSADO, 'admin-1');
        so.changeStatus(ServiceOrderStatus.EM_EXECUCAO, 'admin-1');
        so.changeStatus(ServiceOrderStatus.PAUSADO, 'admin-1');
        so.changeStatus(ServiceOrderStatus.EM_EXECUCAO, 'admin-1');

        expect(so.status).toBe(ServiceOrderStatus.EM_EXECUCAO);
      });
    });

    describe('refusal: AGUARDANDO_APROVACAO → ENCERRADA_SEM_EXECUCAO', () => {
      it('should allow refusal', () => {
        const so = createSO();
        so.changeStatus(ServiceOrderStatus.EM_DIAGNOSTICO, 'admin-1');
        so.changeStatus(ServiceOrderStatus.AGUARDANDO_APROVACAO, 'admin-1');
        so.changeStatus(ServiceOrderStatus.ENCERRADA_SEM_EXECUCAO, 'admin-1');
        expect(so.status).toBe(ServiceOrderStatus.ENCERRADA_SEM_EXECUCAO);
      });
    });
  });

  describe('illegal transitions', () => {
    it('RECEBIDA → EM_EXECUCAO (skip steps)', () => {
      const so = createSO();
      expect(() => so.changeStatus(ServiceOrderStatus.EM_EXECUCAO, 'admin-1')).toThrow(
        'Invalid transition',
      );
    });

    it('RECEBIDA → FINALIZADA (skip steps)', () => {
      const so = createSO();
      expect(() => so.changeStatus(ServiceOrderStatus.FINALIZADA, 'admin-1')).toThrow(
        'Invalid transition',
      );
    });

    it('RECEBIDA → ENTREGUE (skip steps)', () => {
      const so = createSO();
      expect(() => so.changeStatus(ServiceOrderStatus.ENTREGUE, 'admin-1')).toThrow(
        'Invalid transition',
      );
    });

    it('RECEBIDA → PAUSADO (invalid)', () => {
      const so = createSO();
      expect(() => so.changeStatus(ServiceOrderStatus.PAUSADO, 'admin-1')).toThrow(
        'Invalid transition',
      );
    });

    it('RECEBIDA → ENCERRADA_SEM_EXECUCAO (can only refuse from AGUARDANDO)', () => {
      const so = createSO();
      expect(() => so.changeStatus(ServiceOrderStatus.ENCERRADA_SEM_EXECUCAO, 'admin-1')).toThrow(
        'Invalid transition',
      );
    });

    it('EM_DIAGNOSTICO → EM_EXECUCAO (skip AGUARDANDO)', () => {
      const so = createSO();
      so.changeStatus(ServiceOrderStatus.EM_DIAGNOSTICO, 'admin-1');
      expect(() => so.changeStatus(ServiceOrderStatus.EM_EXECUCAO, 'admin-1')).toThrow(
        'Invalid transition',
      );
    });

    it('ENTREGUE → any (terminal state)', () => {
      const so = createSO();
      so.changeStatus(ServiceOrderStatus.EM_DIAGNOSTICO, 'admin-1');
      so.changeStatus(ServiceOrderStatus.AGUARDANDO_APROVACAO, 'admin-1');
      so.setBudget('b1');
      so.changeStatus(ServiceOrderStatus.EM_EXECUCAO, 'admin-1');
      so.changeStatus(ServiceOrderStatus.FINALIZADA, 'admin-1');
      so.changeStatus(ServiceOrderStatus.ENTREGUE, 'admin-1');

      expect(() => so.changeStatus(ServiceOrderStatus.RECEBIDA, 'admin-1')).toThrow(
        'Invalid transition',
      );
    });

    it('ENCERRADA_SEM_EXECUCAO → any (terminal state)', () => {
      const so = createSO();
      so.changeStatus(ServiceOrderStatus.EM_DIAGNOSTICO, 'admin-1');
      so.changeStatus(ServiceOrderStatus.AGUARDANDO_APROVACAO, 'admin-1');
      so.changeStatus(ServiceOrderStatus.ENCERRADA_SEM_EXECUCAO, 'admin-1');

      expect(() => so.changeStatus(ServiceOrderStatus.RECEBIDA, 'admin-1')).toThrow(
        'Invalid transition',
      );
    });

    it('PAUSADO → FINALIZADA (must resume first)', () => {
      const so = createSO();
      so.changeStatus(ServiceOrderStatus.EM_DIAGNOSTICO, 'admin-1');
      so.changeStatus(ServiceOrderStatus.AGUARDANDO_APROVACAO, 'admin-1');
      so.setBudget('b1');
      so.changeStatus(ServiceOrderStatus.EM_EXECUCAO, 'admin-1');
      so.changeStatus(ServiceOrderStatus.PAUSADO, 'admin-1');

      expect(() => so.changeStatus(ServiceOrderStatus.FINALIZADA, 'admin-1')).toThrow(
        'Invalid transition',
      );
    });

    it('FINALIZADA → EM_EXECUCAO (cannot go back)', () => {
      const so = createSO();
      so.changeStatus(ServiceOrderStatus.EM_DIAGNOSTICO, 'admin-1');
      so.changeStatus(ServiceOrderStatus.AGUARDANDO_APROVACAO, 'admin-1');
      so.setBudget('b1');
      so.changeStatus(ServiceOrderStatus.EM_EXECUCAO, 'admin-1');
      so.changeStatus(ServiceOrderStatus.FINALIZADA, 'admin-1');

      expect(() => so.changeStatus(ServiceOrderStatus.EM_EXECUCAO, 'admin-1')).toThrow(
        'Invalid transition',
      );
    });
  });

  describe('budget rules', () => {
    it('should NOT allow EM_EXECUCAO without budget', () => {
      const so = createSO();
      so.changeStatus(ServiceOrderStatus.EM_DIAGNOSTICO, 'admin-1');
      so.changeStatus(ServiceOrderStatus.AGUARDANDO_APROVACAO, 'admin-1');

      // No budget set
      expect(() => so.changeStatus(ServiceOrderStatus.EM_EXECUCAO, 'admin-1')).toThrow(
        'no approved budget',
      );
    });

    it('should allow EM_EXECUCAO with budget set', () => {
      const so = createSO();
      so.changeStatus(ServiceOrderStatus.EM_DIAGNOSTICO, 'admin-1');
      so.changeStatus(ServiceOrderStatus.AGUARDANDO_APROVACAO, 'admin-1');
      so.setBudget('budget-1');
      so.changeStatus(ServiceOrderStatus.EM_EXECUCAO, 'admin-1');

      expect(so.status).toBe(ServiceOrderStatus.EM_EXECUCAO);
      expect(so.budgetId).toBe('budget-1');
    });

    it('should throw when setting empty budget id', () => {
      const so = createSO();
      expect(() => so.setBudget('')).toThrow('Budget ID is required');
    });

    it('should clear budget on clearBudget', () => {
      const so = createSO();
      so.setBudget('budget-1');
      so.clearBudget();
      expect(so.budgetId).toBeNull();
    });
  });

  describe('status history tracking', () => {
    it('every transition produces a history entry with correct data', () => {
      const so = createSO();
      so.changeStatus(ServiceOrderStatus.EM_DIAGNOSTICO, 'admin-42');

      const entries = so.statusHistory.entries;
      const lastEntry = entries[entries.length - 1];
      expect(lastEntry.fromStatus).toBe(ServiceOrderStatus.RECEBIDA);
      expect(lastEntry.toStatus).toBe(ServiceOrderStatus.EM_DIAGNOSTICO);
      expect(lastEntry.changedBy).toBe('admin-42');
      expect(lastEntry.changedAt).toBeInstanceOf(Date);
    });

    it('history preserves all entries through complex flow', () => {
      const so = createSO();
      so.changeStatus(ServiceOrderStatus.EM_DIAGNOSTICO, 'admin-1');
      so.changeStatus(ServiceOrderStatus.AGUARDANDO_APROVACAO, 'admin-1');
      so.setBudget('b1');
      so.changeStatus(ServiceOrderStatus.EM_EXECUCAO, 'admin-1');
      so.changeStatus(ServiceOrderStatus.PAUSADO, 'admin-1');
      so.changeStatus(ServiceOrderStatus.EM_EXECUCAO, 'admin-1');
      so.changeStatus(ServiceOrderStatus.AGUARDANDO_APROVACAO, 'admin-1'); // re-budget
      so.setBudget('b2');
      so.changeStatus(ServiceOrderStatus.EM_EXECUCAO, 'admin-1');
      so.changeStatus(ServiceOrderStatus.FINALIZADA, 'admin-1');
      so.changeStatus(ServiceOrderStatus.ENTREGUE, 'admin-1');

      // 1 initial + 9 transitions = 10 entries
      expect(so.statusHistory.length).toBe(10);
    });
  });
});
