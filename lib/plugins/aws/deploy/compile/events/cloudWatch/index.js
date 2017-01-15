'use strict';

const _ = require('lodash');

class AwsCompileCloudWatchEvents {
  constructor(serverless) {
    this.serverless = serverless;
    this.provider = this.serverless.getProvider('aws');

    this.hooks = {
      'deploy:compileEvents': this.compileCloudWatchEvents.bind(this),
    };
  }

  compileCloudWatchEvents() {
    this.serverless.service.getAllFunctions().forEach((functionName) => {
      const functionObj = this.serverless.service.getFunction(functionName);
      let cloudWatchNumberInFunction = 0;

      if (functionObj.events) {
        functionObj.events.forEach(event => {
          if (event.cloudwatch) {
            cloudWatchNumberInFunction++;
            let EventPattern;
            let State;
            let Input;
            let InputPath;
            let Name;
            let Description;

            if (typeof event.cloudwatch === 'object') {
              if (!event.cloudwatch.event) {
                const errorMessage = [
                  `Missing "event" property for cloudwatch event in function ${functionName}`,
                  ' Please check the docs for more info.',
                ].join('');
                throw new this.serverless.classes
                  .Error(errorMessage);
              }
              EventPattern = JSON.stringify(event.cloudwatch.event);
              State = 'ENABLED';
              if (event.cloudwatch.enabled === false) {
                State = 'DISABLED';
              }
              Input = event.cloudwatch.input;
              InputPath = event.cloudwatch.inputPath;
              Name = event.cloudwatch.name;
              Description = event.cloudwatch.description;

              if (Input && InputPath) {
                const errorMessage = [
                  'You can\'t set both input & inputPath properties at the',
                  'same time for cloudwatch events.',
                  'Please check the AWS docs for more info',
                ].join('');
                throw new this.serverless.classes
                  .Error(errorMessage);
              }

              if (Input && typeof Input === 'object') {
                Input = JSON.stringify(Input);
              }
              if (Input && typeof Input === 'string') {
                // escape quotes to favor JSON.parse
                Input = Input.replace(/\"/g, '\\"'); // eslint-disable-line
              }
            } else {
              const errorMessage = [
                `IoT event of function "${functionName}" is not an object`,
                ' Please check the docs for more info.',
              ].join('');
              throw new this.serverless.classes
                .Error(errorMessage);
            }

            const lambdaLogicalId = this.provider.naming
              .getLambdaLogicalId(functionName);
            const cloudWatchLogicalId = this.provider.naming
              .getCloudWatchLogicalId(functionName, cloudWatchNumberInFunction);
            const lambdaPermissionLogicalId = this.provider.naming
              .getLambdaCloudWatchPermissionLogicalId(functionName, cloudWatchNumberInFunction);
            const cloudWatchId = this.provider.naming.getCloudWatchId(functionName);

            const cloudWatchTemplate = `
              {
                "Type": "AWS::Events::Rule",
                "Properties": {
                  "EventPattern": ${EventPattern.replace(/\\n|\\r/g, '')},
                  "State": "${State}",
                  ${Name ? `"Name": "${Name.replace(/\r?\n/g, '')}",` : ''}
                  ${Description ? `"Description": "${Description.replace(/\r?\n/g, '')}",` : ''}
                  "Targets": [{
                    ${Input ? `"Input": "${Input.replace(/\\n|\\r/g, '')}",` : ''}
                    ${InputPath ? `"InputPath": "${InputPath.replace(/\r?\n/g, '')}",` : ''}
                    "Arn": { "Fn::GetAtt": ["${lambdaLogicalId}", "Arn"] },
                    "Id": "${cloudWatchId}"
                  }]
                }
              }
            `;

            const permissionTemplate = `
              {
                "Type": "AWS::Lambda::Permission",
                "Properties": {
                  "FunctionName": { "Fn::GetAtt": ["${
              lambdaLogicalId}", "Arn"] },
                  "Action": "lambda:InvokeFunction",
                  "Principal": "events.amazonaws.com",
                  "SourceArn": { "Fn::GetAtt": ["${cloudWatchLogicalId}", "Arn"] }
                }
              }
            `;

            const newCloudWatchObject = {
              [cloudWatchLogicalId]: JSON.parse(cloudWatchTemplate),
            };

            const newPermissionObject = {
              [lambdaPermissionLogicalId]: JSON.parse(permissionTemplate),
            };

            _.merge(this.serverless.service.provider.compiledCloudFormationTemplate.Resources,
              newCloudWatchObject, newPermissionObject);
          }
        });
      }
    });
  }
}

module.exports = AwsCompileCloudWatchEvents;
