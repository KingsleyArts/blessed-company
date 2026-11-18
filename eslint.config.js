import tseslint from 'typescript-eslint';

export default tseslint.config(...tseslint.configs.recommended, {
  files: ['src/core/**/*.ts'],
  rules: {
    'no-restricted-imports': ['error', { patterns: ['phaser', '**/game/*', '**/ui/*'] }],
  },
});
