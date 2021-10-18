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
      ({ Effect: effect, Action: action, NotAction: notAction }) => {
        const sorted = (array) => {
          const sortedArray = [...array];
          sortedArray.sort();
          return sortedArray;
        };
        const normalizeArrayableSegment = (segment) => {
          if (segment === undefined) return undefined;
          return Array.isArray(segment) ? sorted(segment) : [segment];
        };
        const keySegments = {
          Effect: effect,
          Action: normalizeArrayableSegment(action),
          NotAction: normalizeArrayableSegment(notAction),
        };
        return JSON.stringify(keySegments);
      }
    );

    const resultStatements = [];

    Object.values(groups).forEach((groupStatements) => {
      const resources = groupStatements.reduce((acc, { Resource: resource }) => {
        if (!resource) {
          return acc;
        }
        return acc.concat(Array.isArray(resource) ? resource : [resource]);
      }, []);

      if (resources.length === 0) {
        return;
      }

      const resource = resources.length === 1 ? resources[0] : resources;
      resultStatements.push(Object.assign(groupStatements[0], { Resource: resource }));
    });

    return resultStatements;
  },
};
