'use strict';
const _ = require('lodash');

/*
 * Structure AJV errors to prevent secondary errors related to 'anyOf' condition
 * are not shown. Those errors are placed in `errors` array of the most
 * relevant error.
 */
const structureAjvErrors = ajvErrors => {
  let structuredErrors = [...new Set(ajvErrors.map(err => err.dataPath))].filter(
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

  structuredErrors = structuredErrors.map(dataPath => {
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
    if (err.dataPath === '') return '';
    const subArr = structuredErrors
      .filter(el => el.dataPath !== '' && el.dataPath.startsWith(err.dataPath))
      .sort((a, b) => b.dataPath.length - a.dataPath.length)
      .map(el => el.dataPath);
    return subArr[0];
  });

  const grouped = Object.keys(groupedBy).map(dataPath => {
    const elements = groupedBy[dataPath];
    if (elements.length > 1) {
      const mainEl = elements.sort((a, b) => b.dataPath.length - a.dataPath.length)[0];
      const elementsWithoutMainEl = elements.filter(el => el.dataPath !== mainEl.dataPath);
      mainEl.subErrors = elementsWithoutMainEl;
      return mainEl;
    }
    return elements[0];
  });

  return [...rootAjvErrors, ...grouped];
};

/*
 * For error object structure, see https://github.com/ajv-validator/ajv/#error-objects
 */
const buildErrorMessages = (ajvErrors, userConfig = {}) => {
  let errors = ajvErrors;

  errors = structureAjvErrors(errors);

  errors = errors.map(err => {
    const result = err;
    err.friendlyMessage = buildFriendlyMessage(err, userConfig);
    return result;
  });

  return errors.map(error => {
    if (error.friendlyMessage) {
      return error.friendlyMessage;
    }
    return buildDefaultErrorMessage(error);
  });
};

const buildDefaultErrorMessage = ajvError => {
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

const buildFriendlyMessage = (error, userConfig) => {
  let friendlyMessage;

  if (error.type === 'groupedError' && error.errors.find(err => err.keyword === 'anyOf')) {
    const alternativesStr = error.errors
      .filter(err => err.keyword !== 'anyOf')
      .map(err => err.message)
      .join(', ');
    friendlyMessage = `${getFormattedDataPath(
      error.dataPath
    )} should be any of: ${alternativesStr}`;

    const additionalPropertiesError = error.errors.find(
      err => err.keyword === 'additionalProperties'
    );
    if (
      additionalPropertiesError &&
      typeof _.get(userConfig, error.dataPath.slice(1)) === 'object'
    ) {
      friendlyMessage = buildDefaultErrorMessage(additionalPropertiesError);
    }

    const ANY_OF_EVENT_SCHEMA_PATH =
      '#/properties/functions/patternProperties/%5E%5Ba-zA-Z0-9-_%5D%2B%24/properties/events/items/anyOf';
    const isEventAnyOfErrorObject =
      error.errors.find(err => err.keyword === 'anyOf').schemaPath === ANY_OF_EVENT_SCHEMA_PATH &&
      error.errors.find(err => err.keyword !== 'anyOf').params &&
      error.errors.find(err => err.keyword !== 'anyOf').params.additionalProperty;

    if (isEventAnyOfErrorObject) {
      friendlyMessage = `Unsupported function event '${
        error.errors.find(err => err.keyword !== 'anyOf').params.additionalProperty
      }' at ${getFormattedDataPath(error.dataPath)}`;
    }

    const configUnderValidation = _.get(userConfig, error.dataPath.slice(1));

    if (isEventAnyOfErrorObject && Object.keys(configUnderValidation).length > 1) {
      const contextStr = `${Object.keys(configUnderValidation).length} (${Object.keys(
        configUnderValidation
      ).join(', ')})`;
      friendlyMessage = [
        'Event should contain only one root property,',
        `but got ${contextStr} at ${getFormattedDataPath(error.dataPath)}`,
      ].join(' ');
    }

    return friendlyMessage;
  }

  // regex matches '.functions['xxx'].events[x]'
  const isFunctionEvent = /^\.functions\['[\w-_]+'\]\.events\[[0-9]+\]$/.test(error.dataPath);
  if (
    error.type === 'ajvError' &&
    error.params &&
    error.params.additionalProperty &&
    isFunctionEvent
  ) {
    friendlyMessage = `Unsupported function event '${
      error.params.additionalProperty
    }' at ${getFormattedDataPath(error.dataPath)}`;
  }

  if (
    error.type === 'ajvError' &&
    error.dataPath === '.functions' &&
    error.params &&
    error.params.additionalProperty
  ) {
    friendlyMessage = `Function name '${
      error.params.additionalProperty
    }' must be alphanumeric at ${getFormattedDataPath(error.dataPath)}.`;
  }

  return friendlyMessage;
};

function getFormattedDataPath(dataPath) {
  const result = dataPath === '' ? 'root' : dataPath.slice(1);

  // This regex helps replace functions['someFunc'].foo with functions.someFunc.foo
  const bracketsRegex = /\['([a-zA-Z_0-9]+)'\]/g;

  return result.replace(bracketsRegex, '.$1');
}

module.exports = {
  buildErrorMessages,
  buildFriendlyMessage,
};
