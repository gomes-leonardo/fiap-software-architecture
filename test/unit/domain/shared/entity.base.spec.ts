import { Entity } from '@domain/shared';

class ConcreteEntity extends Entity {
  constructor(
    public readonly name: string,
    id?: string,
  ) {
    super(id);
  }
}

describe('Entity (base)', () => {
  it('should generate a UUID when no id is provided', () => {
    const entity = new ConcreteEntity('Test');
    expect(entity.id).toBeDefined();
    expect(entity.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });

  it('should use the provided id', () => {
    const id = 'custom-id-123';
    const entity = new ConcreteEntity('Test', id);
    expect(entity.id).toBe(id);
  });

  it('should set createdAt on construction', () => {
    const before = new Date();
    const entity = new ConcreteEntity('Test');
    const after = new Date();
    expect(entity.createdAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(entity.createdAt.getTime()).toBeLessThanOrEqual(after.getTime());
  });

  it('should consider two entities with the same id as equal', () => {
    const id = 'same-id';
    const a = new ConcreteEntity('A', id);
    const b = new ConcreteEntity('B', id);
    expect(a.equals(b)).toBe(true);
  });

  it('should consider two entities with different ids as not equal', () => {
    const a = new ConcreteEntity('A');
    const b = new ConcreteEntity('B');
    expect(a.equals(b)).toBe(false);
  });

  it('should return false when comparing with null', () => {
    const a = new ConcreteEntity('A');
    expect(a.equals(null as unknown as Entity)).toBe(false);
  });

  it('should return true when comparing with itself', () => {
    const a = new ConcreteEntity('A');
    expect(a.equals(a)).toBe(true);
  });

  describe('soft delete', () => {
    it('should start out not deleted', () => {
      const entity = new ConcreteEntity('Test');
      expect(entity.isDeleted()).toBe(false);
      expect(entity.getDeletedAt()).toBeNull();
    });

    it('should stamp deletedAt and touch updatedAt when marked as deleted', () => {
      const entity = new ConcreteEntity('Test');
      const before = entity.getUpdatedAt();

      entity.markAsDeleted();

      expect(entity.isDeleted()).toBe(true);
      expect(entity.getDeletedAt()).toBeInstanceOf(Date);
      expect(entity.getUpdatedAt().getTime()).toBeGreaterThanOrEqual(before.getTime());
    });

    it('should accept an explicit deletion timestamp', () => {
      const entity = new ConcreteEntity('Test');
      const at = new Date('2024-01-01T00:00:00.000Z');

      entity.markAsDeleted(at);

      expect(entity.getDeletedAt()).toEqual(at);
    });

    it('should keep the first deletion timestamp when marked twice', () => {
      const entity = new ConcreteEntity('Test');
      const first = new Date('2024-01-01T00:00:00.000Z');
      const second = new Date('2024-06-01T00:00:00.000Z');

      entity.markAsDeleted(first);
      entity.markAsDeleted(second);

      expect(entity.getDeletedAt()).toEqual(first);
    });

    it('should clear deletedAt when restored', () => {
      const entity = new ConcreteEntity('Test');
      entity.markAsDeleted();

      entity.restore();

      expect(entity.isDeleted()).toBe(false);
      expect(entity.getDeletedAt()).toBeNull();
    });

    it('should leave updatedAt untouched when restoring an entity that was never deleted', () => {
      const entity = new ConcreteEntity('Test');
      const before = entity.getUpdatedAt();

      entity.restore();

      expect(entity.getUpdatedAt()).toBe(before);
    });

    it('should report not deleted when hydrated without running the constructor', () => {
      const hydrated = Object.create(ConcreteEntity.prototype) as ConcreteEntity;

      expect(hydrated.getDeletedAt()).toBeNull();
      expect(hydrated.isDeleted()).toBe(false);
    });
  });
});
