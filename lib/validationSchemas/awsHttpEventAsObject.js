'use strict';

const Joi = require('@hapi/joi');

module.exports = Joi.object()
  .keys({
    path: Joi.string().required(),
    method: Joi.string(),
  })
  .unknown(true); // todo: remove unknown(true) after schema is complete
