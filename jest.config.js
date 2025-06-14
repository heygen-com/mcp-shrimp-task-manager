/** @type {import("jest").Config} **/
export default {
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: "node",
  extensionsToTreatAsEsm: ['.ts'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      useESM: true,
      tsconfig: {
        isolatedModules: true,
      },
    }],
  },
  transformIgnorePatterns: [
    'node_modules/(?!(node-fetch)/)'
  ],
  testMatch: [
    "**/test/unit/**/*.test.ts",
    "**/test/integration/**/*.test.ts",
  ]
};