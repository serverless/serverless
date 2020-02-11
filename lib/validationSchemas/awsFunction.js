'use strict';

const Joi = require('@hapi/joi');

module.exports = Joi.object().keys({
  handler: Joi.string().required(),
  events: Joi.array(), // event object is validated in separate file
  name: Joi.string(), // 'name' is added in when serverless command runs
});
