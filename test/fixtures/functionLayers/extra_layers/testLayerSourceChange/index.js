'use strict';

module.exports.layer = (foo, bar) => {
  const newVariable = 12;
  return foo + bar + newVariable;
};
