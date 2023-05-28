'use strict';

/**
 * Source code - https://github.com/PunitSoniME/purekit/blob/main/src/object/get.ts
 * 
 * @param {Object} object - The object to query.
 * @param {(string | Array | *)} path - The path of the property to get.
 * @param {*} [defaultValue] - The value returned for undefined resolved values.
 * 
 * @returns {*} - Returns the resolved value.
*/
const _get = (object, path, defaultValue) => {
    // If path is not defined or it has false value
    if (!path) return undefined;
    // Regex explained: https://regexr.com/58j0k
    const pathArray = Array.isArray(path) ? path : path.match(/([^[.\]])+/g);

    if (pathArray === null) return defaultValue;
    // Find value
    const result = (pathArray).reduce(
        (prevObj, key) => prevObj && prevObj[key],
        object
    );
    // If found value is undefined return default value; otherwise return the value
    return result === undefined ? defaultValue : result;
};

module.exports = _get;
