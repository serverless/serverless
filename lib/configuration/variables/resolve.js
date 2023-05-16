// Having variables meta, configuration, and sources setup, attempt to resolve all variables

'use strict';

const ensureArray = require('type/array/ensure');
const ensureSet = require('type/set/ensure');
const ensureMap = require('type/map/ensure');
const ensureString = require('type/string/ensure');
const coerceString = require('type/string/coerce');
const isError = require('type/error/is');
const isObject = require('type/object/is');
const isPlainObject = require('type/plain-object/is');
const ensurePlainObject = require('type/plain-object/ensure');
const ensurePlainFunction = require('type/plain-function/ensure');
const memoizeMethods = require('memoizee/methods');
const path = require('path');
const util = require('util');
const d = require('d');
const ServerlessError = require('../../serverless-error');
const humanizePropertyPath = require('./humanize-property-path-keys');
const parse = require('./parse');
const { parseEntries } = require('./resolve-meta');
const VariableSourceResolutionError = require('./source-resolution-error');

const objPropertyIsEnumerable = Object.prototype.propertyIsEnumerable;
const variableProcessingErrorNames = new Set(['ServerlessError', 'VariableSourceResolutionError']);

let lastResolutionBatchId = 0;

const resolveSourceValuesVariables = (sourceValues) => {
  // Value is a result of concatenation of string values coming from multiple sources.
  // Parse variables in each string part individually - it's to avoid accidental
  // resolution of variable-like notation which may surface after joining two values.
  // Also that way we do not accidentally re-parse an escaped variables notation
  let baseIndex = 0;
  let resolvedValueVariables = null;
  for (const sourceValue of sourceValues) {
    const sourceValueVariables = parse(sourceValue);
    if (sourceValueVariables) {
      for (const sourceValueVariable of sourceValueVariables) {
        if (sourceValueVariable.end) {
          sourceValueVariable.start += baseIndex;
          sourceValueVariable.end += baseIndex;
        } else {
          sourceValueVariable.start = baseIndex;
          sourceValueVariable.end = baseIndex + sourceValue.length;
        }
      }
      if (!resolvedValueVariables) resolvedValueVariables = [];
      resolvedValueVariables.push(...sourceValueVariables);
    }
    baseIndex += sourceValue.length;
  }
  return resolvedValueVariables;
};

class VariablesResolver {
  constructor({
    serviceDir,
    configuration,
    variablesMeta,
    sources,
    options,
    fulfilledSources,
    propertyPathsToResolve,
    variableSourcesInConfig,
  }) {
    this.serviceDir = serviceDir;
    this.configuration = configuration;
    this.variablesMeta = variablesMeta;
    this.sources = sources;
    this.options = options;
    this.fulfilledSources = fulfilledSources;
    this.propertyDependenciesMap = new Map();
    this.propertyResolutionNestDepthMap = new Map();
    // It is used to record all encountered variable sources in configuration for telemetry purposes
    this.variableSourcesInConfig = variableSourcesInConfig || new Set();

    // Resolve all variables simultaneously
    // Resolution batches are identified to ensure source resolution cache is not shared among them.
    // (each new resolution batch has access to extended configuration structure
    // and cached source resolver may block access to already resolved structure)
    const resolutionBatchId = ++lastResolutionBatchId;

    if (propertyPathsToResolve) {
      return Promise.all(
        Array.from(propertyPathsToResolve, (propertyPathToResolve) =>
          Promise.all(
            Array.from(variablesMeta.keys(), (propertyPath) => {
              if (
                propertyPathToResolve.startsWith(`${propertyPath}\0`) ||
                propertyPath === propertyPathToResolve ||
                propertyPath.startsWith(`${propertyPathToResolve}\0`)
              ) {
                return this.resolveProperty(resolutionBatchId, propertyPath);
              }
              return null;
            })
          )
        )
      ).then(() => {});
    }

    return Promise.all(
      Array.from(variablesMeta.keys(), (propertyPath) =>
        this.resolveProperty(resolutionBatchId, propertyPath)
      )
    ).then(() => {});
  }
  async resolveVariables(resolutionBatchId, propertyPath, valueMeta) {
    // Resolve all variables configured in given string value.
    await Promise.all(
      valueMeta.variables.map(async (variableMeta) => {
        if (!variableMeta.sources) {
          // Variable was already resolved in previous resolution phase
          return;
        }
        await this.resolveVariable(resolutionBatchId, propertyPath, variableMeta);
        if (!variableMeta.error) {
          // Variable successfully resolved
          return;
        }
        if (valueMeta.error) return;
        delete valueMeta.variables;
        valueMeta.error = variableMeta.error;
      })
    );
    if (!valueMeta.variables) {
      // Abort, as either:
      // - Resolution of some variables errored
      // - Value was already resolved in other resolution batch
      //   (triggered by depending property resolver)
      return;
    }
    if (valueMeta.variables.some((variableMeta) => variableMeta.sources)) {
      // if some of the variables could not be resolved at this point, abort
      return;
    }

    // All variables for value resolved, rebuilt value
    if (valueMeta.variables.length === 1 && !valueMeta.variables[0].end) {
      // String value is represented from start to end by single variable.
      // Replace with resolved value as-is
      valueMeta.value = valueMeta.variables[0].value;
      delete valueMeta.variables;
      return;
    }
    // String value is either constructed from more than one variable
    // or is partially constructed with a variable.
    // In such case, end value is always a string, reconstructed below
    const sourceValues = [];
    const rawValue = valueMeta.value;
    let lastIndex = 0;
    for (const { start, end, value } of valueMeta.variables) {
      const stringValue = coerceString(value);
      if (stringValue == null) {
        delete valueMeta.variables;
        valueMeta.error = new ServerlessError(
          `Cannot resolve variable at "${humanizePropertyPath(
            propertyPath.split('\0')
          )}": String value consist of variable which resolve with non-string value`,
          'NON_STRING_VARIABLE_RESULT'
        );
        return;
      }
      sourceValues.push(rawValue.slice(lastIndex, start), stringValue);
      lastIndex = end;
    }
    sourceValues.push(rawValue.slice(lastIndex));
    valueMeta.value = sourceValues.join('');
    valueMeta.sourceValues = sourceValues;
    delete valueMeta.variables;
  }

  async resolveVariable(resolutionBatchId, propertyPath, variableMeta) {
    // Resolve a single variable, which could be configured with multiple
    // (first-choice, and fallback) sources

    // Work on a copy, as with mulitple resolution batches, there's a rare possibility of same
    // variable being resolved multiple times at once
    const sources = Array.from(variableMeta.sources);
    for (const source of sources) {
      if (source.type) this.variableSourcesInConfig.add(source.type);
    }
    let sourceData = sources[0];
    do {
      const sourceMeta = this.sources[sourceData.type];
      if (!sourceMeta) {
        // Unknown source, skip resolution (it'll leave variable as not resolved)
        return;
      }
      let resolvedData;
      try {
        resolvedData = await this.resolveVariableSource(
          resolutionBatchId,
          propertyPath,
          sourceData
        );
      } catch (error) {
        /* istanbul ignore next */
        if (
          !error ||
          !error.constructor ||
          !variableProcessingErrorNames.has(error.constructor.name)
        ) {
          // Programmer error (ideally dead path)
          throw error;
        }
        if (error.code === 'MISSING_VARIABLE_DEPENDENCY') {
          // Resolution internally depends on unknown source, silently abort
          // (it'll leave variable as not resolved)
          variableMeta.sources = sources;
          return;
        }
        // Resolution error, which signals configuration error
        // Mark as not recoverable error and abort.
        delete variableMeta.sources;
        variableMeta.error = error;
        return;
      }
      if (resolvedData.value != null) {
        // Source successfully resolved. Accept as final value
        delete variableMeta.sources;
        variableMeta.value = resolvedData.value;
        return;
      }
      if (resolvedData.isPending) {
        // Source resolved with "null", but is marked as not yet fulfilled
        // (not having all data available at this point)
        // Silently abort (it'll leave variable as not resolved)
        variableMeta.sources = sources;
        return;
      }
      sources.shift();
      const previousSourceData = sourceData;
      sourceData = sources[0];
      if (!sourceData) {
        // Last source reported no value and there's no further fallback, we treat it as an error
        // In further processing ideally it should be surfaced and prevent command from continuing
        delete variableMeta.sources;
        const detailedErrorMessage =
          resolvedData.eventualErrorMessage ||
          `Value not found at "${previousSourceData.type}" source`;
        variableMeta.error = new ServerlessError(
          `Cannot resolve variable at "${humanizePropertyPath(
            propertyPath.split('\0')
          )}": ${detailedErrorMessage}`,
          'MISSING_VARIABLE_RESULT'
        );
        return;
      }
    } while (sourceData.type);
    // Fallback to static value source
    delete variableMeta.sources;
    variableMeta.value = sourceData.value;
  }

  async resolveVariableSource(resolutionBatchId, propertyPath, sourceData) {
    // Resolve variables in source dependencies (params and address) and resolve the source
    if (sourceData.params) {
      // Ensure to have all eventual variables in params resolved
      await Promise.all(
        sourceData.params.map(async (param) => {
          if (!param.variables) return;
          await this.resolveVariables(resolutionBatchId, propertyPath, param);
          await this.resolveInternalResult(resolutionBatchId, propertyPath, param);
        })
      );
    }
    if (sourceData.address && sourceData.address.variables) {
      // Ensure to have all eventual variables in address resolved
      await this.resolveVariables(resolutionBatchId, propertyPath, sourceData.address);
      await this.resolveInternalResult(resolutionBatchId, propertyPath, sourceData.address);
    }
    return JSON.parse(
      JSON.stringify(
        await (async () => {
          try {
            return await this.resolveSource(resolutionBatchId, propertyPath, sourceData);
          } catch (error) {
            if (isError(error)) {
              if (error.code === 'MISSING_VARIABLE_DEPENDENCY') throw error;
              if (
                error.constructor.name === 'ServerlessError' &&
                error.message.startsWith('Cannot resolve variable at ')
              ) {
                throw error;
              }
            }
            let isServerlessError = false;
            const originalErrorMessage = (() => {
              if (!isError(error)) {
                return `Non-error exception: ${util.inspect(error)}`;
              } else if (error.constructor.name === 'ServerlessError') {
                isServerlessError = true;
                return error.message;
              } else if (error.constructor.name === 'VariableSourceResolutionError') {
                return error.message;
              }
              return error.stack;
            })();
            throw new (isServerlessError ? ServerlessError : VariableSourceResolutionError)(
              `Cannot resolve variable at "${humanizePropertyPath(
                propertyPath.split('\0')
              )}": ${originalErrorMessage}`,
              'VARIABLE_RESOLUTION_ERROR'
            );
          }
        })()
      )
    );
  }

  async resolveInternalResult(resolutionBatchId, propertyPath, valueMeta, nestTracker = 10) {
    if (valueMeta.error) throw valueMeta.error;
    if (valueMeta.variables) {
      throw new ServerlessError('Cannot resolve variable', 'MISSING_VARIABLE_DEPENDENCY');
    }
    if (!nestTracker) {
      throw new ServerlessError(
        `Cannot resolve variable at "${humanizePropertyPath(
          propertyPath.split('\0')
        )}": Excessive variables nest depth`,
        'EXCESSIVE_RESOLVED_VARIABLES_NEST_DEPTH'
      );
    }
    if (typeof valueMeta.value === 'string') {
      const valueVariables = (() => {
        try {
          if (valueMeta.sourceValues) return resolveSourceValuesVariables(valueMeta.sourceValues);
          return parse(valueMeta.value);
        } catch (error) {
          error.message = `Cannot resolve variable at "${humanizePropertyPath(
            propertyPath.split('\0')
          )}": Approached variable syntax error in resolved value "${valueMeta.value}": ${
            error.message
          }`;
          delete valueMeta.value;
          valueMeta.error = error;
          throw error;
        }
      })();

      if (!valueVariables) return;
      valueMeta.variables = valueVariables;
      delete valueMeta.sourceValues;
      await this.resolveVariables(resolutionBatchId, propertyPath, valueMeta);
      await this.resolveInternalResult(resolutionBatchId, propertyPath, valueMeta, nestTracker - 1);
      return;
    }
    const valueEntries = (() => {
      if (isPlainObject(valueMeta.value)) return Object.entries(valueMeta.value);
      return Array.isArray(valueMeta.value) ? valueMeta.value.entries() : null;
    })();
    if (!valueEntries) return;
    const propertyVariablesMeta = parseEntries(valueEntries, [], new Map());
    for (const [propertyKeyPath, propertyValueMeta] of propertyVariablesMeta) {
      await this.resolveVariables(resolutionBatchId, propertyPath, propertyValueMeta);
      await this.resolveInternalResult(
        resolutionBatchId,
        propertyPath,
        propertyValueMeta,
        nestTracker - 1
      );
      const propertyKeyPathKeys = propertyKeyPath.split('\0');
      const targetKey = propertyKeyPathKeys[propertyKeyPathKeys.length - 1];
      let targetObject = valueMeta.value;
      for (const parentKey of propertyKeyPathKeys.slice(0, -1)) {
        targetObject = targetObject[parentKey];
      }
      targetObject[targetKey] = propertyValueMeta.value;
    }
  }

  validateCrossPropertyDependency(dependentPropertyPath, dependencyPropertyPath) {
    if (dependentPropertyPath === dependencyPropertyPath) {
      throw new ServerlessError(
        `Circular reference. "${humanizePropertyPath(
          dependentPropertyPath.split('\0')
        )}" refers to itself`,
        'CIRCULAR_PROPERTY_DEPENDENCY'
      );
    }
    const dependencyDependencies = this.propertyDependenciesMap.get(dependencyPropertyPath);
    if (!dependencyDependencies) return;
    if (dependencyDependencies.has(dependentPropertyPath)) {
      throw new ServerlessError(
        `Circular reference among "${humanizePropertyPath(
          dependentPropertyPath.split('\0')
        )}" and "${humanizePropertyPath(dependencyPropertyPath.split('\0'))}" properties`,
        'CIRCULAR_PROPERTY_DEPENDENCY'
      );
    }
    for (const dependencyDependency of dependencyDependencies) {
      this.validateCrossPropertyDependency(dependentPropertyPath, dependencyDependency);
    }
  }
  registerCrossPropertyDependency(dependentPropertyPath, dependencyPropertyPath) {
    this.validateCrossPropertyDependency(dependentPropertyPath, dependencyPropertyPath);
    if (!this.propertyDependenciesMap.has(dependentPropertyPath)) {
      this.propertyDependenciesMap.set(dependentPropertyPath, new Set());
    }
    this.propertyDependenciesMap.get(dependentPropertyPath).add(dependencyPropertyPath);
  }

  async resolveDependentProperty(
    resolutionBatchId,
    dependentPropertyPath,
    dependencyPropertyPathKeys
  ) {
    let value = this.configuration;
    for (const [index, key] of dependencyPropertyPathKeys.entries()) {
      if (value == null) {
        value = undefined;
        break;
      }
      const depPropertyPath = dependencyPropertyPathKeys.slice(0, index + 1).join('\0');
      if (this.variablesMeta.has(depPropertyPath)) {
        this.registerCrossPropertyDependency(dependentPropertyPath, depPropertyPath);
        await this.resolveProperty(resolutionBatchId, depPropertyPath);
      }
      const depValueMeta = this.variablesMeta.get(depPropertyPath);
      if (depValueMeta) {
        if (depValueMeta.error) throw depValueMeta.error;
        throw new ServerlessError('Cannot resolve variable', 'MISSING_VARIABLE_DEPENDENCY');
      }
      value = value[key];
    }
    if (!isObject(value)) return value;
    const depPropertyNestPath = dependencyPropertyPathKeys.length
      ? `${dependencyPropertyPathKeys.join('\0')}\0`
      : '';
    await Promise.all(
      Array.from(this.variablesMeta.keys()).map(async (propertyPath) => {
        if (!propertyPath.startsWith(depPropertyNestPath)) return;
        this.registerCrossPropertyDependency(dependentPropertyPath, propertyPath);
        await this.resolveProperty(resolutionBatchId, propertyPath);
        const valueMeta = this.variablesMeta.get(propertyPath);
        if (!valueMeta) return;
        if (valueMeta.error) throw valueMeta.error;
        throw new ServerlessError('Cannot resolve variable', 'MISSING_VARIABLE_DEPENDENCY');
      })
    );
    return value;
  }
}

Object.defineProperties(
  VariablesResolver.prototype,
  memoizeMethods({
    resolveProperty: d(
      async function self(resolutionBatchId, propertyPath) {
        const valueMeta = this.variablesMeta.get(propertyPath);
        if (!valueMeta.variables) {
          // Lack of `.variables` means that there was an attempt to resolve property in previous pass
          // but it errored.
          // In normal flow, we will not re-attempt variables resolution in such case (so that's a dead path)
          // but for algorithm completeness (and for testing convenience) such scenario is handled here
          return;
        }
        await this.resolveVariables(resolutionBatchId, propertyPath, valueMeta);

        if (valueMeta.variables || valueMeta.error) {
          // Having `.variables` still here, means we could not attempt to resolve the variable
          // (e.g.source resolution methods were not provided, or source is seen as not yet
          // fulfilled and responded with no value for given params/address).
          // In such case resolution can be retried in later turn, after missing data is provided.
          //
          // Having `.error` means, resolution errored (with no recovery plan for it)
          // Such error ideally should be exposed with command crash in resolution consumer logic
          return;
        }

        // Variable(s) for a property where successfully resolved, still it can be an object
        // (or an array) containing a values with variables in it.
        const propertyPathKeys = propertyPath.split('\0');
        const { value, sourceValues } = valueMeta;

        let propertyVariablesMeta;
        if (typeof value === 'string') {
          const valueVariables = (() => {
            try {
              if (sourceValues) return resolveSourceValuesVariables(sourceValues);
              return parse(value);
            } catch (error) {
              error.message = `Cannot resolve variable at "${humanizePropertyPath(
                propertyPathKeys
              )}": Approached variable syntax error in resolved value "${value}": ${error.message}`;
              delete valueMeta.value;
              valueMeta.error = error;
              return null;
            }
          })();

          if (valueVariables) {
            propertyVariablesMeta = new Map([[propertyPath, { value, variables: valueVariables }]]);
          } else if (valueMeta.error) {
            return;
          }
        } else {
          const valueEntries = (() => {
            if (isPlainObject(value)) return Object.entries(value);
            return Array.isArray(value) ? value.entries() : null;
          })();
          if (valueEntries) {
            propertyVariablesMeta = parseEntries(valueEntries, propertyPathKeys, new Map());
          }
        }
        if (propertyVariablesMeta && propertyVariablesMeta.size) {
          // Register variables found in resolved value
          const nestDepth = (this.propertyResolutionNestDepthMap.get(propertyPath) || 0) + 1;
          if (nestDepth > 10) {
            // Found a deep recursion where value that hosts variables, resolves
            // with value that hosts variables etc.
            // It's a likely signal of circular value resolution error. Abort early
            delete valueMeta.value;
            valueMeta.error = new ServerlessError(
              `Cannot resolve variable at "${humanizePropertyPath(
                propertyPathKeys
              )}": Excessive property variables nest depth`,
              'EXCESSIVE_RESOLVED_PROPERTIES_NEST_DEPTH'
            );
            return;
          }
          for (const [subPropertyKeyPath, subPropertyValue] of propertyVariablesMeta) {
            this.propertyResolutionNestDepthMap.set(subPropertyKeyPath, nestDepth);
            this.variablesMeta.set(subPropertyKeyPath, subPropertyValue);
          }
        }

        // Assign resolved value to configuration, and remove variable from variables meta registry
        if (!propertyVariablesMeta || !propertyVariablesMeta.has(propertyPath)) {
          this.variablesMeta.delete(propertyPath);
        }
        const targetKey = propertyPathKeys[propertyPathKeys.length - 1];
        let targetObject = this.configuration;
        for (const parentKey of propertyPathKeys.slice(0, -1)) {
          targetObject = targetObject[parentKey];
        }
        targetObject[targetKey] = value;

        if (!propertyVariablesMeta || !propertyVariablesMeta.size) return;

        if (propertyVariablesMeta.has(propertyPath)) {
          await self.call(this, resolutionBatchId, propertyPath);
          return;
        }

        // Resolve variables found in resolved value
        const newResolutionBatchId = ++lastResolutionBatchId;
        await Promise.all(
          Array.from(propertyVariablesMeta.keys()).map((subPropertyPath) =>
            this.resolveProperty(newResolutionBatchId, subPropertyPath)
          )
        );
      },
      {
        primitive: true,
        /* We're fine with caching rejections here, hence no "promise: true" option */
      }
    ),
    resolveSource: d(
      async function (resolutionBatchId, propertyPath, sourceData) {
        // Resolve value from variables source, and ensure it's a typical JSON value.
        const result = await this.sources[sourceData.type].resolve({
          params: sourceData.params && sourceData.params.map((param) => param.value),
          address: sourceData.address && sourceData.address.value,
          options: this.options,
          isSourceFulfilled: this.fulfilledSources.has(sourceData.type),
          serviceDir: this.serviceDir,
          // TODO: Remove `servicePath` with next major
          servicePath: this.serviceDir,
          resolveConfigurationProperty: async (dependencyPropertyPathKeys) =>
            this.resolveDependentProperty(
              resolutionBatchId,
              propertyPath,
              ensureArray(dependencyPropertyPathKeys, { ensureItem: ensureString })
            ),
          resolveVariable: async (variableString) => {
            variableString = `\${${ensureString(variableString, {
              Error: ServerlessError,
              name: 'variableString',
              errorCode: 'INVALID_VARIABLE_INPUT_TYPE',
            })}}`;
            const variableData = parse(variableString);
            if (!variableData) {
              throw new ServerlessError(
                `Invalid variable value: "${variableString}"`,
                'INVALID_VARIABLE_INPUT'
              );
            }
            const meta = {
              value: variableString,
              variables: variableData,
            };
            await this.resolveVariables(resolutionBatchId, propertyPath, meta);
            await this.resolveInternalResult(resolutionBatchId, propertyPath, meta);
            return meta.value;
          },
          resolveVariablesInString: async (stringValue) => {
            stringValue = ensureString(stringValue, {
              Error: ServerlessError,
              name: 'variableString',
              errorCode: 'INVALID_STRING_INPUT_TYPE',
            });
            const variableData = parse(stringValue);
            if (!variableData) return stringValue;
            const meta = {
              value: stringValue,
              variables: variableData,
            };
            await this.resolveVariables(resolutionBatchId, propertyPath, meta);
            await this.resolveInternalResult(resolutionBatchId, propertyPath, meta);
            return meta.value;
          },
        });
        ensurePlainObject(result, {
          errorMessage: `Unexpected "${sourceData.type}" source result: %v`,
          Error: VariableSourceResolutionError,
          errorCode: 'UNEXPECTED_RESULT',
        });
        if (!objPropertyIsEnumerable.call(result, 'value')) {
          throw new VariableSourceResolutionError(
            `Unexpected "${sourceData.type}" source result: Missing "value" property`,
            'UNEXPECTED_RESULT_VALUE'
          );
        }
        const resultValue = result.value;
        let normalizedResultValue;
        try {
          normalizedResultValue = JSON.parse(JSON.stringify(resultValue));
        } catch (error) {
          throw new VariableSourceResolutionError(
            `Source "${sourceData.type}" returned not supported result: "${util.inspect(
              resultValue
            )}"`,
            'UNSUPPORTED_VARIABLE_RESOLUTION_RESULT'
          );
        }
        if (
          !isPlainObject(resultValue) &&
          !Array.isArray(resultValue) &&
          resultValue !== normalizedResultValue
        ) {
          throw new VariableSourceResolutionError(
            `Source "${sourceData.type}" returned not supported result: "${util.inspect(
              resultValue
            )}"`,
            'UNSUPPORTED_VARIABLE_RESOLUTION_RESULT'
          );
        }
        return result;
      },
      {
        normalizer: ([resolutionBatchId, , { type, params, address }]) => {
          return [
            resolutionBatchId,
            type,
            params && params.map((param) => JSON.stringify(param.value)).join(),
            address == null ? undefined : JSON.stringify(address),
          ].join('\n');
        },
        /* We're fine caching rejections here, hence no "promise: true" option */
      }
    ),
  })
);

module.exports = async (data) => {
  // Input sanity check
  // Note: this function is considered private, if there's a crash here, it signals an internal bug
  data = { ...ensurePlainObject(data) };
  data.serviceDir = path.resolve(ensureString(data.serviceDir));
  ensurePlainObject(data.configuration);
  ensureMap(data.variablesMeta);
  ensurePlainObject(data.sources);
  for (const { resolve } of Object.values(data.sources)) ensurePlainFunction(resolve);
  ensurePlainObject(data.options);
  ensureSet(data.fulfilledSources);
  ensureSet(data.propertyPathsToResolve, { isOptional: true });
  if (data.propertyPathsToResolve) {
    data.propertyPathsToResolve = new Set(Array.from(data.propertyPathsToResolve, ensureString));
  }

  // Note: Below construct returns a promise, and not an actual VariablesResolver instance
  // Class construct is used purely for internal convenience
  // (functions reuse, state management, parallel executions safety)
  return new VariablesResolver(data);
};
