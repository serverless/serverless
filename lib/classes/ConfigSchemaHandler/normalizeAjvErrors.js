'use strict';
const _ = require('lodash');

/*
 * For error object structure, see https://github.com/ajv-validator/ajv/#error-objects
 */
module.exports = (ajvErrors, userConfig = {}) =>
  groupAjvErrors(ajvErrors).map(error => {
    let message;
    switch (error.type) {
      case 'ajvError':
        message = buildAjvErrorMessage(error, userConfig);
        break;
      case 'groupedError':
        message = buildGroupedErrorMessage(error, userConfig);
        break;
      default:
        throw new Error('error.type can be either ajvError or groupedError');
    }
    return { message, error };
  });

const buildAjvErrorMessage = (error, userConfig) => {
  return friendlyMessage(error, userConfig)
    ? friendlyMessage(error, userConfig)
    : buildDefaultMessage(error);
};

/*
 * Group AJV errors.
 *
 * Even if user makes only one mistake in config, AJV may generate multiple errors.
 * Usually this happens when schema contains keywords like `anyOf`, `oneOf`, etc. In
 * this case AJV reports all errors for schemas inside anyOf array. Additionaly,
 * in case schema contains nested anyOf parts and a user makes a mistake deeeply
 * inside config, AJV reports errors from all anyOf cases.
 *
 * Grouping is performed on dataPath and schemaPath properties of AJV error.
 * First, initial errors are grouped by dataPath, which leads to creating groupedError,
 * a collection of AJV errors with same dataPath.
 *
 * Second, after errors are grouped, we need to filter out errors that were produced
 * simply because on higher schema level there was anyOf keyword. Such errors are stored
 * in `subErrors` prorerty. In most cases subErrors is useless.
 *
 */
const groupAjvErrors = ajvErrors => {
  const groupingShouldBeSkipped = err => err.dataPath === '' || !err.schemaPath.includes('anyOf');

  const uniqueDataPaths = [
    ...new Set(ajvErrors.filter(err => !groupingShouldBeSkipped(err)).map(err => err.dataPath)),
  ];

  // Some errors do not require grouping. So they are added separately, to prevent
  // accidental adding to `subErrors` which would make an error to become
  // hidden to a user.
  const ajvErrorThatDontRequireGrouping = ajvErrors
    .filter(err => groupingShouldBeSkipped(err))
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

  return [...ajvErrorThatDontRequireGrouping, ...structuredErrorsWithSubErrors];
};

const buildGroupedErrorMessage = (groupedError, userConfig) => {
  let result = groupedError.errors
    .map(ajvErr => buildAjvErrorMessage(ajvErr, userConfig))
    .join('; ');

  if (groupedError.errors.find(err => err.keyword === 'anyOf')) {
    const alternativesStr = groupedError.errors
      .filter(err => err.keyword !== 'anyOf')
      .map(err => buildAjvErrorMessage(err))
      .join('; ');
    result = `${getFormattedDataPath(
      groupedError.dataPath
    )} should match schema any of: ${alternativesStr}`;
  }

  /*
   * Keywords for objects are taken from
   * http://github.com/ajv-validator/ajv/blob/master/KEYWORDS.md#keywords-for-objects
   */
  const KEYWORDS_FOR_OBJECTS_REGEX = /^(maxProperties|minProperties|required|properties|patternProperties|additionalProperties|dependencies|propertyNames)$/;
  const ajvErrorsWithKeywordsForObject = groupedError.errors.filter(err =>
    KEYWORDS_FOR_OBJECTS_REGEX.test(err.keyword)
  );
  if (
    ajvErrorsWithKeywordsForObject.length === 1 &&
    groupedError.errors.find(err => err.keyword === 'anyOf') &&
    typeof _.get(userConfig, groupedError.dataPath.slice(1)) === 'object'
  ) {
    result = buildAjvErrorMessage(ajvErrorsWithKeywordsForObject[0]);
  }

  /*
   * Keywords for strings are taken from
   * http://github.com/ajv-validator/ajv/blob/master/KEYWORDS.md#keywords-for-strings
   */
  const KEYWORDS_FOR_STRINGS_REGEX = /^(pattern|format|maxLength|minLength)$/;
  const ajvErrorsWithKeywordsForString = groupedError.errors.filter(err =>
    KEYWORDS_FOR_STRINGS_REGEX.test(err.keyword)
  );
  if (
    ajvErrorsWithKeywordsForString.length === 1 &&
    groupedError.errors.find(err => err.keyword === 'anyOf') &&
    typeof _.get(userConfig, groupedError.dataPath.slice(1)) === 'string'
  ) {
    result = buildAjvErrorMessage(ajvErrorsWithKeywordsForString[0], userConfig);
  }

  // regex matches '.functions['xxx'].events[x]'
  const isFunctionEvent = /^\.functions\['[\w-_]+'\]\.events\[[0-9]+\]$/.test(
    groupedError.dataPath
  );
  const KEYWORDS_FOR_UNSUPPORTED_FUNCTION_EVENT_REGEX = /^(anyOf|required|additionalProperties)$/;
  if (
    isFunctionEvent &&
    groupedError.errors.find(err => err.keyword === 'additionalProperties') &&
    groupedError.errors.filter(
      err => !KEYWORDS_FOR_UNSUPPORTED_FUNCTION_EVENT_REGEX.test(err.keyword)
    ).length === 0
  ) {
    result = buildAjvErrorMessage(
      groupedError.errors.find(err => err.keyword === 'additionalProperties')
    );
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
    case 'enum':
      return `${getFormattedDataPath(ajvError.dataPath)} ${
        ajvError.message
      }: ${ajvError.params.allowedValues.join(', ')}`;
    default:
      return `${getFormattedDataPath(ajvError.dataPath)} ${ajvError.message}`;
  }
};

const friendlyMessage = ajvError => {
  let result;

  if (ajvError.dataPath === '.functions' && ajvError.params && ajvError.params.additionalProperty) {
    result = `Function name '${ajvError.params.additionalProperty}' must be alphanumeric`;
  }

  // matches '#/properties/functions/patternProperties/%5E%5Ba-zA-Z0-9-_%5D%2B%24/properties/events/items/anyOf/123/additionalProperties'
  const ANY_OF_EVENT_ADDITIONAL_ERROR_REGEX = /^#\/properties\/functions\/patternProperties\/%5E%5Ba-zA-Z0-9-_%5D%2B%24\/properties\/events\/items\/anyOf\/[\d]+\/additionalProperties$/;

  if (
    ANY_OF_EVENT_ADDITIONAL_ERROR_REGEX.test(ajvError.schemaPath) &&
    ajvError.keyword === 'additionalProperties'
  ) {
    result = `Unsupported function event '${
      ajvError.params.additionalProperty
    }' at ${getFormattedDataPath(ajvError.dataPath)}`;
  }

  /*
   * Here's an example how to add friendly error message for a schame that involves
   * regular expressions. The exaple below adds a friendly message for a schema
   * describing inline `http` event. The end user will see this friendly message.
   */
  // if (ajvError.keyword === 'pattern' && ajvError.params.pattern === '^(get|post|put|delete|update)\\s\\w+$') {
  //   result = [
  //     `Invalid pattern for ${ajvError.dataPath}. It must be a string 'METHOD path'.`,
  //     'Supported HTTP methods are: GET, POST, PUT, DELETE, UPDATE.'
  //   ].join(' ')
  // }

  return result;
};

const isEventAnyOfErrorObject = groupedError => {
  const ANY_OF_EVENT_SCHEMA_PATH =
    '#/properties/functions/patternProperties/%5E%5Ba-zA-Z0-9-_%5D%2B%24/properties/events/items/anyOf';
  return (
    groupedError.errors.find(err => err.keyword === 'anyOf') &&
    groupedError.errors.find(err => err.keyword === 'anyOf').schemaPath ===
      ANY_OF_EVENT_SCHEMA_PATH &&
    groupedError.errors.find(err => err.keyword !== 'anyOf').params &&
    groupedError.errors.find(err => err.keyword !== 'anyOf').params.additionalProperty
  );
};

/*
 * Generates error message for incorrect event indentation. Here's
 * example of improper indentation as 'path' and 'method'
 * properties should be indented to the right:
 *
 * functions:
 *   someFunc:
 *     - http:
 *       path: foo
 *       method: get
 */
const incorrectEventIndentationErrorMessage = (groupedError, userConfig) => {
  if (
    _.get(userConfig, groupedError.dataPath.slice(1)) === null &&
    groupedError.subErrors &&
    groupedError.subErrors[0] &&
    isEventAnyOfErrorObject(groupedError.subErrors[0])
  ) {
    const actualError = groupedError.subErrors[0];
    const configUnderValidation = _.get(userConfig, actualError.dataPath.slice(1));
    const contextStr = `${Object.keys(configUnderValidation).length} (${Object.keys(
      configUnderValidation
    ).join(', ')})`;
    return [
      'Event should contain only one root property,',
      `but got ${contextStr} at ${getFormattedDataPath(groupedError.dataPath)}`,
    ].join(' ');
  }

  return false;
};

const getFormattedDataPath = dataPath => {
  const result = dataPath === '' ? 'root' : dataPath.slice(1);

  // This regex helps replace functions['someFunc'].foo with functions.someFunc.foo
  const bracketsRegex = /\['([a-zA-Z_0-9]+)'\]/g;

  return result.replace(bracketsRegex, '.$1');
};
