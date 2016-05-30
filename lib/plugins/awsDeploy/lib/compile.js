'use strict';

const path = require('path');
const BbPromise = require('bluebird');
const forEach = require('lodash').forEach;
const merge = require('lodash').merge;

module.exports = {
  validateForCompile() {
    if (!this.options.stage) {
      throw new this.serverless.classes.Error('Please pass in a valid stage.');
    }

    if (!this.options.region) {
      throw new this.serverless.classes.Error('Please pass in a valid region.');
    }

    BbPromise.resolve();
  },

  extractFunctions() {
    const rawFunctionObjects = this.serverless.service.functions;

    forEach(rawFunctionObjects, (value, key) => {
      // check if it's the function and not the name_template property
      if (key !== 'name_template') {
        const functionObject = {
          [key]: value,
        };

        this.functionObjects.push(functionObject);
      }
    });

    return BbPromise.resolve();
  },

  createFunctionResources() {
    const functionTemplate = `
      {
        "Type": "AWS::Lambda::Function",
        "Properties": {
        "Code": "Code",
        "FunctionName": "FunctionName",
          "Handler": "Handler",
          "MemorySize": "MemorySize",
          "Role": "Role",
          "Runtime": "Runtime",
          "Timeout": "Timeout"
        }
      }
    `;

    this.functions.forEach((func) => {
      const newFunction = JSON.parse(functionTemplate);
      const functionName = Object.keys(func)[0];

      const role = this.serverless.service.getVariables(
        this.options.stage,
        this.options.region
      ).iamRoleArnLambda;

      if (!functionName) {
        throw new this.serverless.classes.Error('Please define a name for your function.');
      }

      if (!func[functionName].handler) {
        throw new this.serverless.classes.Error('Please define a handler for your function.');
      }

      if (!func[functionName].provider.aws_lambda.memorySize) {
        throw new this.serverless.classes.Error('Please define a memory size for your function.');
      }

      if (!role) {
        throw new this.serverless.classes.Error('Please define a IAM ARN role for your function.');
      }

      if (!func[functionName].provider.aws_lambda.runtime) {
        throw new this.serverless.classes.Error('Please define a runtime for your function.');
      }

      if (!func[functionName].provider.aws_lambda.timeout) {
        throw new this.serverless.classes.Error('Please define a timeout for your function.');
      }

      newFunction.Properties.Code = ''; // Code will be added later on
      newFunction.Properties.FunctionName = functionName;
      newFunction.Properties.Handler = func[functionName].handler;
      newFunction.Properties.MemorySize = func[functionName].provider.aws_lambda.memorySize;
      newFunction.Properties.Role = role;
      newFunction.Properties.Runtime = func[functionName].provider.aws_lambda.runtime;
      newFunction.Properties.Timeout = func[functionName].provider.aws_lambda.timeout;

      const functionResourceKey = `${functionName}Lambda`;

      const newFunctionObject = {
        [functionResourceKey]: newFunction,
      };

      this.functionResources.push(newFunctionObject);
    });

    return BbPromise.resolve();
  },

  addFunctionResourcesToServiceResourcesObject() {
    const serviceResources = this.serverless.service.resources.aws;
    const coreCFTemplate = this.serverless.utils.readFileSync(
      path.join(this.serverless.config.serverlessPath, 'templates', 'core-cf.json')
    );

    // set the necessary variables before adding the function resources
    coreCFTemplate
      .Resources
      .IamPolicyLambda
      .Properties
      .PolicyName = `${this.options.stage}-lambda`;
    coreCFTemplate
      .Resources
      .IamPolicyLambda
      .Properties
      .PolicyDocument
      .Statement[0]
      .Resource = `arn:aws:logs:${this.options.region}:*:*`;

    const iamRoleLambda = coreCFTemplate.Resources.IamRoleLambda;
    const iamPolicyLambda = coreCFTemplate.Resources.IamPolicyLambda;

    if (serviceResources) {
      this.functionResources.forEach((functionResource) => {
        merge(serviceResources.Resources, functionResource);
      });

      merge(serviceResources.Resources, { IamRoleLambda: iamRoleLambda });
      merge(serviceResources.Resources, { IamPolicyLambda: iamPolicyLambda });

      this.serverless.service.resources.aws = serviceResources;
    } else {
      this.functionResources.forEach((functionResource) => {
        merge(coreCFTemplate.Resources, functionResource);
      });

      this.serverless.service.resources.aws = coreCFTemplate;
    }

    return BbPromise.resolve();
  },

  compile() {
    return BbPromise.bind(this)
      .then(this.validateForCompile)
      .then(this.extractFunctions)
      .then(this.createFunctionResources)
      .then(this.addFunctionResourcesToServiceResourcesObject);
  },
};
