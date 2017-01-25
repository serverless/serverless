'use strict';

const BbPromise = require('bluebird');

module.exports = {
  getStackInfo() {
    // NOTE: this is the global gatheredData object which will be passed around
    this.gatheredData = {
      info: {
        functions: [],
        endpoint: '',
        service: this.serverless.service.service,
        stage: this.options.stage,
        region: this.options.region,
      },
      outputs: [],
    };

    const stackName = this.provider.naming.getStackName(this.options.stage);

    // Get info from CloudFormation Outputs
    return this.provider.request('CloudFormation',
      'describeStacks',
      { StackName: stackName },
      this.options.stage,
      this.options.region)
    .then((result) => {
      let outputs;

      if (result) {
        outputs = result.Stacks[0].Outputs;

        const serviceEndpointOutputRegex = this.provider.naming
          .getServiceEndpointRegex();

        // Outputs
        this.gatheredData.outputs = outputs;

        // Endpoints
        outputs.filter(x => x.OutputKey.match(serviceEndpointOutputRegex))
          .forEach(x => {
            this.gatheredData.info.endpoint = x.OutputValue;
          });
      }

      return BbPromise.resolve();
    })
    .then(() => this.provider.getAccountId())
    .then((accountId) => {
      this.gatheredData.info.functions = [];

      this.serverless.service.getAllFunctions().forEach((func) => {
        const functionInfo = {};
        const name = `${this.serverless.service.service}-${this.options.stage}-${func}`;
        const arn = `arn:aws:lambda:${this.options.region}:${accountId}:function:${name}`;
        functionInfo.name = name;
        functionInfo.arn = arn;
        this.gatheredData.info.functions.push(functionInfo);
      });

      return BbPromise.resolve();
    });
  },
};
