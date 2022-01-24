'use strict';

module.exports = async ({ resolveVariable }) => ({
  varResult: await resolveVariable('file(file-function-many-variables.yaml)'),
});
