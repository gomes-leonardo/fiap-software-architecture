import { Client } from '@domain/client/client.entity';
import { ClientStatus } from '@domain/client/client-status.enum';

describe('Client Entity', () => {
  const validProps = {
    name: 'João da Silva',
    cpfCnpj: '529.982.247-25',
    email: 'joao@email.com',
    phone: '(11) 99999-0000',
  };

  it('should create a client with valid data', () => {
    const client = new Client(validProps);
    expect(client.id).toBeDefined();
    expect(client.name).toBe('João da Silva');
    expect(client.cpfCnpj.value).toBe('52998224725');
    expect(client.email).toBe('joao@email.com');
    expect(client.phone).toBe('(11) 99999-0000');
    expect(client.vehicleIds).toEqual([]);
  });

  it('should create a client with minimal data (no email/phone)', () => {
    const client = new Client({ name: 'Maria', cpfCnpj: '529.982.247-25' });
    expect(client.name).toBe('Maria');
    expect(client.email).toBeNull();
    expect(client.phone).toBeNull();
  });

  it('should throw when name is empty', () => {
    expect(() => new Client({ ...validProps, name: '' })).toThrow('Client name is required');
  });

  it('should throw when name is whitespace only', () => {
    expect(() => new Client({ ...validProps, name: '   ' })).toThrow('Client name is required');
  });

  it('should throw when CPF/CNPJ is invalid', () => {
    expect(() => new Client({ ...validProps, cpfCnpj: '123.456.789-00' })).toThrow();
  });

  it('should trim the name', () => {
    const client = new Client({ ...validProps, name: '  João  ' });
    expect(client.name).toBe('João');
  });

  describe('status', () => {
    it('should start ATIVO', () => {
      const client = new Client(validProps);
      expect(client.status).toBe(ClientStatus.ATIVO);
      expect(client.isActive).toBe(true);
    });

    it('should deactivate and activate again', () => {
      const client = new Client(validProps);
      client.deactivate();
      expect(client.status).toBe(ClientStatus.INATIVO);
      expect(client.isActive).toBe(false);
      client.activate();
      expect(client.status).toBe(ClientStatus.ATIVO);
    });
  });

  describe('update', () => {
    it('should update the name', () => {
      const client = new Client(validProps);
      client.update({ name: 'Novo Nome' });
      expect(client.name).toBe('Novo Nome');
    });

    it('should update email and phone', () => {
      const client = new Client(validProps);
      client.update({ email: 'new@email.com', phone: '(21) 88888-1111' });
      expect(client.email).toBe('new@email.com');
      expect(client.phone).toBe('(21) 88888-1111');
    });

    it('should throw when updating name to empty', () => {
      const client = new Client(validProps);
      expect(() => client.update({ name: '' })).toThrow('Client name is required');
    });
  });

  describe('reconstitute', () => {
    it('should reconstitute a client from persisted data', () => {
      const client = Client.reconstitute(
        'existing-id',
        'João',
        '52998224725',
        'joao@email.com',
        '(11) 99999-0000',
        ClientStatus.INATIVO,
        ['v1', 'v2'],
      );
      expect(client.id).toBe('existing-id');
      expect(client.name).toBe('João');
      expect(client.cpfCnpj.value).toBe('52998224725');
      expect(client.status).toBe(ClientStatus.INATIVO);
      expect(client.vehicleIds).toEqual(['v1', 'v2']);
    });
  });
});
