import { Admin } from '@domain/admin/admin.entity';

describe('Admin Entity', () => {
  describe('create', () => {
    it('should create an admin with a hashed password and normalized email', async () => {
      const admin = await Admin.create({
        name: '  Vinicius Admin  ',
        email: 'ADMIN@Oficina.com',
        password: 'Secret-Pass-123',
      });

      expect(admin.id).toBeDefined();
      expect(admin.name).toBe('Vinicius Admin');
      expect(admin.email).toBe('admin@oficina.com');
      expect(admin.passwordHash).not.toBe('Secret-Pass-123');
      expect(admin.passwordHash.length).toBeGreaterThan(0);
    });

    it('should reject an empty name', async () => {
      await expect(
        Admin.create({ name: '   ', email: 'a@b.com', password: 'Secret-Pass-123' }),
      ).rejects.toThrow('name');
    });

    it('should reject an empty email', async () => {
      await expect(
        Admin.create({ name: 'Admin', email: '', password: 'Secret-Pass-123' }),
      ).rejects.toThrow('email');
    });

    it.each([
      ['curta', 'Abc12345678'],
      ['sem maiuscula', 'abcdefgh1234'],
      ['sem minuscula', 'ABCDEFGH1234'],
      ['sem digito', 'Abcdefghijkl'],
    ])('recusa senha %s', async (_caso, password) => {
      await expect(Admin.create({ name: 'Admin', email: 'a@b.com', password })).rejects.toThrow(
        'at least 12 characters',
      );
    });

    it('aceita senha com 12 caracteres misturando maiusculas, minusculas e digitos', async () => {
      await expect(
        Admin.create({ name: 'Admin', email: 'a@b.com', password: 'Abcdefgh1234' }),
      ).resolves.toBeDefined();
    });
  });

  describe('verifyPassword', () => {
    it('should return true for the correct password and false otherwise', async () => {
      const admin = await Admin.create({
        name: 'Admin',
        email: 'a@b.com',
        password: 'Secret-Pass-123',
      });

      expect(await admin.verifyPassword('Secret-Pass-123')).toBe(true);
      expect(await admin.verifyPassword('wrong-password')).toBe(false);
    });
  });

  describe('reconstitute', () => {
    it('should rebuild an admin from persistence without re-hashing', () => {
      const admin = Admin.reconstitute('admin-1', 'Admin Padrão', 'admin@x.com', 'stored-hash');

      expect(admin.id).toBe('admin-1');
      expect(admin.name).toBe('Admin Padrão');
      expect(admin.email).toBe('admin@x.com');
      expect(admin.passwordHash).toBe('stored-hash');
    });
  });
});
