module.exports = {
  "extends": "airbnb",
  "plugins": [],
  "rules": {
    "func-names": "off",

    // doesn't work in node v4 :(
    "strict": "off",
    "prefer-rest-params": "off",
    "react/require-extension" : "off",
    "import/no-extraneous-dependencies" : "off"
  },
  "env": {
       "mocha": true
   }
};
