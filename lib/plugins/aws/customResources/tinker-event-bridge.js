'use strict';

const { handler } = require('./resources/eventBridge/handler');

function main() {
  const event = {
    RequestType: 'Create',
    ResourceProperties: {
      FunctionName: 'philipp-test-dev-test',
      EventBridgeName: 'MyEventBridge',
      EventBridgeConfig: {
        // --- schedule example ---
        // EventBus: 'some-arn'
        Schedule: 'rate(10 minutes)',
        Input: {
          key1: 'value1',
          key2: 'value2',
          stageParams: {
            stage: 'dev',
          },
        },
        // InputPath: '$.stageVariables'
        // InputTransformer: {
        //   inputPathsMap: {
        //     eventTime: '$.time',
        //   },
        //   inputTemplate: '{"time": <eventTime>, "key1": "value1"}',
        // },
      },
    },
  };

  const context = {
    invokedFunctionArn: 'arn:aws:lambda:us-east-1:377024778620:function:philipp-test-dev-test',
  };

  return handler(event, context);
}

main();
