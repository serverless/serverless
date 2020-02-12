'use strict';

const Joi = require('@hapi/joi');

module.exports = Joi.object()
  .keys({
    handler: Joi.string().required(),
    events: Joi.array(),
    name: Joi.string(),
  })
  .unknown(true); // todo: remove unknown(true) after schema is complete
