/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  // `.spec.tsx` thêm cho component test (jsdom qua pragma `@jest-environment` theo từng file,
  // xem AttractionCard.spec.tsx) — các `.spec.ts` hiện có vẫn chạy dưới `node` như cũ.
  testMatch: ['**/*.spec.ts', '**/*.spec.tsx'],
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  // Thứ tự có ý nghĩa: moduleNameMapper dùng match ĐẦU TIÊN khớp, nên CSS Modules phải đứng
  // trước alias `@/*` — nếu không, import kiểu `@/modules/x/y.module.css` sẽ bị alias `@/*`
  // khớp trước và không bao giờ tới được mock CSS.
  moduleNameMapper: {
    '\\.module\\.css$': '<rootDir>/jest.cssModuleMock.js',
    // PR A: root layout (`[locale]/layout.tsx`, `(auth)/layout.tsx`, `(dashboard)/layout.tsx`)
    // mỗi file tự `import '../../styles/globals.css'` (CSS toàn cục, không phải CSS Module) —
    // cần map riêng vì pattern `.module.css$` ở trên không khớp; tái dùng đúng mock rỗng vì import
    // này chỉ có side-effect, không destructure export nào.
    '\\.css$': '<rootDir>/jest.cssModuleMock.js',
    // Ánh xạ alias `@/*` (tsconfig paths) để test import được như code ứng dụng.
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  globals: {
    'ts-jest': {
      tsconfig: {
        // module/moduleResolution: test lib thuần TS không cần cấu hình JSX của Next.
        // jsx: cần cho component test (.spec.tsx) — an toàn áp dụng toàn cục vì chỉ ảnh hưởng
        // file có cú pháp JSX thật sự.
        module: 'commonjs',
        moduleResolution: 'node',
        jsx: 'react-jsx',
      },
    },
  },
};
