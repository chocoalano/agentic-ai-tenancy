// @ts-check
import withNuxt from './.nuxt/eslint.config.mjs'

export default withNuxt(
  {
    ignores: ['.output/**', '.nuxt/**', '.data/**', '.scratch/**', 'node_modules/**', 'coverage/**', 'design/**'],
  },
  {
    rules: {
      // Larangan eksplisit sesuai pedoman proyek: tidak ada any/ts-ignore.
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/ban-ts-comment': [
        'error',
        { 'ts-ignore': true, 'ts-nocheck': true, 'ts-expect-error': 'allow-with-description' },
      ],
      'vue/no-v-html': 'error',
      // Selaras dengan Prettier yang selalu menulis elemen void sebagai `<img />`.
      'vue/html-self-closing': ['warn', { html: { void: 'always', normal: 'always', component: 'always' } }],
    },
  },
  {
    // Komponen shadcn-vue adalah kode hasil generate CLI; aturan gaya proyek tidak dipaksakan.
    files: ['app/components/ui/**'],
    rules: {
      'vue/require-default-prop': 'off',
      // Nama primitive satu kata (Button, Input, ...) adalah konvensi shadcn-vue.
      'vue/multi-word-component-names': 'off',
      'vue/no-v-html': 'off',
      'vue/html-self-closing': 'off',
    },
  },
  {
    // Frontend tidak boleh meng-import kode backend yang dapat dieksekusi.
    // Hanya `import type` yang diizinkan dari api/.
    files: ['app/**/*.{ts,vue}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['~~/api/*', '~~/api/**', '../../api/**', '@@/api/**'],
              allowTypeImports: true,
              message: 'Frontend hanya boleh memakai `import type` dari api/. Gunakan $api (Eden Treaty).',
            },
            { group: ['~~/db/**', '~~/scripts/**'], message: 'Frontend tidak boleh meng-import kode database/skrip.' },
          ],
        },
      ],
    },
  },
)
