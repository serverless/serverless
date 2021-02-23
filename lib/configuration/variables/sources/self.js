'use strict';

module.exports = {
  resolve: async ({ address, resolveConfigurationProperty }) => {
    const result = await resolveConfigurationProperty(address ? address.split('.') : []);
    return result == null ? null : result;
  },
};
