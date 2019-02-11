'use strict';

const _ = require('lodash');
const BbPromise = require('bluebird');

module.exports = {
  compilePermissions() {
    this.validated.events.forEach(event => {
      const lambdaLogicalId = this.provider.naming.getLambdaLogicalId(event.functionName);

      const websocketsPermissionLogicalId = this.provider.naming
        .getLambdaWebsocketsPermissionLogicalId(event.functionName);

      _.merge(this.serverless.service.provider.compiledCloudFormationTemplate.Resources, {
        [websocketsPermissionLogicalId]: {
          Type: 'AWS::Lambda::Permission',
          Properties: {
            FunctionName: {
              'Fn::GetAtt': [lambdaLogicalId, 'Arn'],
            },
            Action: 'lambda:InvokeFunction',
            Principal: { 'Fn::Join': ['', ['apigateway.', { Ref: 'AWS::URLSuffix' }]] },
            SourceArn: {
              'Fn::Join': ['',
                [
                  'arn:',
                  { Ref: 'AWS::Partition' },
                  ':execute-api:',
                  { Ref: 'AWS::Region' },
                  ':',
                  { Ref: 'AWS::AccountId' },
                  ':',
                  this.websocketsApiLogicalId,
                  '/*/*',
                ],
              ],
            },
          },
        },
      });
    });

    return BbPromise.resolve();
  },
};
