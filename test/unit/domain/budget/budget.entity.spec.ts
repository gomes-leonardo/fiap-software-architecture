/**
 * GAP B — Budget Entity Tests
 *
 * These tests are COMPLETE and will FAIL until you implement the Budget entity
 * in src/domain/budget/budget.entity.ts.
 *
 * Key concepts being tested:
 * 1. Total calculation from frozen prices
 * 2. Price freezing (catalog price change doesn't affect budget)
 * 3. Status transitions (PENDENTE → APROVADO or RECUSADO)
 * 4. Re-budget versioning
 *
 * Study the ServiceOrder entity tests for the status machine pattern.
 */
import { Budget, BudgetStatus } from '@domain/budget/budget.entity';

describe('Budget Entity', () => {
  const sampleLines = [
    {
      type: 'PART' as const,
      referenceId: 'part-1',
      description: 'Filtro de óleo',
      quantity: 2,
      frozenUnitPrice: 35.0,
    },
    {
      type: 'PART' as const,
      referenceId: 'part-2',
      description: 'Óleo motor 5W30',
      quantity: 4,
      frozenUnitPrice: 25.0,
    },
    {
      type: 'SERVICE' as const,
      referenceId: 'svc-1',
      description: 'Mão de obra troca de óleo',
      quantity: 1,
      frozenUnitPrice: 80.0,
    },
  ];

  describe('creation', () => {
    it('should create a budget with status PENDENTE', () => {
      const budget = new Budget({ serviceOrderId: 'so-1', lines: sampleLines });
      expect(budget.status).toBe(BudgetStatus.PENDENTE);
      expect(budget.serviceOrderId).toBe('so-1');
      expect(budget.version).toBe(1);
      expect(budget.frozenAt).toBeInstanceOf(Date);
    });

    it('should create budget lines from input', () => {
      const budget = new Budget({ serviceOrderId: 'so-1', lines: sampleLines });
      expect(budget.lines).toHaveLength(3);
    });

    it('should throw when serviceOrderId is empty', () => {
      expect(() => new Budget({ serviceOrderId: '', lines: sampleLines })).toThrow();
    });

    it('should throw when no lines are provided', () => {
      expect(() => new Budget({ serviceOrderId: 'so-1', lines: [] })).toThrow();
    });
  });

  describe('total calculation', () => {
    it('should calculate total as sum of all line totals', () => {
      const budget = new Budget({ serviceOrderId: 'so-1', lines: sampleLines });
      // (2 * 35) + (4 * 25) + (1 * 80) = 70 + 100 + 80 = 250
      expect(budget.total).toBe(250.0);
    });

    it('should calculate total for single-line budget', () => {
      const budget = new Budget({
        serviceOrderId: 'so-1',
        lines: [
          {
            type: 'SERVICE',
            referenceId: 'svc-1',
            description: 'Diagnóstico',
            quantity: 1,
            frozenUnitPrice: 150.0,
          },
        ],
      });
      expect(budget.total).toBe(150.0);
    });
  });

  describe('price freezing', () => {
    it('budget total should NOT change even if we could change catalog prices', () => {
      // This test demonstrates the price-freezing concept:
      // The budget captures prices at creation time.
      // Even if the "catalog" price changes later, the budget total stays the same.
      const lines = [
        {
          type: 'PART' as const,
          referenceId: 'part-1',
          description: 'Filtro',
          quantity: 1,
          frozenUnitPrice: 50.0,
        },
      ];

      const budget = new Budget({ serviceOrderId: 'so-1', lines });
      const totalAtCreation = budget.total;

      // Simulate catalog price change: even if part-1 now costs 100.0,
      // the budget was frozen at 50.0
      // (There's nothing to "change" on the budget — that's the point.
      // The frozen price is immutable.)
      expect(budget.total).toBe(totalAtCreation);
      expect(budget.total).toBe(50.0); // Not 100.0
      expect(budget.lines[0].frozenUnitPrice).toBe(50.0);
    });
  });

  describe('status transitions', () => {
    it('should approve a pending budget', () => {
      const budget = new Budget({ serviceOrderId: 'so-1', lines: sampleLines });
      budget.approve();
      expect(budget.status).toBe(BudgetStatus.APROVADO);
    });

    it('should refuse a pending budget', () => {
      const budget = new Budget({ serviceOrderId: 'so-1', lines: sampleLines });
      budget.refuse();
      expect(budget.status).toBe(BudgetStatus.RECUSADO);
    });

    it('should NOT allow approving an already approved budget', () => {
      const budget = new Budget({ serviceOrderId: 'so-1', lines: sampleLines });
      budget.approve();
      expect(() => budget.approve()).toThrow();
    });

    it('should NOT allow refusing an already approved budget', () => {
      const budget = new Budget({ serviceOrderId: 'so-1', lines: sampleLines });
      budget.approve();
      expect(() => budget.refuse()).toThrow();
    });

    it('should NOT allow approving an already refused budget', () => {
      const budget = new Budget({ serviceOrderId: 'so-1', lines: sampleLines });
      budget.refuse();
      expect(() => budget.approve()).toThrow();
    });
  });

  describe('re-budget versioning', () => {
    it('should create a new version with incremented version number', () => {
      const v1 = new Budget({ serviceOrderId: 'so-1', lines: sampleLines });
      const newLines = [
        {
          type: 'SERVICE' as const,
          referenceId: 'svc-2',
          description: 'Serviço adicional',
          quantity: 1,
          frozenUnitPrice: 200.0,
        },
        ...sampleLines,
      ];

      const v2 = Budget.createNewVersion(v1, newLines);

      expect(v2.version).toBe(2);
      expect(v2.status).toBe(BudgetStatus.PENDENTE);
      expect(v2.serviceOrderId).toBe('so-1');
      expect(v2.lines).toHaveLength(4);
    });

    it('should create v3 from v2', () => {
      const v1 = new Budget({ serviceOrderId: 'so-1', lines: sampleLines });
      const v2 = Budget.createNewVersion(v1, sampleLines);
      const v3 = Budget.createNewVersion(v2, sampleLines);

      expect(v3.version).toBe(3);
    });

    it('new version should have its own total from new lines', () => {
      const v1 = new Budget({ serviceOrderId: 'so-1', lines: sampleLines });
      // v1 total = 250

      const expensiveLines = [
        {
          type: 'SERVICE' as const,
          referenceId: 'svc-1',
          description: 'Serviço premium',
          quantity: 1,
          frozenUnitPrice: 500.0,
        },
      ];
      const v2 = Budget.createNewVersion(v1, expensiveLines);

      expect(v2.total).toBe(500.0);
      // v1 total should be unchanged
      expect(v1.total).toBe(250.0);
    });

    it('new version should have a different id', () => {
      const v1 = new Budget({ serviceOrderId: 'so-1', lines: sampleLines });
      const v2 = Budget.createNewVersion(v1, sampleLines);
      expect(v2.id).not.toBe(v1.id);
    });
  });
});
