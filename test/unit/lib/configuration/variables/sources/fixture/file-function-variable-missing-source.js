'use strict';

module.exports = async ({ resolveVariable }) => ({
  varResult: await resolveVariable('file(missing.yaml)'),
});
