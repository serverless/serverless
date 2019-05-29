module.exports = {
  "root": true,
  "extends": "airbnb",
  "plugins": [],
  "rules": {
    "func-names": "off",
    "global-require": "off", // Interfers with optional and eventual circular references
    "strict": ["error", "safe"],

    // doesn't work in node v4 :(
    "prefer-rest-params": "off",
    "react/require-extension": "off",
    "import/no-extraneous-dependencies": "off"
  },
  "parserOptions": {
    "sourceType": "script", // Override ESM implied by airbnb
  },
  "env": {
    "mocha": true,
    "jest": true
  }
};
