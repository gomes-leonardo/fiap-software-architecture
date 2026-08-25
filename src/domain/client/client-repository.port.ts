import { Client } from './client.entity';

export abstract class ClientRepository {
  abstract save(client: Client): Promise<void>;
  abstract findById(id: string): Promise<Client | null>;
  abstract findByCpfCnpj(cpfCnpj: string): Promise<Client | null>;
  abstract findAll(): Promise<Client[]>;
  abstract existsByCpfCnpj(cpfCnpj: string): Promise<boolean>;
  abstract delete(id: string): Promise<void>;
  abstract restore(id: string): Promise<void>;
}
