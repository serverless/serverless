'use strict';

const { entries } = require('lodash');

const objectSubsetEquals = (subsetObj, obj) => {
  if (typeof subsetObj === 'object') {
    if (Array.isArray(subsetObj)) {
      if (subsetObj.length !== obj.length) {
        return false;
      }
      for (const i of Object.keys(subsetObj)) {
        if (!objectSubsetEquals(subsetObj[i], obj[i])) {
          return false;
        }
      }
    } else {
      for (const [key, value] of entries(subsetObj)) {
        if (!objectSubsetEquals(value, obj[key])) {
          return false;
        }
      }
    }
    return true;
  }
  return subsetObj === obj;
};

module.exports = objectSubsetEquals;
