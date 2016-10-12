'use strict';

// Import faker module from node_modules
const faker = require('faker');

module.exports.helloRandomName = function (event, context, callback) {
  const name = faker.name.firstName();
  const message = {
    message: `Hello ${name}`,
  };

  callback(null, message);
};
