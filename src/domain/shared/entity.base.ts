import { randomUUID } from 'crypto';

export abstract class Entity {
  readonly id: string;
  readonly createdAt: Date;
  protected updatedAt: Date;
  protected deletedAt: Date | null;

  constructor(id?: string) {
    this.id = id ?? randomUUID();
    this.createdAt = new Date();
    this.updatedAt = new Date();
    this.deletedAt = null;
  }

  equals(other: Entity): boolean {
    if (!other) return false;
    if (this === other) return true;
    return this.id === other.id;
  }

  protected touch(): void {
    this.updatedAt = new Date();
  }

  getUpdatedAt(): Date {
    return this.updatedAt;
  }

  /**
   * Entidades hidratadas do banco nascem de `Object.create`, que pula o
   * construtor. Sem normalizar aqui, o campo chegaria como `undefined`.
   */
  getDeletedAt(): Date | null {
    return this.deletedAt ?? null;
  }

  isDeleted(): boolean {
    return this.getDeletedAt() !== null;
  }

  markAsDeleted(at: Date = new Date()): void {
    if (this.isDeleted()) return;
    this.deletedAt = at;
    this.touch();
  }

  restore(): void {
    if (!this.isDeleted()) return;
    this.deletedAt = null;
    this.touch();
  }
}
