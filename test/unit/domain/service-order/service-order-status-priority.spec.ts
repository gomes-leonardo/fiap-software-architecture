import {
  ACTIVE_SERVICE_ORDER_STATUSES,
  EXCLUDED_FROM_ACTIVE_LISTING,
  SERVICE_ORDER_STATUS_RULES,
  ServiceOrderStatus,
} from '@domain/service-order/service-order-status.enum';

/**
 * As asserções abaixo são literais copiados do critério de aceite da issue #3.
 * Nenhuma delas recalcula o resultado do jeito que a implementação calcula —
 * senão o teste passaria a concordar com o bug em vez de com o requisito.
 */
describe('ServiceOrder status rules', () => {
  describe('SERVICE_ORDER_STATUS_RULES', () => {
    it('should cover every status of the enum', () => {
      expect(Object.keys(SERVICE_ORDER_STATUS_RULES).sort()).toEqual(
        Object.values(ServiceOrderStatus).sort(),
      );
    });

    it('should rank the active statuses in the order defined by the acceptance criteria', () => {
      const ranking = [
        ServiceOrderStatus.EM_EXECUCAO,
        ServiceOrderStatus.AGUARDANDO_APROVACAO,
        ServiceOrderStatus.EM_DIAGNOSTICO,
        ServiceOrderStatus.RECEBIDA,
        ServiceOrderStatus.PAUSADO,
      ];

      for (let i = 0; i < ranking.length - 1; i++) {
        expect(SERVICE_ORDER_STATUS_RULES[ranking[i]].priority).toBeLessThan(
          SERVICE_ORDER_STATUS_RULES[ranking[i + 1]].priority,
        );
      }
    });

    it('should flag as terminal exactly the statuses the listing must hide', () => {
      expect(SERVICE_ORDER_STATUS_RULES[ServiceOrderStatus.FINALIZADA].terminal).toBe(true);
      expect(SERVICE_ORDER_STATUS_RULES[ServiceOrderStatus.ENTREGUE].terminal).toBe(true);
      expect(SERVICE_ORDER_STATUS_RULES[ServiceOrderStatus.ENCERRADA_SEM_EXECUCAO].terminal).toBe(
        true,
      );

      expect(SERVICE_ORDER_STATUS_RULES[ServiceOrderStatus.RECEBIDA].terminal).toBe(false);
      expect(SERVICE_ORDER_STATUS_RULES[ServiceOrderStatus.EM_DIAGNOSTICO].terminal).toBe(false);
      expect(SERVICE_ORDER_STATUS_RULES[ServiceOrderStatus.AGUARDANDO_APROVACAO].terminal).toBe(
        false,
      );
      expect(SERVICE_ORDER_STATUS_RULES[ServiceOrderStatus.EM_EXECUCAO].terminal).toBe(false);
      expect(SERVICE_ORDER_STATUS_RULES[ServiceOrderStatus.PAUSADO].terminal).toBe(false);
    });
  });

  describe('ACTIVE_SERVICE_ORDER_STATUSES', () => {
    it('should list the active statuses from the highest to the lowest priority', () => {
      expect([...ACTIVE_SERVICE_ORDER_STATUSES]).toEqual([
        ServiceOrderStatus.EM_EXECUCAO,
        ServiceOrderStatus.AGUARDANDO_APROVACAO,
        ServiceOrderStatus.EM_DIAGNOSTICO,
        ServiceOrderStatus.RECEBIDA,
        ServiceOrderStatus.PAUSADO,
      ]);
    });
  });

  describe('EXCLUDED_FROM_ACTIVE_LISTING', () => {
    it('should hold exactly the three terminal statuses', () => {
      expect([...EXCLUDED_FROM_ACTIVE_LISTING]).toEqual([
        ServiceOrderStatus.FINALIZADA,
        ServiceOrderStatus.ENTREGUE,
        ServiceOrderStatus.ENCERRADA_SEM_EXECUCAO,
      ]);
    });

    it('should not leak any excluded status into the active listing', () => {
      for (const status of EXCLUDED_FROM_ACTIVE_LISTING) {
        expect(ACTIVE_SERVICE_ORDER_STATUSES).not.toContain(status);
      }
    });

    it('should split the enum with no status left unclassified', () => {
      expect([...ACTIVE_SERVICE_ORDER_STATUSES, ...EXCLUDED_FROM_ACTIVE_LISTING].sort()).toEqual(
        Object.values(ServiceOrderStatus).sort(),
      );
    });
  });
});
