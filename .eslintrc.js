module.exports = {
  "root": true,
  "extends": "airbnb",
  "plugins": [],
  "rules": {
    "func-names": "off",
    "global-require": "off", // Interfers with optional and eventual circular references
    "react/require-extension": "off", // Forced by airbnb, not applicable (also deprecated)
    "strict": ["error", "safe"], // airbnb implies we're transpiling with babel, we're not

    // doesn't work in node v4 :(
    "import/no-extraneous-dependencies": "off"
  },
  "parserOptions": {
    "sourceType": "script", // airbnb assumes ESM, while we're CJS
  },
  "env": {
    "mocha": true,
    "jest": true
  }
};
