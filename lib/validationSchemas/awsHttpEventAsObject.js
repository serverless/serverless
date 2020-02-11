'use strict';

const Joi = require('@hapi/joi');

module.exports = Joi.object().keys({
  path: Joi.string().required(),
  method: Joi.string(),
  cors: Joi.boolean(),
  private: Joi.boolean(),

  authorizer: Joi.alternatives(
    Joi.string().required(),
    Joi.object().keys({
      name: Joi.string(),
      arn: Joi.string(),
      resultTtlInSeconds: Joi.number(),
      identitySource: Joi.string(),
      identityValidationExpression: Joi.any(), // may be there is a better option to check for reqex
      type: Joi.string(),
    })
  ),
});
