'use strict';

const BbPromise = require('bluebird');
const _ = require('lodash');

module.exports = {
  compileTargetGroups() {
    this.validated.events.forEach((event) => {
      const targetGroupLogicalId = this.provider.naming
        .getAlbTargetGroupLogicalId(event.name);
      const lambdaLogicalId = this.provider.naming
        .getLambdaLogicalId(event.functionName);
      const lambdaPermissionLogicalId = this.provider.naming
        .getLambdaAlbPermissionLogicalId(event.functionName);

      _.merge(this.serverless.service.provider.compiledCloudFormationTemplate.Resources, {
        [targetGroupLogicalId]: {
          Type: 'AWS::ElasticLoadBalancingV2::TargetGroup',
          Properties: {
            TargetType: 'lambda',
            Targets: [
              {
                Id: {
                  'Fn::GetAtt': [lambdaLogicalId, 'Arn'],
                },
              },
            ],
          },
          DependsOn: [lambdaPermissionLogicalId],
        },
      });
    });

    return BbPromise.resolve();
  },
};
