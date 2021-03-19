'use strict';

module.exports = {
  resolve: async ({ address, resolveConfigurationProperty }) => {
    const result = await resolveConfigurationProperty(address ? address.split('.') : []);
    return { value: result == null ? null : result };
  },
};
