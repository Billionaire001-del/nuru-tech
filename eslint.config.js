const globals = require('globals');
module.exports = [{ files: ['**/*.js'], languageOptions: { ecmaVersion: 'latest', sourceType: 'commonjs', globals: { ...globals.node, ...globals.es2021 } }, rules: { 'no-unused-vars': ['error', { argsIgnorePattern: '^_' }], 'no-undef': 'error', 'no-unreachable': 'error' } }];
