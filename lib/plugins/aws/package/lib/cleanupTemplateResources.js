'use strict';

module.exports = {
  cleanupTemplateResources() {
    const resources = this.serverless.service.provider.compiledCloudFormationTemplate.Resources;

    for (const resource of Object.values(resources)) {
      if (resource.Properties) {
        for (const [propName, propVal] of Object.entries(resource.Properties)) {
          if (propVal === null) {
            delete resource.Properties[propName];
          }
        }
      }
    }

    const roleLogicalIdResource = this.serverless.service.provider.compiledCloudFormationTemplate
      .Resources[this.provider.naming.getRoleLogicalId()];

    if (!roleLogicalIdResource) {
      return;
    }

    const allPolicies = roleLogicalIdResource.Properties.Policies;

    // In some cases upstream compilations for Cloudformation policy statements
    // may omit resources, which are invalid. We need to remove these from the
    // policy document.
    allPolicies[0].PolicyDocument.Statement = allPolicies[0].PolicyDocument.Statement.filter(
      (statement) => !Array.isArray(statement.Resource) || statement.Resource.length > 0
    );

    // However, we cannot have a policy document with no statements so we need
    // to remove the policy document in this case.
    if (allPolicies[0].PolicyDocument.Statement.length === 0) {
      allPolicies.splice(0, 1);
    }
  },
};
