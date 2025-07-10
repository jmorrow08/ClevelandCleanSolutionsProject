// Basic ESLint configuration for Firebase Cloud Functions (Node.js)
module.exports = {
  root: true,
  env: {
    es6: true,
    node: true,
  },
  extends: [
    "eslint:recommended",
    "google", // Recommended: Use Google style guide
  ],
  parserOptions: {
    ecmaVersion: 2020, // Use a recent ECMAScript version
    sourceType: "script", // Use 'script' for standard Cloud Functions Node.js environment
  },
  rules: {
    "quotes": ["error", "double"], // Enforce double quotes
    "indent": ["error", 2], // Enforce 2-space indentation
    "max-len": ["warn", { "code": 120 }], // Warn on lines longer than 120 chars
    "require-jsdoc": "off", // Turn off requirement for JSDoc comments
    "valid-jsdoc": "off", // Turn off validation of JSDoc comments
    "object-curly-spacing": ["error", "always"], // Enforce spaces inside braces {}
    "camelcase": ["warn", { "properties": "never" }], // Warn on non-camelcase variables (allow property names)
    "no-unused-vars": ["warn", { "argsIgnorePattern": "^_" }], // Warn on unused variables, allow args starting with _
    // Add or override other rules as needed
  },
};
