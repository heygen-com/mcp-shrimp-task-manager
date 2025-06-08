/** @type {import("jest").Config} **/
export default {
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: "node",
  extensionsToTreatAsEsm: ['.ts'],
  globals: {
    'ts-jest': {
      tsconfig: {
        isolatedModules: true,
      },
      useESM: true,
    },
  },
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      useESM: true,
    }],
  },
  transformIgnorePatterns: [
    'node_modules/(?!(node-fetch)/)'
  ],
  testMatch: [
    "**/__tests__/**/*.ts",
    "**/?(*.)+(spec|test).ts"
  ],
  reporters: [
    "default",
    ["jest-summary-reporter", {
      "failuresOnly": false,
      "summary": true,
      "symbols": {
        "pass": "🟢",
        "fail": "🔴",
        "skip": "⚪"
      },
      "showSummaryAfterErrorList": true
    }]
  ]
};