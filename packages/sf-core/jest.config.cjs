/** @type {import('jest').Config} */
const config = {
  verbose: true,
  transform: {},
  testTimeout: 600000,
  // Python plugin test fixtures are standalone projects, not modules of this
  // package — keep jest's module map from indexing them.
  modulePathIgnorePatterns: ['<rootDir>/tests/python/tests/'],
}

module.exports = config
