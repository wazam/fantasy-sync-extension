export default {
  verbose: false,
  build: {
    overwriteDest: true,
  },
  ignoreFiles: [
    'archive',
    'docs',
    'node_modules',
    'web-ext-artifacts',
    '.gitignore',
    '.tool-versions',
    'fantasy-sync-extension.code-workspace',
    'package-lock.json',
    'package.json',
    'README.md',
    'ROADMAP.md',
    'TODO.md',
    'web-ext-config.mjs',
  ],
};
