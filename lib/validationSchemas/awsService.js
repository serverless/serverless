'use strict';

const Joi = require('@hapi/joi');

module.exports = Joi.object()
  .keys({
    service: Joi.string()
      .min(1)
      .max(128)
      .pattern(
        /^[a-zA-Z][0-9a-zA-Z-]+$/,
        'Alphanumeric (case sensitive) and hyphens. Starts with alphabetic character'
      )
      .required(),

    layers: Joi.object(),
    custom: Joi.object(),
    package: Joi.object(),
    functions: Joi.object(),
    resources: Joi.object(),
    plugins: Joi.alternatives(Joi.array(), Joi.object()),
  })
  .unknown(true);