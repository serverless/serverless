'use strict';

const _ = require('lodash');

const isEventTypeInstancePath = RegExp.prototype.test.bind(/^\/functions\/[^/]+\/events\/\d+$/);
const oneOfPathPattern = /\/(?:anyOf|oneOf)(?:\/\d+\/|$)/;
const isAnyOfPathTypePostfix = RegExp.prototype.test.bind(/^\/\d+\/type$/);
const oneOfKeywords = new Set(['anyOf', 'oneOf']);

const filterIrreleventEventConfigurationErrors = (resultErrorsSet) => {
  // 1. Resolve all errors at event type configuration level
  const eventTypeErrors = Array.from(resultErrorsSet).filter(({ instancePath }) =>
    isEventTypeInstancePath(instancePath)
  );
  // 2. Group event type configuration errors by event instance
  const eventTypeErrorsByEvent = _.groupBy(eventTypeErrors, ({ instancePath }) => instancePath);

  // 3. Process each error group individually
  for (const [instancePath, eventEventTypeErrors] of Object.entries(eventTypeErrorsByEvent)) {
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
          (error) =>
            error.instancePath.startsWith(instancePath) && error.instancePath !== instancePath
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
        if (!error.instancePath.startsWith(instancePath)) continue;
        if (
          error.instancePath === instancePath &&
          error.schemaPath.startsWith(meaningfulSchemaPath)
        ) {
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
    // 2.2. Group by instancePath
    oneOfPathErrors.sort(({ instancePath: instancePathA }, { instancePath: instancePathB }) =>
      instancePathA.localeCompare(instancePathB)
    );
    let currentInstancePath = oneOfPathErrors[0].instancePath;
    Object.values(
      _.groupBy(oneOfPathErrors, ({ instancePath }) => {
        if (
          instancePath !== currentInstancePath &&
          !instancePath.startsWith(`${currentInstancePath}/`)
        ) {
          currentInstancePath = instancePath;
        }
        return currentInstancePath;
      })
    ).forEach((instancePathOneOfPathErrors) => {
      // 2.2.1.If just one error, set was already filtered by event configuration errors filter
      if (instancePathOneOfPathErrors.length === 1) return;
      // 2.2.2 Group by anyOf variant
      const groupFromIndex = oneOfPath.length + 1;
      const instancePathOneOfPathErrorsByVariant = _.groupBy(
        instancePathOneOfPathErrors,
        ({ schemaPath }) => {
          if (groupFromIndex > schemaPath.length) return 'root';
          return schemaPath.slice(groupFromIndex, schemaPath.indexOf('/', groupFromIndex));
        }
      );

      // 2.2.3 If no root error, set was already filtered by event configuration errors filter
      if (!instancePathOneOfPathErrorsByVariant.root) return;
      const noMatchingVariantError = instancePathOneOfPathErrorsByVariant.root[0];
      delete instancePathOneOfPathErrorsByVariant.root;
      let instancePathOneOfPathVariants = Object.values(instancePathOneOfPathErrorsByVariant);
      // 2.2.4 If no variants, set was already filtered by event configuration errors filter
      if (!instancePathOneOfPathVariants.length) return;

      if (instancePathOneOfPathVariants.length > 1) {
        // 2.2.5 If errors reported for more than one variant
        // 2.2.5.1 Filter variants where value type was not met
        instancePathOneOfPathVariants = instancePathOneOfPathVariants.filter(
          (instancePathOneOfPathVariantErrors) => {
            if (instancePathOneOfPathVariantErrors.length !== 1) return true;
            if (instancePathOneOfPathVariantErrors[0].keyword !== 'type') return true;
            if (
              !isAnyOfPathTypePostfix(
                instancePathOneOfPathVariantErrors[0].schemaPath.slice(oneOfPath.length)
              )
            ) {
              return true;
            }
            for (const instancePathOneOfPathVariantError of instancePathOneOfPathVariantErrors) {
              resultErrorsSet.delete(instancePathOneOfPathVariantError);
            }
            return false;
          }
        );
        if (instancePathOneOfPathVariants.length > 1) {
          // 2.2.5.2 Leave out variants where errors address deepest data paths
          let deepestInstancePathSize = 0;
          for (const instancePathOneOfPathVariantErrors of instancePathOneOfPathVariants) {
            instancePathOneOfPathVariantErrors.deepestInstancePathSize = Math.max(
              ...instancePathOneOfPathVariantErrors.map(
                ({ instancePath }) => (instancePath.match(/\//g) || []).length
              )
            );
            if (
              instancePathOneOfPathVariantErrors.deepestInstancePathSize > deepestInstancePathSize
            ) {
              deepestInstancePathSize = instancePathOneOfPathVariantErrors.deepestInstancePathSize;
            }
          }

          instancePathOneOfPathVariants = instancePathOneOfPathVariants.filter(
            (instancePathAnyOfPathVariantErrors) => {
              if (
                instancePathAnyOfPathVariantErrors.deepestInstancePathSize ===
                deepestInstancePathSize
              ) {
                return true;
              }
              for (const instancePathOneOfPathVariantError of instancePathAnyOfPathVariantErrors) {
                resultErrorsSet.delete(instancePathOneOfPathVariantError);
              }
              return false;
            }
          );
        }
      }

      // 2.2.6 If all variants were filtered, expose just "no matching variant" error
      if (!instancePathOneOfPathVariants.length) return;
      // 2.2.7 If just one variant left, expose only errors for that variant
      if (instancePathOneOfPathVariants.length === 1) {
        resultErrorsSet.delete(noMatchingVariantError);
        return;
      }
      // 2.2.8 If more than one variant left, expose just "no matching variant" error
      for (const instancePathOneOfPathVariantErrors of instancePathOneOfPathVariants) {
        const types = new Set();
        for (const instancePathOneOfPathVariantError of instancePathOneOfPathVariantErrors) {
          const parentSchema = instancePathOneOfPathVariantError.parentSchema;
          types.add(parentSchema.const ? 'const' : parentSchema.type);
          resultErrorsSet.delete(instancePathOneOfPathVariantError);
        }
        if (types.size === 1) noMatchingVariantError.commonType = types.values().next().value;
      }
    });
  }
};

const normalizeInstancePath = (instancePath) => {
  if (!instancePath) return 'root';

  // This code removes leading / and replaces / with . in error path indication
  return `'${instancePath.slice(1).replace(/\//g, '.')}'`;
};

const improveMessages = (resultErrorsSet) => {
  for (const error of resultErrorsSet) {
    switch (error.keyword) {
      case 'additionalProperties':
        if (error.instancePath === '/functions') {
          error.message = `name '${error.params.additionalProperty}' must be alphanumeric`;
        } else {
          error.message = `unrecognized property '${error.params.additionalProperty}'`;
        }
        break;
      case 'regexp':
        error.message = `value '${error.data}' does not satisfy pattern ${error.schema}`;
        break;
      case 'anyOf':
        if (isEventTypeInstancePath(error.instancePath)) {
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
    error.message = `at ${normalizeInstancePath(error.instancePath)}: ${error.message}`;
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
