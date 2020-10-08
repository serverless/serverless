'use strict';

module.exports = {
  type: 'object',
  properties: {
    AllowedHeaders: {
      type: 'array',
      items: {type: 'string'},
    },
    AllowedMethods: {
      type: 'array',
      items: {enum: ['GET', 'PUT', 'HEAD', 'POST', 'DELETE']},
    },
    AllowedOrigins: {
      type: 'array',
      items: {type: 'string'},
    },
    ExposedHeaders: {
      type: 'array',
      items: {type: 'string'},
    },
    Id: {
      type: 'string',
    },
    MaxAge: {
      type: 'integer',
    },
  },
  required: ['AllowedMethods', 'AllowedOrigins'],
  additionalProperties: false,
};
