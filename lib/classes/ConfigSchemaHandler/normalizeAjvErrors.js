'use strict';

const _ = require('lodash');
const resolveDataPathSize = require('./resolveDataPathSize');

const isEventTypeDataPath = RegExp.prototype.test.bind(/^\.functions\[[^\]]+\]\.events\[\d+\]$/);
const anyOfPathPattern = /\/anyOf(?:\/\d+\/|$)/;
const isAnyOfPathTypePostfix = RegExp.prototype.test.bind(/^\/\d+\/type$/);
const dataPathPropertyBracketsPattern = /\['([a-zA-Z_0-9]+)'\]/g;

const filterIrreleventEventConfigurationErrors = resultErrorsSet => {
  // 1. Resolve all errors at event type configuration level
  const eventTypeErrors = Array.from(resultErrorsSet).filter(({ dataPath }) =>
    isEventTypeDataPath(dataPath)
  );
  // 2. Group event type configuration errors by event instance
  const eventTypeErrorsByEvent = _.groupBy(eventTypeErrors, ({ dataPath }) => dataPath);

  // 3. Process each error group individually
  for (const [dataPath, eventEventTypeErrors] of _.entries(eventTypeErrorsByEvent)) {
    // 3.1 Resolve error that signals that no event schema was matched
    const noMatchingEventError = eventEventTypeErrors.find(({ keyword }) => keyword === 'anyOf');

    // 3.2 Group errors by event type
    const eventEventTypeErrorsByTypeIndex = _.groupBy(eventEventTypeErrors, ({ schemaPath }) => {
      if (schemaPath === noMatchingEventError.schemaPath) return 'root';
      return schemaPath.slice(
        0,
        schemaPath.indexOf('/', noMatchingEventError.schemaPath.length + 1) + 1
      );
    });
    delete eventEventTypeErrorsByTypeIndex.root;

    // 3.3 Resolve eventual type configuration errors for intended event type
    const eventConfiguredEventTypeErrors = _.entries(
      eventEventTypeErrorsByTypeIndex
    ).find(([, errors]) => errors.every(({ keyword }) => keyword !== 'required'));

    if (!eventConfiguredEventTypeErrors) {
      // 3.4 If there are no event type configuration errors for intended event type
      if (
        !Array.from(resultErrorsSet).some(
          error => error.dataPath.startsWith(dataPath) && error.dataPath !== dataPath
        )
      ) {
        // 3.4.1 If there are no event configuration errors, it means it's not supported event type:
        // 3.4.1.1 Surface: No matching event error
        // 3.4.1.2 Discard: All event type configuration errors
        for (const error of eventEventTypeErrors) {
          if (error !== noMatchingEventError) resultErrorsSet.delete(error);
        }
      } else {
        // 3.4.2 If there are event configuration errors:
        // 3.4.2.1 Surface: Event configuration errors
        // 3.4.2.2 Discard:
        //         - No matching event error
        //         - All event type configuration errors produced by other event schemas
        for (const error of eventEventTypeErrors) resultErrorsSet.delete(error);
      }
    } else {
      // 3.5 There are event type configuration errors for intended event type
      // 3.5.1 Surface: Event type configuration errors for configured and supported event type
      // 3.5.2 Discard:
      //       - No matching event error
      //       - All event type configuration errors produced by other event schemas
      //       - All event configuration errors
      const meaningfulSchemaPath = eventConfiguredEventTypeErrors[0];
      for (const error of resultErrorsSet) {
        if (!error.dataPath.startsWith(dataPath)) continue;
        if (error.dataPath === dataPath && error.schemaPath.startsWith(meaningfulSchemaPath)) {
          continue;
        }
        resultErrorsSet.delete(error);
      }
    }
  }
};

const filterIrrelevantAnyOfErrors = resultErrorsSet => {
  // 1. Group errors by anyOf schema path
  const anyOfErrorsByPath = {};
  for (const error of resultErrorsSet) {
    const schemaPath = error.schemaPath;
    let fromIndex = 0;
    let anyOfPathIndex = schemaPath.search(anyOfPathPattern);
    while (anyOfPathIndex !== -1) {
      const anyOfPath = schemaPath.slice(0, fromIndex + anyOfPathIndex + 'anyOf/'.length);
      if (!anyOfErrorsByPath[anyOfPath]) anyOfErrorsByPath[anyOfPath] = [];
      anyOfErrorsByPath[anyOfPath].push(error);
      fromIndex += anyOfPathIndex + 'anyOf/'.length;
      anyOfPathIndex = schemaPath.slice(fromIndex).search(anyOfPathPattern);
    }
  }
  // 2. Process resolved groups
  for (const [anyOfPath, anyOfPathErrors] of _.entries(anyOfErrorsByPath)) {
    // 2.1. If just one error, set was already filtered by event configuration errors filter
    if (anyOfPathErrors.length === 1) continue;
    // 2.2. Group by dataPath
    anyOfPathErrors.sort(({ dataPath: dataPathA }, { dataPath: dataPathB }) =>
      dataPathA.localeCompare(dataPathB)
    );
    let currentDataPath = anyOfPathErrors[0].dataPath;
    _.values(
      _.groupBy(anyOfPathErrors, ({ dataPath }) => {
        if (
          dataPath !== currentDataPath &&
          !dataPath.startsWith(`${currentDataPath}.`) &&
          !dataPath.startsWith(`${currentDataPath}[`)
        ) {
          currentDataPath = dataPath;
        }
        return currentDataPath;
      })
    ).forEach(dataPathAnyOfPathErrors => {
      // 2.2.1.If just one error, set was already filtered by event configuration errors filter
      if (dataPathAnyOfPathErrors.length === 1) return;
      // 2.2.2 Group by anyOf variant
      const groupFromIndex = anyOfPath.length + 1;
      const dataPathAnyOfPathErrorsByVariant = _.groupBy(
        dataPathAnyOfPathErrors,
        ({ schemaPath }) => {
          if (groupFromIndex > schemaPath.length) return 'root';
          return schemaPath.slice(groupFromIndex, schemaPath.indexOf('/', groupFromIndex));
        }
      );

      // 2.2.3 If no root error, set was already filtered by event configuration errors filter
      if (!dataPathAnyOfPathErrorsByVariant.root) return;
      const noMatchingVariantError = dataPathAnyOfPathErrorsByVariant.root[0];
      delete dataPathAnyOfPathErrorsByVariant.root;
      let dataPathAnyOfPathVariants = _.values(dataPathAnyOfPathErrorsByVariant);
      // 2.2.4 If no variants, set was already filtered by event configuration errors filter
      if (!dataPathAnyOfPathVariants.length) return;

      if (dataPathAnyOfPathVariants.length > 1) {
        // 2.2.5 If errors reported for more than one variant
        // 2.2.5.1 Filter variants where value type was not met
        dataPathAnyOfPathVariants = dataPathAnyOfPathVariants.filter(
          dataPathAnyOfPathVariantErrors => {
            if (dataPathAnyOfPathVariantErrors.length !== 1) return true;
            if (dataPathAnyOfPathVariantErrors[0].keyword !== 'type') return true;
            if (
              !isAnyOfPathTypePostfix(
                dataPathAnyOfPathVariantErrors[0].schemaPath.slice(anyOfPath.length)
              )
            ) {
              return true;
            }
            for (const dataPathAnyOfPathVariantError of dataPathAnyOfPathVariantErrors) {
              resultErrorsSet.delete(dataPathAnyOfPathVariantError);
            }
            return false;
          }
        );
        if (dataPathAnyOfPathVariants.length > 1) {
          // 2.2.5.2 Leave out variants where errors address deepest data paths
          let deepestDataPathSize = 0;
          for (const dataPathAnyOfPathVariantErrors of dataPathAnyOfPathVariants) {
            dataPathAnyOfPathVariantErrors.deepestDataPathSize = Math.max(
              ...dataPathAnyOfPathVariantErrors.map(({ dataPath }) => resolveDataPathSize(dataPath))
            );
            if (dataPathAnyOfPathVariantErrors.deepestDataPathSize > deepestDataPathSize) {
              deepestDataPathSize = dataPathAnyOfPathVariantErrors.deepestDataPathSize;
            }
          }

          dataPathAnyOfPathVariants = dataPathAnyOfPathVariants.filter(
            dataPathAnyOfPathVariantErrors => {
              if (dataPathAnyOfPathVariantErrors.deepestDataPathSize === deepestDataPathSize) {
                return true;
              }
              for (const dataPathAnyOfPathVariantError of dataPathAnyOfPathVariantErrors) {
                resultErrorsSet.delete(dataPathAnyOfPathVariantError);
              }
              return false;
            }
          );
        }
      }

      // 2.2.6 If all variants were filtered, expose just "no matching variant" error
      if (!dataPathAnyOfPathVariants.length) return;
      // 2.2.7 If just one variant left, expose only errors for that variant
      if (dataPathAnyOfPathVariants.length === 1) {
        resultErrorsSet.delete(noMatchingVariantError);
        return;
      }
      // 2.2.8 If more than one variant left, expose just "no matching variant" error
      for (const dataPathAnyOfPathVariantErrors of dataPathAnyOfPathVariants) {
        for (const dataPathAnyOfPathVariantError of dataPathAnyOfPathVariantErrors) {
          resultErrorsSet.delete(dataPathAnyOfPathVariantError);
        }
      }
    });
  }
};

const normalizeDataPath = dataPath => {
  if (!dataPath) return 'root';

  // This regex helps replace functions['someFunc'].foo with functions.someFunc.foo
  return `'${dataPath.slice(1).replace(dataPathPropertyBracketsPattern, '.$1')}'`;
};

const improveMessages = resultErrorsSet => {
  for (const error of resultErrorsSet) {
    switch (error.keyword) {
      case 'additionalProperties':
        if (error.dataPath === '.functions') {
          error.message = `name '${error.params.additionalProperty}' must be alphanumeric`;
        } else {
          error.message = `unrecognized property '${error.params.additionalProperty}'`;
        }
        break;
      case 'anyOf':
        if (isEventTypeDataPath(error.dataPath)) {
          error.message = 'unsupported function event';
        } else {
          error.message = 'unsupported configuration format';
        }
        break;
      case 'enum':
        if (error.params.allowedValues.every(value => typeof value === 'string')) {
          error.message += ` [${error.params.allowedValues.join(', ')}]`;
        }
        break;
      default:
    }
    error.message = `at ${normalizeDataPath(error.dataPath)}: ${error.message}`;
  }
};

/*
 * For error object structure, see https://github.com/ajv-validator/ajv/#error-objects
 */
module.exports = ajvErrors => {
  const resultErrorsSet = new Set(ajvErrors);

  // 1. Filter eventual irrelevant errors for faulty event type configurations
  filterIrreleventEventConfigurationErrors(resultErrorsSet);

  // 2. Filter eventual irrelevant errors produced by side anyOf variants
  filterIrrelevantAnyOfErrors(resultErrorsSet);

  // 3. Improve messages UX
  improveMessages(resultErrorsSet);

  return Array.from(resultErrorsSet);
};
