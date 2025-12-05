module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/src', '<rootDir>/api-gateway/src'],
  testMatch: ['**/__tests__/**/*.test.ts', '**/?(*.)+(spec|test).ts'],
  transform: {
    '^.+\\.ts$': 'ts-jest',
  },
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    'api-gateway/src/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
    '!api-gateway/src/**/*.d.ts',
  ],
};