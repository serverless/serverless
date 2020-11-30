'use strict';

const _ = require('lodash');

module.exports = {
  resolveIamRoles() {
    let allFunctionsUseCustomRole = true;

    this.serverless.service.getAllFunctions().forEach(functionName => {
      const functionObject = this.serverless.service.getFunction(functionName);

      if (!functionObject.role) {
        allFunctionsUseCustomRole = false;
      }
    });

    if (this.serverless.service.provider.role || allFunctionsUseCustomRole) {
      // early exit if provider.role or all functions use a custom role
      return;
    }

    const iamRoleProperties = this.serverless.service.provider.compiledCloudFormationTemplate
      .Resources[this.provider.naming.getRoleLogicalId()].Properties;

    // Register all awsProvider.iamConfig.principals and functions[].iamConfig.principals
    // on IamRoleLambdaExecution resource (ensuring no duplicates)
    const CFprincipals = iamRoleProperties.AssumeRolePolicyDocument.Statement[0].Principal.Service;

    const filteredPrincipals = new Set(this.serverless.service.provider.iamConfig.principals);

    CFprincipals.forEach(principal => filteredPrincipals.add(principal));

    this.serverless.service.getAllFunctions().forEach(functionName => {
      const functionObject = this.serverless.service.getFunction(functionName);

      functionObject.iamConfig.principals.forEach(principal => {
        filteredPrincipals.add(principal);
      });
    });

    iamRoleProperties.AssumeRolePolicyDocument.Statement[0].Principal.Service = Array.from(
      filteredPrincipals
    );

    // add all awsProvider.iamConfig.managedPolicies and functions[].iamConfig.managedPolicies
    // to IamRoleLambdaExecution resource (ensuring no duplicates)

    let managedPolicies = [...this.serverless.service.provider.iamConfig.managedPolicies];

    this.serverless.service.getAllFunctions().forEach(functionName => {
      const functionObject = this.serverless.service.getFunction(functionName);

      functionObject.iamConfig.managedPolicies.forEach(policy => {
        managedPolicies.push(policy);
      });
    });

    managedPolicies = _.uniqWith(managedPolicies, _.isEqual);

    if (managedPolicies.length > 0) {
      if (!Array.isArray(iamRoleProperties.ManagedPolicyArns)) {
        iamRoleProperties.ManagedPolicyArns = [];
      }

      managedPolicies.forEach(policy => {
        iamRoleProperties.ManagedPolicyArns.push(policy);
      });
    }

    // add all awsProvider.iamConfig.policyStatements and functions[].iamConfig.policyStatements
    // to IamRoleLambdaExecution resource (ensuring no duplicates)

    let policyStatements = [...this.serverless.service.provider.iamConfig.policyStatements];

    this.serverless.service.getAllFunctions().forEach(functionName => {
      const functionObject = this.serverless.service.getFunction(functionName);

      functionObject.iamConfig.policyStatements.forEach(statement => {
        policyStatements.push(statement);
      });
    });

    // also add statements already in CF template before filtering

    const CFPolicyStatements = iamRoleProperties.Policies[0].PolicyDocument.Statement;

    CFPolicyStatements.forEach(statement => {
      policyStatements.push(statement);
    });

    policyStatements = _.uniqWith(policyStatements, _.isEqual);

    iamRoleProperties.Policies[0].PolicyDocument.Statement = policyStatements;
  },
};
