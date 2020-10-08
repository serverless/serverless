'use strict';

module.exports = {
  type: 'object',
  properties: {
    LambdaConfigurations: {
      type: 'array',
      items: require('./LambdaConfiguration'),
    },
    QueueConfigurations: {
      type: 'array',
      items: require('./QueueConfiguration'),
    },
    TopicConfigurations: {
      type: 'array',
      items: require('./TopicConfiguration'),
    },
  },
  required: [],
  additionalProperties: false,
};
