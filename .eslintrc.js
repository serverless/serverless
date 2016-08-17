module.exports = {
  "extends": "airbnb",
  "plugins": [],
  "rules": {
    "func-names": "off",

    // doesn't work in node v4 :(
    "strict": "off",
    "prefer-rest-params": "off",
    "import/no-extraneous-dependencies" : "off"
  },
  "env": {
       "mocha": true
   }
};
