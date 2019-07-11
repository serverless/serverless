'use strict';

module.exports = {
  compilePermissions() {
    this.validated.events.forEach(event => {
      const { functionName } = event;

      const lambdaLogicalId = this.provider.naming.getLambdaLogicalId(functionName);
      const albPermissionLogicalId = this.provider.naming.getLambdaAlbPermissionLogicalId(
        functionName
      );

      Object.assign(this.serverless.service.provider.compiledCloudFormationTemplate.Resources, {
        [albPermissionLogicalId]: {
          Type: 'AWS::Lambda::Permission',
          Properties: {
            FunctionName: {
              'Fn::GetAtt': [lambdaLogicalId, 'Arn'],
            },
            Action: 'lambda:InvokeFunction',
            Principal: 'elasticloadbalancing.amazonaws.com',
          },
          DependsOn: [lambdaLogicalId],
        },
      });
    });
  },
};
