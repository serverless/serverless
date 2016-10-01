'use strict';

const _ = require('lodash');

class AwsCompileDynamoDbEvents {
  constructor(serverless) {
    this.serverless = serverless;
    this.provider = 'aws';

    this.hooks = {
      'deploy:compileEvents': this.compileDynamoDbEvents.bind(this),
    };
  }

  compileDynamoDbEvents() {
    this.serverless.service.getAllFunctions().forEach((functionName) => {
      const functionObj = this.serverless.service.getFunction(functionName);

      if (functionObj.events) {
        functionObj.events.forEach(event => {
          if (event.dynamodb) {
            let EventSourceArn;
            let BatchSize = 10;
            let StartingPosition = 'TRIM_HORIZON';
            let Enabled = 'True';

            // TODO validate streamArn syntax
            if (typeof event.dynamodb === 'object') {
              if (!event.dynamodb.streamArn) {
                const errorMessage = [
                  `Missing "streamArn" property for dynamodb event in function "${functionName}"`,
                  ' The correct syntax is: dynamodb: <streamArn>',
                  ' OR an object with "streamArn" property.',
                  ' Please check the docs for more info.',
                ].join('');
                throw new this.serverless.classes
                  .Error(errorMessage);
              }
              EventSourceArn = event.dynamodb.streamArn;
              BatchSize = event.dynamodb.batchSize
                || BatchSize;
              StartingPosition = event.dynamodb.startingPosition
                || StartingPosition;
              if (typeof event.dynamodb.enabled !== 'undefined') {
                Enabled = event.dynamodb.enabled ? 'True' : 'False';
              }
            } else if (typeof event.dynamodb === 'string') {
              EventSourceArn = event.dynamodb;
            } else {
              const errorMessage = [
                `DynamoDB event of function "${functionName}" is not an object nor a string`,
                ' The correct syntax is: dynamodb: <streamArn>',
                ' OR an object with "streamArn" property.',
                ' Please check the docs for more info.',
              ].join('');
              throw new this.serverless.classes
                .Error(errorMessage);
            }

            const normalizedFunctionName = functionName[0].toUpperCase() + functionName.substr(1);

            const dynamoDbTemplate = `
              {
                "Type": "AWS::Lambda::EventSourceMapping",
                "DependsOn": "IamPolicyLambdaExecution",
                "Properties": {
                  "BatchSize": ${BatchSize},
                  "EventSourceArn": "${EventSourceArn}",
                  "FunctionName": {
                    "Fn::GetAtt": [
                      "${normalizedFunctionName}LambdaFunction",
                      "Arn"
                    ]
                  },
                  "StartingPosition": "${StartingPosition}",
                  "Enabled": "${Enabled}"
                }
              }
            `;

            const dynamoDbStatement = {
              Effect: 'Allow',
              Action: [
                'dynamodb:GetRecords',
                'dynamodb:GetShardIterator',
                'dynamodb:DescribeStream',
                'dynamodb:ListStreams',
              ],
              Resource: EventSourceArn,
            };

            const statement = this.serverless.service.provider.compiledCloudFormationTemplate
              .Resources
              .IamPolicyLambdaExecution
              .Properties
              .PolicyDocument
              .Statement;

            this.serverless.service.provider.compiledCloudFormationTemplate
              .Resources
              .IamPolicyLambdaExecution
              .Properties
              .PolicyDocument
              .Statement = statement.concat([dynamoDbStatement]);

            let tableName = EventSourceArn.split('/')[1];
            // normalize the tableName
            tableName = tableName[0].toUpperCase() + tableName.substr(1);

            const newDynamoDbObject = {
              [`${normalizedFunctionName}EventSourceMappingDynamoDb${
                tableName}`]: JSON.parse(dynamoDbTemplate),
            };

            _.merge(this.serverless.service.provider.compiledCloudFormationTemplate.Resources,
              newDynamoDbObject);
          }
        });
      }
    });
  }
}

module.exports = AwsCompileDynamoDbEvents;
