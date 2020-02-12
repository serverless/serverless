'use strict';

const Joi = require('@hapi/joi');

module.exports = Joi.object()
  .keys({
    service: Joi.string().required(),
    package: Joi.object(),
    plugins: Joi.alternatives(Joi.array(), Joi.object()),
    layers: Joi.object(),
    custom: Joi.object(),
    functions: Joi.object(),
    resources: Joi.object(),
  })
  .unknown(true);
