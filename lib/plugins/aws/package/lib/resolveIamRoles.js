'use strict';

const _ = require('lodash');

module.exports = {
  resolveIamRoles() {
    // Register all awsProvider.iamConfig.principals and functions[].iamConfig.principals
    // on IamRoleLambdaExecution resource (ensuring no duplicates)

    // add all awsProvider.iamConfig.managedPolicies and functions[].iamConfig.managedPolicies
    // and functions[].iamConfig.managedPolicies to IamRoleLambdaExecution resource (ensuring no duplicates)

    // ***PROVIDER
    let managedPolicies = this.serverless.service.provider.iamConfig.managedPolicies;

    // ***FUNCTIONS
    this.serverless.service.getAllFunctions().forEach(functionName => {
      const functionObject = this.serverless.service.getFunction(functionName);

      if (functionObject.iamConfig.managedPolicies) {
        managedPolicies = managedPolicies.concat(functionObject.iamConfig.managedPolicies);
      }
    });

    // ***CHECK FOR DUPLICATES
    managedPolicies = _.uniqWith(managedPolicies, _.isEqual);

    // ***MERGE INTO CF TEMPLATE

    if (managedPolicies.length > 0) {
      this.mergeManagedPolicies(managedPolicies);
    }

    // add all awsProvider.iamConfig.policyStatements and functions[].iamConfig.policyStatements to IamRoleLambdaExecution resource (ensuring no duplicates)

    // ***PROVIDER
    let policyStatements = this.serverless.service.provider.iamConfig.policyStatements;

    // ***FUNCTIONS
    this.serverless.service.getAllFunctions().forEach(functionName => {
      const functionObject = this.serverless.service.getFunction(functionName);

      if (functionObject.iamConfig.policyStatements) {
        policyStatements = policyStatements.concat(functionObject.iamConfig.policyStatements);
      }
    });

    // ***CHECK FOR DUPLICATES
    policyStatements = _.uniqWith(policyStatements, _.isEqual);

    // ****MERGE INTO CF TEMPLATE

    const CFPolicyStatements = this.serverless.service.provider.compiledCloudFormationTemplate
      .Resources[this.provider.naming.getRoleLogicalId()].Properties.Policies[0].PolicyDocument
      .Statement;

    policyStatements = CFPolicyStatements.concat(policyStatements);

    this.serverless.service.provider.compiledCloudFormationTemplate.Resources[
      this.provider.naming.getRoleLogicalId()
    ].Properties.Policies[0].PolicyDocument.Statement = policyStatements;
  },

  mergeManagedPolicies(managedPolicies) {
    const resource = this.serverless.service.provider.compiledCloudFormationTemplate.Resources[
      this.provider.naming.getRoleLogicalId()
    ].Properties;
    if (!Array.isArray(resource.ManagedPolicyArns)) {
      resource.ManagedPolicyArns = [];
    }
    resource.ManagedPolicyArns = resource.ManagedPolicyArns.concat(managedPolicies);
  },
};
