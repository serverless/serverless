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

    iamRoleLambdaExecution.Properties.Policies[0].PolicyDocument.Statement = this.mergeStatements(
      _.uniqWith(statements, _.isEqual)
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
        [effect, action, notAction]
          .map((segment) => {
            const segments = Array.isArray(segment) ? [...segment] : [segment];
            segments.sort();
            return segments.join('^^^^');
          })
          .join('////')
    );

    const merged = [];

    Object.values(groups).forEach((statements_) => {
      const resources = statements_.reduce((acc, { Resource: resource }) => {
        if (!resource) {
          return acc;
        }
        return acc.concat(Array.isArray(resource) ? resource : [resource]);
      }, []);

      if (resources.length === 0) {
        return;
      }

      const resource = resources.length === 1 ? resources[0] : resources;
      merged.push(Object.assign(statements_[0], { Resource: resource }));
    });

    return merged;
  },
};
