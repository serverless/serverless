'use strict';

const _ = require('lodash');
const resolveDataPathSize = require('./resolveDataPathSize');

const isEventTypeDataPath = RegExp.prototype.test.bind(/^\.functions\[[^\]]+\]\.events\[\d+\]$/);
const oneOfPathPattern = /\/(?:anyOf|oneOf)(?:\/\d+\/|$)/;
const isAnyOfPathTypePostfix = RegExp.prototype.test.bind(/^\/\d+\/type$/);
const dataPathPropertyBracketsPattern = /\['([a-zA-Z_0-9]+)'\]/g;
const oneOfKeywords = new Set(['anyOf', 'oneOf']);

const filterIrreleventEventConfigurationErrors = (resultErrorsSet) => {
  // 1. Resolve all errors at event type configuration level
  const eventTypeErrors = Array.from(resultErrorsSet).filter(({ dataPath }) =>
    isEventTypeDataPath(dataPath)
  );
  // 2. Group event type configuration errors by event instance
  const eventTypeErrorsByEvent = _.groupBy(eventTypeErrors, ({ dataPath }) => dataPath);

  // 3. Process each error group individually
  for (const [dataPath, eventEventTypeErrors] of Object.entries(eventTypeErrorsByEvent)) {
    // 3.1 Resolve error that signals that no event schema was matched
    const noMatchingEventError = eventEventTypeErrors.find(({ keyword }) =>
      oneOfKeywords.has(keyword)
    );

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
    const eventConfiguredEventTypeErrors = Object.entries(eventEventTypeErrorsByTypeIndex).find(
      ([, errors]) => errors.every(({ keyword }) => keyword !== 'required')
    );

    if (!eventConfiguredEventTypeErrors) {
      // 3.4 If there are no event type configuration errors for intended event type
      if (
        !Array.from(resultErrorsSet).some(
          (error) => error.dataPath.startsWith(dataPath) && error.dataPath !== dataPath
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

const filterIrrelevantAnyOfErrors = (resultErrorsSet) => {
  // 1. Group errors by anyOf/oneOf schema path
  const oneOfErrorsByPath = {};
  for (const error of resultErrorsSet) {
    const schemaPath = error.schemaPath;
    let fromIndex = 0;
    let oneOfPathIndex = schemaPath.search(oneOfPathPattern);
    while (oneOfPathIndex !== -1) {
      const oneOfPath = schemaPath.slice(0, fromIndex + oneOfPathIndex + 'anyOf/'.length);
      if (!oneOfErrorsByPath[oneOfPath]) oneOfErrorsByPath[oneOfPath] = [];
      oneOfErrorsByPath[oneOfPath].push(error);
      fromIndex += oneOfPathIndex + 'anyOf/'.length;
      oneOfPathIndex = schemaPath.slice(fromIndex).search(oneOfPathPattern);
    }
  }
  // 2. Process resolved groups
  for (const [oneOfPath, oneOfPathErrors] of Object.entries(oneOfErrorsByPath)) {
    // 2.1. If just one error, set was already filtered by event configuration errors filter
    if (oneOfPathErrors.length === 1) continue;
    // 2.2. Group by dataPath
    oneOfPathErrors.sort(({ dataPath: dataPathA }, { dataPath: dataPathB }) =>
      dataPathA.localeCompare(dataPathB)
    );
    let currentDataPath = oneOfPathErrors[0].dataPath;
    Object.values(
      _.groupBy(oneOfPathErrors, ({ dataPath }) => {
        if (
          dataPath !== currentDataPath &&
          !dataPath.startsWith(`${currentDataPath}.`) &&
          !dataPath.startsWith(`${currentDataPath}[`)
        ) {
          currentDataPath = dataPath;
        }
        return currentDataPath;
      })
    ).forEach((dataPathOneOfPathErrors) => {
      // 2.2.1.If just one error, set was already filtered by event configuration errors filter
      if (dataPathOneOfPathErrors.length === 1) return;
      // 2.2.2 Group by anyOf variant
      const groupFromIndex = oneOfPath.length + 1;
      const dataPathOneOfPathErrorsByVariant = _.groupBy(
        dataPathOneOfPathErrors,
        ({ schemaPath }) => {
          if (groupFromIndex > schemaPath.length) return 'root';
          return schemaPath.slice(groupFromIndex, schemaPath.indexOf('/', groupFromIndex));
        }
      );

      // 2.2.3 If no root error, set was already filtered by event configuration errors filter
      if (!dataPathOneOfPathErrorsByVariant.root) return;
      const noMatchingVariantError = dataPathOneOfPathErrorsByVariant.root[0];
      delete dataPathOneOfPathErrorsByVariant.root;
      let dataPathOneOfPathVariants = Object.values(dataPathOneOfPathErrorsByVariant);
      // 2.2.4 If no variants, set was already filtered by event configuration errors filter
      if (!dataPathOneOfPathVariants.length) return;

      if (dataPathOneOfPathVariants.length > 1) {
        // 2.2.5 If errors reported for more than one variant
        // 2.2.5.1 Filter variants where value type was not met
        dataPathOneOfPathVariants = dataPathOneOfPathVariants.filter(
          (dataPathOneOfPathVariantErrors) => {
            if (dataPathOneOfPathVariantErrors.length !== 1) return true;
            if (dataPathOneOfPathVariantErrors[0].keyword !== 'type') return true;
            if (
              !isAnyOfPathTypePostfix(
                dataPathOneOfPathVariantErrors[0].schemaPath.slice(oneOfPath.length)
              )
            ) {
              return true;
            }
            for (const dataPathOneOfPathVariantError of dataPathOneOfPathVariantErrors) {
              resultErrorsSet.delete(dataPathOneOfPathVariantError);
            }
            return false;
          }
        );
        if (dataPathOneOfPathVariants.length > 1) {
          // 2.2.5.2 Leave out variants where errors address deepest data paths
          let deepestDataPathSize = 0;
          for (const dataPathOneOfPathVariantErrors of dataPathOneOfPathVariants) {
            dataPathOneOfPathVariantErrors.deepestDataPathSize = Math.max(
              ...dataPathOneOfPathVariantErrors.map(({ dataPath }) => resolveDataPathSize(dataPath))
            );
            if (dataPathOneOfPathVariantErrors.deepestDataPathSize > deepestDataPathSize) {
              deepestDataPathSize = dataPathOneOfPathVariantErrors.deepestDataPathSize;
            }
          }

          dataPathOneOfPathVariants = dataPathOneOfPathVariants.filter(
            (dataPathAnyOfPathVariantErrors) => {
              if (dataPathAnyOfPathVariantErrors.deepestDataPathSize === deepestDataPathSize) {
                return true;
              }
              for (const dataPathOneOfPathVariantError of dataPathAnyOfPathVariantErrors) {
                resultErrorsSet.delete(dataPathOneOfPathVariantError);
              }
              return false;
            }
          );
        }
      }

      // 2.2.6 If all variants were filtered, expose just "no matching variant" error
      if (!dataPathOneOfPathVariants.length) return;
      // 2.2.7 If just one variant left, expose only errors for that variant
      if (dataPathOneOfPathVariants.length === 1) {
        resultErrorsSet.delete(noMatchingVariantError);
        return;
      }
      // 2.2.8 If more than one variant left, expose just "no matching variant" error
      for (const dataPathOneOfPathVariantErrors of dataPathOneOfPathVariants) {
        const types = new Set();
        for (const dataPathOneOfPathVariantError of dataPathOneOfPathVariantErrors) {
          const parentSchema = dataPathOneOfPathVariantError.parentSchema;
          types.add(parentSchema.const ? 'const' : parentSchema.type);
          resultErrorsSet.delete(dataPathOneOfPathVariantError);
        }
        if (types.size === 1) noMatchingVariantError.commonType = types.values().next().value;
      }
    });
  }
};

const normalizeDataPath = (dataPath) => {
  if (!dataPath) return 'root';

  // This regex helps replace functions['someFunc'].foo with functions.someFunc.foo
  return `'${dataPath.slice(1).replace(dataPathPropertyBracketsPattern, '.$1')}'`;
};

const improveMessages = (resultErrorsSet) => {
  for (const error of resultErrorsSet) {
    switch (error.keyword) {
      case 'additionalProperties':
        if (error.dataPath === '.functions') {
          error.message = `name '${error.params.additionalProperty}' must be alphanumeric`;
        } else {
          error.message = `unrecognized property '${error.params.additionalProperty}'`;
        }
        break;
      case 'regexp':
        error.message = `value '${error.data}' does not satisfy pattern ${error.schema}`;
        break;
      case 'anyOf':
        if (isEventTypeDataPath(error.dataPath)) {
          error.message = 'unsupported function event';
          break;
        }
      // fallthrough
      case 'oneOf':
        if (error.commonType) {
          if (error.commonType === 'const') error.message = 'unsupported value';
          else error.message = `unsupported ${error.commonType} format`;
        } else {
          error.message = 'unsupported configuration format';
        }
        break;
      case 'enum':
        if (error.params.allowedValues.every((value) => typeof value === 'string')) {
          error.message += ` [${error.params.allowedValues.join(', ')}]`;
        }
        break;
      default:
    }
    error.message = `at ${normalizeDataPath(error.dataPath)}: ${error.message}`;
  }
};

const filterDuplicateErrors = (resultErrorsSet) => {
  const seenMessages = new Set();
  resultErrorsSet.forEach((item) => {
    if (!seenMessages.has(item.message)) {
      seenMessages.add(item.message);
    } else {
      resultErrorsSet.delete(item);
    }
  });
};

/*
 * For error object structure, see https://github.com/ajv-validator/ajv/#error-objects
 */
module.exports = (ajvErrors) => {
  const resultErrorsSet = new Set(ajvErrors);

  // 1. Filter eventual irrelevant errors for faulty event type configurations
  filterIrreleventEventConfigurationErrors(resultErrorsSet);

  // 2. Filter eventual irrelevant errors produced by side anyOf variants
  filterIrrelevantAnyOfErrors(resultErrorsSet);

  // 3. Improve messages UX
  improveMessages(resultErrorsSet);

  // 4. Filter out errors to prevent displaying the same message more than once
  filterDuplicateErrors(resultErrorsSet);

  return Array.from(resultErrorsSet);
};
