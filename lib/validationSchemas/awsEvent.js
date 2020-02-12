'use strict';

const Joi = require('@hapi/joi');

module.exports = Joi.object().keys({
  http: Joi.alternatives(
    Joi.string().pattern(
      /^(get|post|put|patch|options|head|delete|any)\s+[^\s]+$/i,
      'Method path-without-spaces. AWS supported methods are: get, post, put, patch, options, head, delete, any.'
    ),
    Joi.object()
  ),

  s3: Joi.alternatives(Joi.string(), Joi.object()),
  sns: Joi.alternatives(Joi.string(), Joi.object()),
  sqs: Joi.alternatives(Joi.string(), Joi.object()),
  stream: Joi.alternatives(Joi.string(), Joi.object()),
  httpApi: Joi.alternatives(Joi.string(), Joi.object()),
  schedule: Joi.alternatives(Joi.string(), Joi.object()),
  websocket: Joi.alternatives(Joi.string(), Joi.object()),
  alexaSkill: Joi.alternatives(Joi.string(), Joi.object()),
  cloudwatchLog: Joi.alternatives(Joi.string(), Joi.object()),
  alexaSmartHome: Joi.alternatives(Joi.string(), Joi.object()),

  iot: Joi.object(),
  alb: Joi.object(),
  cloudFront: Joi.object(),
  eventBridge: Joi.object(),
  cloudwatchEvent: Joi.object(),
  cognitoUserPool: Joi.object(),
});
