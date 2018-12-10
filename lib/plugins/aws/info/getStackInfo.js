'use strict';

const BbPromise = require('bluebird');

module.exports = {
  getStackInfo() {
    // NOTE: this is the global gatheredData object which will be passed around
    this.gatheredData = {
      info: {
        functions: [],
        layers: [],
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

        // Layers
        this.serverless.service.getAllLayers().forEach((layer) => {
          const layerInfo = {};
          layerInfo.name = layer;
          const layerOutputId = this.provider.naming.getLambdaLayerOutputLogicalId(layer);
          for (const output of outputs) {
            if (output.OutputKey === layerOutputId) {
              layerInfo.arn = output.OutputValue;
              break;
            }
          }
          this.gatheredData.info.layers.push(layerInfo);
        });

        // Endpoints
        outputs.filter(x => x.OutputKey.match(serviceEndpointOutputRegex))
          .forEach(x => {
            this.gatheredData.info.endpoint = x.OutputValue;
            if (this.serverless.service.deployment &&
              this.serverless.service.deployment.deploymentId) {
              this.serverless.service.deployment.apiId = x.OutputValue.split('//')[1].split('.')[0];
            }
          });
      }

      return BbPromise.resolve();
    });
  },
};
