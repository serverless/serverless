'use strict';

const _ = require('lodash');

module.exports = {
  resolveIamRoles() {
    const resource = this.serverless.service.provider.compiledCloudFormationTemplate.Resources[
      this.provider.naming.getRoleLogicalId()
    ].Properties;

    // Register all awsProvider.iamConfig.principals and functions[].iamConfig.principals
    // on IamRoleLambdaExecution resource (ensuring no duplicates)
    const CFprincipals = resource.AssumeRolePolicyDocument.Statement[0].Principal.Service;

    const principals = new Set(this.serverless.service.provider.iamConfig.principals);

    this.serverless.service.getAllFunctions().forEach(functionName => {
      const functionObject = this.serverless.service.getFunction(functionName);

      functionObject.iamConfig.principals.forEach(principal => {
        principals.add(principal);
      });
    });

    principals.forEach(principal => {
      CFprincipals.push(principal);
    });

    // add all awsProvider.iamConfig.managedPolicies and functions[].iamConfig.managedPolicies
    // and functions[].iamConfig.managedPolicies to IamRoleLambdaExecution resource (ensuring no duplicates)

    let managedPolicies = this.serverless.service.provider.iamConfig.managedPolicies;

    this.serverless.service.getAllFunctions().forEach(functionName => {
      const functionObject = this.serverless.service.getFunction(functionName);

      managedPolicies = managedPolicies.concat(functionObject.iamConfig.managedPolicies);
    });

    managedPolicies = _.uniqWith(managedPolicies, _.isEqual);

    if (managedPolicies.length > 0) {
      if (!Array.isArray(resource.ManagedPolicyArns)) {
        resource.ManagedPolicyArns = [];
      }
      resource.ManagedPolicyArns = resource.ManagedPolicyArns.concat(managedPolicies);
    }

    // add all awsProvider.iamConfig.policyStatements and functions[].iamConfig.policyStatements to IamRoleLambdaExecution resource (ensuring no duplicates)

    let policyStatements = this.serverless.service.provider.iamConfig.policyStatements;

    this.serverless.service.getAllFunctions().forEach(functionName => {
      const functionObject = this.serverless.service.getFunction(functionName);

      if (functionObject.iamConfig.policyStatements) {
        policyStatements = policyStatements.concat(functionObject.iamConfig.policyStatements);
      }
    });

    policyStatements = _.uniqWith(policyStatements, _.isEqual);

    const CFPolicyStatements = resource.Policies[0].PolicyDocument.Statement;

    policyStatements = CFPolicyStatements.concat(policyStatements);

    resource.Policies[0].PolicyDocument.Statement = policyStatements;
  },
};
