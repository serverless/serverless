'use strict';

module.exports = {
  createIamConfig() {
    return {
      servicePrincipals: new Set(),
      policyStatements: [],
      managedPolicies: [],
    };
  },
};
