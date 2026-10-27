module.exports = {
  preset: "@react-native/jest-preset",
  roots: ["<rootDir>/src", "<rootDir>/test"],
  setupFiles: ["<rootDir>/test/setup.ts"],
  testMatch: ["<rootDir>/test/**/*.test.ts?(x)"],
  modulePathIgnorePatterns: ["<rootDir>/example", "<rootDir>/lib"],
};
