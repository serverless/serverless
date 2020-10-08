'use strict';

module.exports = {
  type: 'object',
  properties: {
    LambdaConfigurations: {
      type: 'array',
      items: require('./AWS::S3::Bucket.LambdaConfiguration'),
    },
    QueueConfigurations: {
      type: 'array',
      items: require('./AWS::S3::Bucket.QueueConfiguration'),
    },
    TopicConfigurations: {
      type: 'array',
      items: require('./AWS::S3::Bucket.TopicConfiguration'),
    },
  },
  required: [],
  additionalProperties: false,
};
