// TODO: Consider publishing as independent package

'use strict';

const ServerlessError = require('../serverless-error');
const paramRegExp = require('./param-reg-exp');

const isParamName = RegExp.prototype.test.bind(paramRegExp);

module.exports = (
  args,
  { boolean = new Set(), alias = new Map(), string = new Set(), multiple = new Set() }
) => {
  const result = Object.create(null);
  result._ = [];
  const isHelpRequest = args.includes('-h') || args.includes('--help');
  for (let i = 0, arg; (arg = args[i]); ++i) {
    if (arg === '--') {
      result._.push(...args.slice(i + 1));
      break;
    }
    const paramMatch = arg.match(paramRegExp);
    if (!paramMatch) {
      result._.push(arg);
      continue;
    }
    const { fullName, aliasNames, value } = paramMatch.groups;
    const isBoolean =
      value == null && (!args[i + 1] || args[i + 1] === '--' || isParamName(args[i + 1]));

    let paramName;
    if (aliasNames) {
      if (aliasNames.length > 1) {
        if (value != null) {
          if (isHelpRequest) return result;
          throw new ServerlessError(
            `Unexpected value for "-${aliasNames}"`,
            'UNEXPECTED_CLI_PARAM_VALUE'
          );
        }
        for (const aliasName of aliasNames) {
          paramName = alias.get(aliasName) || aliasName;
          if (result[paramName] != null) {
            if (isHelpRequest) return result;
            throw new ServerlessError(
              `Unexpected multiple "--${paramName}" (aliased by "-${aliasName}") values`,
              'UNEXPECTED_CLI_PARAM_MULTIPLE_VALUE'
            );
          }
          result[paramName] = true;
        }
        continue;
      }
      paramName = alias.get(aliasNames[0]) || aliasNames[0];
    } else {
      paramName = fullName;
    }

    if (string.has(paramName) || multiple.has(paramName)) {
      if (isBoolean) {
        if (isHelpRequest) return result;
        throw new ServerlessError(`Unexpected boolean "--${paramName}"`, 'MISSING_CLI_PARAM_VALUE');
      }
      if (multiple.has(paramName)) {
        if (!result[paramName]) result[paramName] = [];
        result[paramName].push(value == null ? args[++i] : value || null);
        continue;
      }
      if (result[paramName] !== undefined) {
        if (isHelpRequest) return result;
        throw new ServerlessError(
          `Unexpected multiple "--${paramName}"`,
          'UNEXPECTED_CLI_PARAM_MULTIPLE_VALUE'
        );
      }
      result[paramName] = value == null ? args[++i] : value || null;
      continue;
    }

    if (paramName.startsWith('no-') && (boolean.has(paramName.slice(3)) || isBoolean)) {
      paramName = paramName.slice(3);
      if (value != null) {
        if (isHelpRequest) return result;
        throw new ServerlessError(
          `Unexpected value for "--${paramName}"`,
          'UNEXPECTED_CLI_PARAM_VALUE'
        );
      }
      if (result[paramName] !== undefined) {
        if (isHelpRequest) return result;
        throw new ServerlessError(
          `Unexpected multiple "--${paramName}"`,
          'UNEXPECTED_CLI_PARAM_MULTIPLE_VALUE'
        );
      }
      result[paramName] = false;
      continue;
    }

    if (boolean.has(paramName) || isBoolean) {
      if (value != null) {
        if (isHelpRequest) return result;
        throw new ServerlessError(
          `Unexpected value for "--${paramName}"`,
          'UNEXPECTED_CLI_PARAM_VALUE'
        );
      }
      if (result[paramName] !== undefined) {
        if (isHelpRequest) return result;
        throw new ServerlessError(
          `Unexpected multiple "--${paramName}"`,
          'UNEXPECTED_CLI_PARAM_MULTIPLE_VALUE'
        );
      }
      result[paramName] = true;
      continue;
    }

    if (result[paramName] !== undefined) {
      if (Array.isArray(result[paramName])) {
        result[paramName].push(value == null ? args[++i] : value || null);
      } else if (typeof result[paramName] === 'boolean') {
        if (isHelpRequest) return result;
        throw new ServerlessError(
          `Unexpected multiple "--${paramName}"`,
          'UNEXPECTED_CLI_PARAM_MULTIPLE_VALUE'
        );
      } else {
        result[paramName] = [result[paramName], value == null ? args[++i] : value || null];
      }
      continue;
    }
    result[paramName] = value == null ? args[++i] : value || null;
  }

  return result;
};
