import { Part } from './part.entity';

export abstract class PartRepository {
  abstract save(part: Part): Promise<void>;
  abstract findById(id: string): Promise<Part | null>;
  abstract findBySku(sku: string): Promise<Part | null>;
  abstract findAll(): Promise<Part[]>;
  abstract delete(id: string): Promise<void>;
  abstract restore(id: string): Promise<void>;
}
