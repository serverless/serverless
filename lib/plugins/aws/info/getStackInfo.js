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
        stage: this.provider.getStage(),
        region: this.provider.getRegion(),
        stack: this.provider.naming.getStackName(),
      },
      outputs: [],
    };

    const stackName = this.provider.naming.getStackName();

    // Get info from CloudFormation Outputs
    return this.provider.request('CloudFormation',
      'describeStacks',
      { StackName: stackName })
    .then((result) => {
      let outputs;

      if (result) {
        outputs = result.Stacks[0].Outputs;

        const serviceEndpointOutputRegex = this.provider.naming
          .getServiceEndpointRegex();

        // Outputs
        this.gatheredData.outputs = outputs;

        // Functions
        this.serverless.service.getAllFunctions().forEach((func) => {
          const functionInfo = {};
          functionInfo.name = func;
          functionInfo.deployedName = `${
            this.serverless.service.service}-${this.provider.getStage()}-${func}`;
          this.gatheredData.info.functions.push(functionInfo);
        });

        // Endpoints
        outputs.filter(x => x.OutputKey.match(serviceEndpointOutputRegex))
          .forEach(x => {
            this.gatheredData.info.endpoint = x.OutputValue;
          });
      }

      return BbPromise.resolve();
    });
  },
};
