import { Part } from '@domain/part/part.entity';

describe('Part Entity', () => {
  const validProps = {
    name: 'Filtro de óleo',
    sku: 'FLT-OL-001',
    unitPrice: 35.9,
    stockQuantity: 100,
  };

  describe('creation', () => {
    it('should create a part with valid data', () => {
      const part = new Part(validProps);
      expect(part.name).toBe('Filtro de óleo');
      expect(part.sku).toBe('FLT-OL-001');
      expect(part.unitPrice).toBe(35.9);
      expect(part.stockQuantity).toBe(100);
    });

    it('should uppercase the SKU', () => {
      const part = new Part({ ...validProps, sku: 'flt-ol-001' });
      expect(part.sku).toBe('FLT-OL-001');
    });

    it('should throw when name is empty', () => {
      expect(() => new Part({ ...validProps, name: '' })).toThrow('Part name is required');
    });

    it('should throw when SKU is empty', () => {
      expect(() => new Part({ ...validProps, sku: '' })).toThrow('Part SKU is required');
    });

    it('should throw when unitPrice is negative', () => {
      expect(() => new Part({ ...validProps, unitPrice: -1 })).toThrow(
        'Unit price cannot be negative',
      );
    });

    it('should throw when stockQuantity is negative', () => {
      expect(() => new Part({ ...validProps, stockQuantity: -1 })).toThrow(
        'Stock quantity cannot be negative',
      );
    });

    it('should allow zero unitPrice', () => {
      const part = new Part({ ...validProps, unitPrice: 0 });
      expect(part.unitPrice).toBe(0);
    });

    it('should allow zero stockQuantity', () => {
      const part = new Part({ ...validProps, stockQuantity: 0 });
      expect(part.stockQuantity).toBe(0);
    });
  });

  describe('decrementStock', () => {
    it('should decrement stock correctly', () => {
      const part = new Part(validProps);
      part.decrementStock(10);
      expect(part.stockQuantity).toBe(90);
    });

    it('should allow decrementing to exactly zero', () => {
      const part = new Part({ ...validProps, stockQuantity: 5 });
      part.decrementStock(5);
      expect(part.stockQuantity).toBe(0);
    });

    it('should throw when decrementing would go negative', () => {
      const part = new Part({ ...validProps, stockQuantity: 5 });
      expect(() => part.decrementStock(6)).toThrow('Insufficient stock');
    });

    it('should throw when decrementing zero', () => {
      const part = new Part(validProps);
      expect(() => part.decrementStock(0)).toThrow('must be positive');
    });

    it('should throw when decrementing negative amount', () => {
      const part = new Part(validProps);
      expect(() => part.decrementStock(-1)).toThrow('must be positive');
    });

    it('should include part name in error message', () => {
      const part = new Part(validProps);
      expect(() => part.decrementStock(200)).toThrow('Filtro de óleo');
    });
  });

  describe('incrementStock', () => {
    it('should increment stock correctly', () => {
      const part = new Part(validProps);
      part.incrementStock(50);
      expect(part.stockQuantity).toBe(150);
    });

    it('should throw when incrementing zero', () => {
      const part = new Part(validProps);
      expect(() => part.incrementStock(0)).toThrow('must be positive');
    });

    it('should throw when incrementing negative amount', () => {
      const part = new Part(validProps);
      expect(() => part.incrementStock(-1)).toThrow('must be positive');
    });
  });

  describe('updatePrice', () => {
    it('should update price', () => {
      const part = new Part(validProps);
      part.updatePrice(42.5);
      expect(part.unitPrice).toBe(42.5);
    });

    it('should throw when price is negative', () => {
      const part = new Part(validProps);
      expect(() => part.updatePrice(-1)).toThrow('cannot be negative');
    });

    it('should allow zero price', () => {
      const part = new Part(validProps);
      part.updatePrice(0);
      expect(part.unitPrice).toBe(0);
    });
  });
});
