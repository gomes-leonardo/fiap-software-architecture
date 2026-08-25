import { Entity, DomainException } from '@domain/shared';
import * as bcrypt from 'bcrypt';

export interface CreateAdminProps {
  name: string;
  email: string;
  password: string;
}

const SALT_ROUNDS = 10;

export class Admin extends Entity {
  private _name: string;
  private _email: string;
  private _passwordHash: string;

  private constructor(name: string, email: string, passwordHash: string, id?: string) {
    super(id);
    this._name = name;
    this._email = email;
    this._passwordHash = passwordHash;
  }

  get name(): string {
    return this._name;
  }

  get email(): string {
    return this._email;
  }

  get passwordHash(): string {
    return this._passwordHash;
  }

  async verifyPassword(plainPassword: string): Promise<boolean> {
    return bcrypt.compare(plainPassword, this._passwordHash);
  }

  static async create(props: CreateAdminProps): Promise<Admin> {
    if (!props.name || props.name.trim().length === 0) {
      throw DomainException.of('Admin name is required');
    }
    if (!props.email || props.email.trim().length === 0) {
      throw DomainException.of('Admin email is required');
    }
    if (!props.password || props.password.length < 6) {
      throw DomainException.of('Password must be at least 6 characters');
    }

    const hash = await bcrypt.hash(props.password, SALT_ROUNDS);
    return new Admin(props.name.trim(), props.email.trim().toLowerCase(), hash);
  }

  static reconstitute(id: string, name: string, email: string, passwordHash: string): Admin {
    return new Admin(name, email, passwordHash, id);
  }
}
