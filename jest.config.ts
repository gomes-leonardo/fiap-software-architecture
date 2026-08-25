import type { Config } from 'jest';
import { pathsToModuleNameMapper } from 'ts-jest';

const config: Config = {
  projects: [
    {
      displayName: 'unit',
      testMatch: ['<rootDir>/test/unit/**/*.spec.ts'],
      transform: {
        '^.+\\.ts$': 'ts-jest',
      },
      moduleNameMapper: pathsToModuleNameMapper(
        {
          '@domain/*': ['src/domain/*'],
          '@application/*': ['src/application/*'],
          '@infrastructure/*': ['src/infrastructure/*'],
          '@interfaces/*': ['src/interfaces/*'],
        },
        { prefix: '<rootDir>/' },
      ),
      moduleFileExtensions: ['ts', 'js', 'json'],
      // Cobertura medida sobre os dominios criticos (regras de negocio e casos
      // de uso). DTOs, ports abstratos e enums sao apenas declaracoes e ficam
      // de fora do denominador.
      collectCoverageFrom: ['src/domain/**/*.ts', 'src/application/**/*.ts'],
      coveragePathIgnorePatterns: [
        '/node_modules/',
        '\\.dto\\.ts$',
        '-repository\\.port\\.ts$',
        '\\.enum\\.ts$',
        'index\\.ts$',
      ],
      // Requisito do desafio: cobertura minima de 80% nos dominios criticos.
      coverageThreshold: {
        global: { statements: 80, branches: 80, functions: 80, lines: 80 },
      },
    } as any,
    {
      displayName: 'integration',
      testMatch: ['<rootDir>/test/integration/**/*.spec.ts'],
      transform: {
        '^.+\\.ts$': 'ts-jest',
      },
      moduleNameMapper: pathsToModuleNameMapper(
        {
          '@domain/*': ['src/domain/*'],
          '@application/*': ['src/application/*'],
          '@infrastructure/*': ['src/infrastructure/*'],
          '@interfaces/*': ['src/interfaces/*'],
        },
        { prefix: '<rootDir>/' },
      ),
      moduleFileExtensions: ['ts', 'js', 'json'],
    } as any,
    {
      displayName: 'smoke',
      testMatch: ['<rootDir>/test/smoke/**/*.spec.ts'],
      transform: {
        '^.+\\.ts$': 'ts-jest',
      },
      moduleNameMapper: pathsToModuleNameMapper(
        {
          '@domain/*': ['src/domain/*'],
          '@application/*': ['src/application/*'],
          '@infrastructure/*': ['src/infrastructure/*'],
          '@interfaces/*': ['src/interfaces/*'],
        },
        { prefix: '<rootDir>/' },
      ),
      moduleFileExtensions: ['ts', 'js', 'json'],
    } as any,
    {
      displayName: 'e2e',
      testMatch: ['<rootDir>/test/e2e/**/*.spec.ts'],
      transform: {
        '^.+\\.ts$': 'ts-jest',
      },
      moduleNameMapper: pathsToModuleNameMapper(
        {
          '@domain/*': ['src/domain/*'],
          '@application/*': ['src/application/*'],
          '@infrastructure/*': ['src/infrastructure/*'],
          '@interfaces/*': ['src/interfaces/*'],
        },
        { prefix: '<rootDir>/' },
      ),
      moduleFileExtensions: ['ts', 'js', 'json'],
    } as any,
  ],
};

export default config;
