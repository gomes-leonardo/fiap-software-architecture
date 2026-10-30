import { Entity, DomainException } from '@domain/shared';
import { CpfCnpj } from './cpf-cnpj.vo';
import { ClientStatus } from './client-status.enum';

export interface CreateClientProps {
  name: string;
  cpfCnpj: string;
  email?: string;
  phone?: string;
}

export class Client extends Entity {
  private _name: string;
  private _cpfCnpj: CpfCnpj;
  private _email: string | null;
  private _phone: string | null;
  private _status: ClientStatus;
  private _vehicleIds: string[];

  constructor(props: CreateClientProps, id?: string) {
    super(id);

    if (!props.name || props.name.trim().length === 0) {
      throw DomainException.of('Client name is required');
    }

    this._name = props.name.trim();
    this._cpfCnpj = CpfCnpj.create(props.cpfCnpj);
    this._email = props.email ?? null;
    this._phone = props.phone ?? null;
    this._status = ClientStatus.ATIVO;
    this._vehicleIds = [];
  }

  get name(): string {
    return this._name;
  }

  get cpfCnpj(): CpfCnpj {
    return this._cpfCnpj;
  }

  get email(): string | null {
    return this._email;
  }

  get phone(): string | null {
    return this._phone;
  }

  get status(): ClientStatus {
    return this._status;
  }

  get isActive(): boolean {
    return this._status === ClientStatus.ATIVO;
  }

  /**
   * Somente leitura: a fonte da verdade da relacao cliente-veiculo e
   * `vehicles.owner_client_id`, carregada pelo repositorio.
   */
  get vehicleIds(): ReadonlyArray<string> {
    return [...this._vehicleIds];
  }

  activate(): void {
    this._status = ClientStatus.ATIVO;
    this.touch();
  }

  deactivate(): void {
    this._status = ClientStatus.INATIVO;
    this.touch();
  }

  update(props: { name?: string; email?: string; phone?: string }): void {
    if (props.name !== undefined) {
      if (!props.name || props.name.trim().length === 0) {
        throw DomainException.of('Client name is required');
      }
      this._name = props.name.trim();
    }
    if (props.email !== undefined) {
      this._email = props.email;
    }
    if (props.phone !== undefined) {
      this._phone = props.phone;
    }
    this.touch();
  }

  static reconstitute(
    id: string,
    name: string,
    cpfCnpjValue: string,
    email: string | null,
    phone: string | null,
    status: ClientStatus,
    vehicleIds: string[],
  ): Client {
    const client = Object.create(Client.prototype) as Client;
    Object.defineProperty(client, 'id', { value: id, writable: false });
    Object.defineProperty(client, 'createdAt', { value: new Date(), writable: false });
    client.updatedAt = new Date();
    client._name = name;
    client._cpfCnpj = CpfCnpj.create(cpfCnpjValue);
    client._email = email;
    client._phone = phone;
    client._status = status;
    client._vehicleIds = vehicleIds;
    return client;
  }
}
