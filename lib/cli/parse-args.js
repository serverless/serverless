// TODO: Consider publishing as independent package

'use strict';

const ServerlessError = require('../serverless-error');

const paramRe = /^-(?:-(?<fullName>[a-z][A-Za-z0-9:-]+)|(?<aliasNames>[a-z]+))(?:=(?<value>.+)|$)/;
const isParamName = RegExp.prototype.test.bind(paramRe);

module.exports = (
  args,
  { boolean = new Set(), alias = new Map(), string = new Set(), multiple = new Set() }
) => {
  const result = Object.create(null);
  result._ = [];
  for (let i = 0, arg; (arg = args[i]); ++i) {
    if (arg === '--') {
      result._.push(...args.slice(i + 1));
      break;
    }
    const paramMatch = arg.match(paramRe);
    if (!paramMatch) {
      result._.push(arg);
      continue;
    }
    const { fullName, aliasNames, value } = paramMatch.groups;
    const isBoolean = !value && (!args[i + 1] || args[i + 1] === '--' || isParamName(args[i + 1]));

    let paramName;
    if (aliasNames) {
      if (aliasNames.length > 1) {
        if (value) {
          throw new ServerlessError(
            `Unexpected value for "-${aliasNames}"`,
            'UNEXPECTED_CLI_PARAM_VALUE'
          );
        }
        for (const aliasName of aliasNames) {
          paramName = alias.get(aliasName) || aliasName;
          if (result[paramName] != null) {
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
        throw new ServerlessError(`Unexpected boolean "--${paramName}"`, 'MISSING_CLI_PARAM_VALUE');
      }
      if (multiple.has(paramName)) {
        if (!result[paramName]) result[paramName] = [];
        result[paramName].push(value || args[++i]);
        continue;
      }
      if (result[paramName] != null) {
        throw new ServerlessError(
          `Unexpected multiple "--${paramName}"`,
          'UNEXPECTED_CLI_PARAM_MULTIPLE_VALUE'
        );
      }
      result[paramName] = value || args[++i];
      continue;
    }

    if (paramName.startsWith('no-') && (boolean.has(paramName.slice(3)) || isBoolean)) {
      paramName = paramName.slice(3);
      if (value) {
        throw new ServerlessError(
          `Unexpected value for "--${paramName}"`,
          'UNEXPECTED_CLI_PARAM_VALUE'
        );
      }
      if (result[paramName] != null) {
        throw new ServerlessError(
          `Unexpected multiple "--${paramName}"`,
          'UNEXPECTED_CLI_PARAM_MULTIPLE_VALUE'
        );
      }
      result[paramName] = false;
      continue;
    }

    if (boolean.has(paramName) || isBoolean) {
      if (value) {
        throw new ServerlessError(
          `Unexpected value for "--${paramName}"`,
          'UNEXPECTED_CLI_PARAM_VALUE'
        );
      }
      if (result[paramName] != null) {
        throw new ServerlessError(
          `Unexpected multiple "--${paramName}"`,
          'UNEXPECTED_CLI_PARAM_MULTIPLE_VALUE'
        );
      }
      result[paramName] = true;
      continue;
    }

    if (result[paramName] != null) {
      if (Array.isArray(result[paramName])) {
        result[paramName].push(value || args[++i]);
      } else if (typeof result[paramName] === 'string') {
        result[paramName] = [result[paramName], value || args[++i]];
      } else {
        throw new ServerlessError(
          `Unexpected multiple "--${paramName}"`,
          'UNEXPECTED_CLI_PARAM_MULTIPLE_VALUE'
        );
      }
      continue;
    }
    result[paramName] = value || args[++i];
  }

  return result;
};
