import js from '@eslint/js';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['**/dist/**', '**/node_modules/**', 'backend/data/**'] },

  js.configs.recommended,
  tseslint.configs.recommended,

  // 백엔드: Node
  {
    files: ['backend/**/*.ts'],
    languageOptions: { globals: globals.node },
  },

  // 프론트엔드: 브라우저 + React
  {
    files: ['frontend/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
    extends: [reactHooks.configs.flat.recommended, jsxA11y.flatConfigs.recommended],
  },

  // 설정 파일: Node
  {
    files: ['*.mjs', 'frontend/vite.config.ts'],
    languageOptions: { globals: globals.node },
  },

  {
    rules: {
      // 인자 이름을 _로 시작하면 "일부러 안 쓴다"는 뜻으로 본다 (Express 오류 처리기의 next 등)
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
);
