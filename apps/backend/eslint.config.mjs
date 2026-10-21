import tseslint from 'typescript-eslint';

/**
 * Lint focado em promessas: com os repositórios SQL assíncronos (ADR-004 fase 2), um `await`
 * esquecido devolve uma Promise (sempre truthy) e quebra checagens como `if (!podeAcessar)` sem erro de tipo.
 */
export default tseslint.config({
  files: ['src/**/*.ts', 'test/**/*.ts'],
  extends: [tseslint.configs.base],
  languageOptions: {
    parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname }
  },
  rules: {
    '@typescript-eslint/no-floating-promises': 'error',
    '@typescript-eslint/no-misused-promises': 'error',
    '@typescript-eslint/await-thenable': 'error'
  }
}, {
  // `expect(...).rejects` do bun:test é tipado como não-thenable, embora precise de await
  files: ['test/**/*.ts'],
  rules: { '@typescript-eslint/await-thenable': 'off' }
});
