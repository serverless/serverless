'use strict';
const _ = require('lodash');

/*
 * For error object structure, see https://github.com/ajv-validator/ajv/#error-objects
 */
module.exports.buildErrorMessages = (ajvErrors, userConfig = {}) =>
  structureAjvErrors(ajvErrors).map(error => {
    switch (error.type) {
      case 'ajvError':
        return friendlyMessage(error, userConfig)
          ? friendlyMessage(error, userConfig)
          : buildDefaultMessage(error);
      case 'groupedError':
        return buildGroupedErrorMessage(error, userConfig);
      default:
        throw new Error('error.type can be either ajvError or groupedError');
    }
  });

/*
 * Structure AJV errors to prevent secondary errors related to 'anyOf' condition
 * are not shown. Those errors are placed in `errors` array of the most
 * relevant error.
 */
const structureAjvErrors = ajvErrors => {
  const uniqueDataPaths = [...new Set(ajvErrors.map(err => err.dataPath))].filter(
    dataPath => dataPath !== ''
  );

  // Errors at root level have dataPath equaled to empty string which do not need
  // to be grouped, so they are handled separately.
  const rootAjvErrors = ajvErrors
    .filter(err => err.dataPath === '')
    .map(err => {
      err.type = 'ajvError';
      return err;
    });

  const structuredErrors = uniqueDataPaths.map(dataPath => {
    const relatedAjvErrors = ajvErrors.filter(err => err.dataPath === dataPath);
    if (relatedAjvErrors.length === 1) {
      const result = relatedAjvErrors[0];
      result.type = 'ajvError';
      return result;
    }
    return {
      type: 'groupedError',
      dataPath,
      errors: relatedAjvErrors,
    };
  });

  const groupedBy = _.groupBy(structuredErrors, err => {
    const longestDataPath = structuredErrors
      .filter(el => el.dataPath.startsWith(err.dataPath))
      .sort((a, b) => b.dataPath.length - a.dataPath.length)
      .map(el => el.dataPath)[0];
    return longestDataPath;
  });

  const structuredErrorsWithSubErrors = Object.keys(groupedBy).map(dataPath => {
    const elements = groupedBy[dataPath];
    if (elements.length > 1) {
      const mainEl = elements.sort((a, b) => b.dataPath.length - a.dataPath.length)[0];
      const elementsWithoutMainEl = elements.filter(el => el.dataPath !== mainEl.dataPath);
      mainEl.subErrors = elementsWithoutMainEl;
      return mainEl;
    }
    return elements[0];
  });

  return [...rootAjvErrors, ...structuredErrorsWithSubErrors];
};

const buildGroupedErrorMessage = (groupedError, userConfig) => {
  let result;

  if (groupedError.errors.find(err => err.keyword === 'anyOf')) {
    const alternativesStr = groupedError.errors
      .filter(err => err.keyword !== 'anyOf')
      .map(err => err.message)
      .join(', ');
    result = `${getFormattedDataPath(groupedError.dataPath)} should be any of: ${alternativesStr}`;
  }

  const additionalPropertiesError = groupedError.errors.find(
    err => err.keyword === 'additionalProperties'
  );
  if (
    additionalPropertiesError &&
    groupedError.errors.find(err => err.keyword === 'anyOf') &&
    typeof _.get(userConfig, groupedError.dataPath.slice(1)) === 'object'
  ) {
    result = buildDefaultMessage(additionalPropertiesError);
  }

  if (isEventAnyOfErrorObject(groupedError)) {
    result = `Unsupported function event '${
      groupedError.errors.find(err => err.keyword !== 'anyOf').params.additionalProperty
    }' at ${getFormattedDataPath(groupedError.dataPath)}`;
  }

  if (incorrectEventIndentationErrorMessage(groupedError, userConfig)) {
    result = incorrectEventIndentationErrorMessage(groupedError, userConfig);
  }

  return result;
};

const buildDefaultMessage = ajvError => {
  switch (ajvError.keyword) {
    case 'additionalProperties': {
      let additionalProperty;
      if (ajvError.params && ajvError.params.additionalProperty) {
        additionalProperty = ajvError.params.additionalProperty;
      }
      const formattedDataPath = getFormattedDataPath(ajvError.dataPath);
      return `Unrecognized property '${additionalProperty}' on '${formattedDataPath}'`;
    }
    default:
      return `${getFormattedDataPath(ajvError.dataPath)} ${ajvError.message}`;
  }
};

const friendlyMessage = ajvError => {
  let result;

  if (ajvError.dataPath === '.functions' && ajvError.params && ajvError.params.additionalProperty) {
    result = `Function name '${
      ajvError.params.additionalProperty
    }' must be alphanumeric at ${getFormattedDataPath(ajvError.dataPath)}.`;
  }

  return result;
};

function isEventAnyOfErrorObject(groupedError) {
  const ANY_OF_EVENT_SCHEMA_PATH =
    '#/properties/functions/patternProperties/%5E%5Ba-zA-Z0-9-_%5D%2B%24/properties/events/items/anyOf';
  return (
    groupedError.errors.find(err => err.keyword === 'anyOf') &&
    groupedError.errors.find(err => err.keyword === 'anyOf').schemaPath ===
      ANY_OF_EVENT_SCHEMA_PATH &&
    groupedError.errors.find(err => err.keyword !== 'anyOf').params &&
    groupedError.errors.find(err => err.keyword !== 'anyOf').params.additionalProperty
  );
}

function incorrectEventIndentationErrorMessage(error, userConfig) {
  // console.log('configUnderValidation', userConfig)
  // console.log('===')
  // console.log('error', require('util').inspect(error, false, null, true));

  if (
    _.get(userConfig, error.dataPath.slice(1)) === null &&
    error.subErrors &&
    error.subErrors[0] &&
    error.subErrors[0].type === 'groupedError' &&
    isEventAnyOfErrorObject(error.subErrors[0])
  ) {
    const actualError = error.subErrors[0];
    const configUnderValidation = _.get(userConfig, actualError.dataPath.slice(1));
    const contextStr = `${Object.keys(configUnderValidation).length} (${Object.keys(
      configUnderValidation
    ).join(', ')})`;
    return [
      'Event should contain only one root property,',
      `but got ${contextStr} at ${getFormattedDataPath(error.dataPath)}`,
    ].join(' ');
  }

  return false;
}

const getFormattedDataPath = dataPath => {
  const result = dataPath === '' ? 'root' : dataPath.slice(1);

  // This regex helps replace functions['someFunc'].foo with functions.someFunc.foo
  const bracketsRegex = /\['([a-zA-Z_0-9]+)'\]/g;

  return result.replace(bracketsRegex, '.$1');
};
