'use strict';

module.exports.property = async ({ resolveVariable }) => ({
  varResult: await resolveVariable('file(file.json)'),
});
