'use strict';

module.exports.cfValue = (value) => {
  return {
    anyOf: [value, { $ref: '#/definitions/awsCfFunction' }, { $ref: '#/definitions/awsCfIf' }],
  };
};
