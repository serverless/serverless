'use strict';

module.exports.handler = (event) => ({
  statusCode: 200,
  body: JSON.stringify(event),
});
