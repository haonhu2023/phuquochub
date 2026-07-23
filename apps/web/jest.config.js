/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/*.spec.ts'],
  // Ánh xạ alias `@/*` (tsconfig paths) để test import được như code ứng dụng.
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  globals: {
    'ts-jest': {
      tsconfig: {
        // Test lib thuần TS — không cần cấu hình JSX của Next.
        module: 'commonjs',
        moduleResolution: 'node',
      },
    },
  },
};
