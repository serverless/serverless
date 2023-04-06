'use strict';
const schema = require('./schema');
const compile = require('./compile');

class AwsCompileDocDbEvents {
  constructor(serverless) {
    this.serverless = serverless;
    this.provider = this.serverless.getProvider('aws');

    this.hooks = {
      'package:compileEvents': compile.bind(this),
    };

    this.serverless.configSchemaHandler.defineFunctionEvent('aws', 'documentDb', schema);
  }
}

module.exports = AwsCompileDocDbEvents;
