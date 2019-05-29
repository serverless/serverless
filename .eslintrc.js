module.exports = {
  "root": true,
  "extends": "airbnb",
  "plugins": [],
  "rules": {
    "func-names": "off",
    "global-require": "off", // Interfers with optional and eventual circular references
    "strict": ["error", "safe"], // airbnb implies we're transpiling with babel, we're not

    // doesn't work in node v4 :(
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
