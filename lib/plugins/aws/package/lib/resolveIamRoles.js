'use strict';

const _ = require('lodash');

module.exports = {
  resolveIamRoles() {
    const iamRoleLambdaExecution =
      this.serverless.service.provider.compiledCloudFormationTemplate.Resources[
        this.provider.naming.getRoleLogicalId()
      ];

    if (!iamRoleLambdaExecution) {
      return;
    }

    const context = { iamRoleLambdaExecution };

    this.resolveServicePrincipals(context);
    this.resolveStatements(context);
    this.pushManagedPolicies(context);
  },

  resolveServicePrincipals({ iamRoleLambdaExecution }) {
    const lambdaAssumeStatement =
      iamRoleLambdaExecution.Properties.AssumeRolePolicyDocument.Statement.find((statement) =>
        statement.Principal.Service.includes('lambda.amazonaws.com')
      );

    lambdaAssumeStatement.Principal.Service = Array.from(
      new Set([
        ...lambdaAssumeStatement.Principal.Service,
        ...this.provider.iamConfig.servicePrincipals,
        ..._.flatten(
          Object.values(this.serverless.service.functions).map(({ iamConfig }) => [
            ...iamConfig.servicePrincipals,
          ])
        ),
      ])
    );
  },

  resolveStatements({ iamRoleLambdaExecution }) {
    const statements = [
      ...iamRoleLambdaExecution.Properties.Policies[0].PolicyDocument.Statement,
      ...this.provider.iamConfig.policyStatements,
      ..._.flatten(
        Object.values(this.serverless.service.functions).map(
          ({ iamConfig }) => iamConfig.policyStatements
        )
      ),
    ];

    const filteredStatements = statements.filter(
      ({ Resource }) => Resource && (Array.isArray(Resource) ? Resource.length : true)
    );

    iamRoleLambdaExecution.Properties.Policies[0].PolicyDocument.Statement = this.mergeStatements(
      _.uniqWith(filteredStatements, _.isEqual)
    );
  },

  pushManagedPolicies({ iamRoleLambdaExecution }) {
    const managedPolicies = [
      ...(iamRoleLambdaExecution.Properties.ManagedPolicyArns || []),
      ...this.provider.iamConfig.managedPolicies,
      ..._.flatten(
        Object.values(this.serverless.service.functions).map(
          ({ iamConfig }) => iamConfig.managedPolicies
        )
      ),
    ];

    if (!managedPolicies.length) return;

    iamRoleLambdaExecution.Properties.ManagedPolicyArns = _.uniqWith(managedPolicies, _.isEqual);
  },

  mergeStatements(statements) {
    const groups = _.groupBy(
      statements,
      ({ Effect: effect, Action: action, NotAction: notAction }) =>
        JSON.stringify({
          effect,
          action: action && [].concat(action).sort(),
          notAction: notAction && [].concat(notAction).sort(),
        })
    );

    return Object.values(groups).map((groupStatements) => {
      const [resultStatement, ...toBeJoinedStatements] = groupStatements;
      resultStatement.Resource = [].concat(
        resultStatement.Resource,
        ...toBeJoinedStatements.map(({ Resource }) => Resource)
      );
      resultStatement.Resource =
        resultStatement.Resource.length === 1
          ? resultStatement.Resource[0]
          : resultStatement.Resource;
      return resultStatement;
    });
  },
};
