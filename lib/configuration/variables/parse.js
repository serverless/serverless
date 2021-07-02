// Variables syntax parser, for a string input returns AST-like meta object

'use strict';

const ServerlessError = require('../../serverless-error');

const alphaChars = new Set('abcdefghijklmnopqrstuvwxyz');
const alphaNumericChars = new Set(
  'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.-'
);
const isType = RegExp.prototype.test.bind(/^[a-z][a-zA-Z0-9]*$/);

let value;
let index;
let char;

let state;
let stringContext;
let variables;
let sources;
let contexts;
let currentSource;

let contextStart;
let contextVariables;
let escapeVarStart;
let variableStart;
let sourceStart;
let paramStart;
let addressStart;

const finalizeSource = () => {
  if (!sources) sources = [];
  sources.push(currentSource);
  currentSource = null;
  state = 'maybeNextSourceStart';
};

const finalizeVariable = () => {
  finalizeSource();
  if (!variables) variables = [];
  variables.push({ start: variableStart - contextStart, end: index + 1 - contextStart, sources });
  sources = null;
  releaseContext();
};

const registerVarEscape = () => {
  if (!variables) variables = [];
  variables.push({
    start: escapeVarStart - contextStart,
    end: index - contextStart,
    value: '\\'.repeat(Math.ceil((index - 1 - escapeVarStart - 1) / 2)) + value[index - 1],
  });
  escapeVarStart = null;
};

const registerSlashEscape = () => {
  if (!variables) variables = [];
  variables.push({
    start: escapeVarStart - contextStart,
    end: index - 1 - contextStart,
    value: '\\'.repeat(Math.ceil((index - 1 - escapeVarStart - 1) / 2)),
  });
  escapeVarStart = null;
};

const registerContext = (newContextStart = contextStart) => {
  if (!contexts) contexts = [];
  if (!variables) variables = [];
  if (newContextStart && !contextVariables) contextVariables = [];
  contexts.push({
    state,
    variableStart,
    contextStart,
    variables,
    contextVariables,
    currentSource,
    sources,
  });

  state = 'maybeVariableOpen';
  variableStart = index;
  sources = null;
  if (newContextStart) {
    contextStart = newContextStart;
    variables = contextVariables;
  }
};

const releaseContext = () => {
  const context = contexts && contexts.pop();
  if (!context) {
    state = 'out';
    return;
  }
  if (!contexts.length) contexts = null;
  ({ state, variableStart, variables, contextVariables, currentSource, sources } = context);
  if (state === 'param') paramStart = contextStart;
  if (state === 'address') addressStart = contextStart;
  ({ contextStart } = context);
};

const normalizeMetaVariables = (metaValue, metaVariables) => {
  switch (metaVariables.length) {
    case 0:
      return null;
    case 1: {
      const [variable] = metaVariables;
      if (!variable.start && variable.end === metaValue.length) {
        delete variable.start;
        delete variable.end;
      }
    }
    // fallthrough
    default:
      return metaVariables;
  }
};

const generateMeta = (metaValue, metaVariables) => {
  const meta = { value: metaValue || null };
  if (!metaVariables || !metaVariables.length) return meta;
  meta.variables = normalizeMetaVariables(metaValue, metaVariables);
  return meta;
};

const parseString = (start) => {
  if (value[start] === "'") return value.slice(start, index).trim().slice(1, -1);
  try {
    return JSON.parse(value.slice(start, index));
  } catch (error) {
    throw new ServerlessError(
      `Invalid string literal at index ${start} in "${value}": ${error.message}`,
      'INVALID_VARIABLE_STRING_LITERAL'
    );
  }
};

const parseLiteralSource = (literal, shouldFallbackToInput = false) => {
  switch (literal) {
    case 'true':
      return true;
    case 'false':
      return false;
    case 'null':
      return null;
    default: {
      const numberValue = Number(literal);
      if (!isNaN(literal)) return numberValue;
      if (shouldFallbackToInput) return literal;
      throw new ServerlessError(
        `Invalid literal source "${literal}" at index ${sourceStart} in "${value}"`,
        'INVALID_VARIABLE_LITERAL_SOURCE'
      );
    }
  }
};

module.exports = (inputValue) => {
  // State machine design pattern
  try {
    value = inputValue;
    state = 'out';
    contextStart = 0;
    contextVariables = null;

    for (index = 0; (char = value[index]); ++index) {
      switch (state) {
        case 'out':
          if (char === '\\') {
            if (escapeVarStart == null) escapeVarStart = index;
            state = 'escapeVar';
          } else if (char === '$') {
            variableStart = index;
            state = 'maybeVariableOpen';
          } else {
            escapeVarStart = null;
          }
          break;
        case 'escapeVar':
          if (char === '$') {
            state = 'escapeVarDollar';
          } else {
            if (char !== '\\') escapeVarStart = null;
            state = 'out';
          }
          break;
        case 'escapeVarDollar':
          if (char === '{') {
            registerVarEscape();
            state = 'out';
          } else {
            escapeVarStart = null;
            if (char === '\\') {
              escapeVarStart = index;
              state = 'escapeVar';
            } else if (char === '$') {
              variableStart = index;
              state = 'maybeVariableOpen';
            } else {
              state = 'out';
            }
          }
          break;
        case 'maybeVariableOpen':
          if (char === '{') {
            if (escapeVarStart != null) registerSlashEscape();
            state = 'maybeTypeStart';
          } else {
            escapeVarStart = null;
            if (char !== '$') releaseContext();
          }
          break;
        case 'maybeTypeStart':
          if (alphaChars.has(char)) {
            sourceStart = index;
            state = 'maybeType';
          } else if (contexts && contexts.some((context) => context.state !== 'foreign')) {
            throw new ServerlessError(
              `Invalid variable type at index ${index} in "${value}"`,
              'INVALID_VARIABLE_TYPE'
            );
          } else if (char === '}') {
            releaseContext();
          } else {
            state = 'foreign';
            if (char === '$') registerContext();
          }
          break;
        case 'maybeNextSourceStart':
          if (char === ' ') continue;
          sourceStart = index;
          if (alphaNumericChars.has(char)) {
            state = 'typeOrSourceLiteral';
          } else if (char === '"') {
            stringContext = 'afterSourceLiteralString';
            state = 'doubleQuotedString';
          } else if (char === "'") {
            stringContext = 'afterSourceLiteralString';
            state = 'singleQuotedString';
          } else {
            throw new ServerlessError(
              `Invalid variable source at index ${index} in "${value}"`,
              'INVALID_VARIABLE_SOURCE'
            );
          }
          break;
        case 'maybeType':
          if (char === ':') {
            currentSource = { type: value.slice(sourceStart, index) };
            state = 'maybeAddressStart';
          } else if (char === '(') {
            currentSource = { type: value.slice(sourceStart, index), params: [] };
            state = 'paramStart';
          } else if (!alphaNumericChars.has(char)) {
            if (contexts && contexts.some((context) => context.state !== 'foreign')) {
              throw new ServerlessError(
                `Invalid variable type at index ${sourceStart} in "${value}"`,
                'INVALID_VARIABLE_TYPE'
              );
            }
            if (char === '}') {
              releaseContext();
            } else {
              state = 'foreign';
              if (char === '$') registerContext();
            }
          }
          break;
        case 'typeOrSourceLiteral':
          if (char === ' ') continue;
          if (char === ':') {
            const type = value.slice(sourceStart, index);
            if (!isType(type)) {
              throw new ServerlessError(
                `Invalid variable source at index ${sourceStart} in "${value}"`,
                'INVALID_VARIABLE_SOURCE'
              );
            }
            currentSource = { type };
            state = 'maybeAddressStart';
          } else if (char === '(') {
            const type = value.slice(sourceStart, index);
            if (!isType(type)) {
              throw new ServerlessError(
                `Invalid variable source at index ${sourceStart} in "${value}"`,
                'INVALID_VARIABLE_SOURCE'
              );
            }
            currentSource = { type, params: [] };
            state = 'paramStart';
          } else if (char === '}') {
            currentSource = { value: parseLiteralSource(value.slice(sourceStart, index).trim()) };
            finalizeVariable();
          } else if (!alphaNumericChars.has(char)) {
            throw new ServerlessError(
              `Invalid variable source at index ${sourceStart} in "${value}"`,
              'INVALID_VARIABLE_SOURCE'
            );
          }
          break;
        case 'paramStart':
          if (char === ' ') continue;
          if (char === ')') {
            state = 'maybeAddressOpen';
          } else if (char === ',') {
            currentSource.params.push({ value: null });
          } else if (char === '}') {
            throw new ServerlessError(
              `Invalid variable param at index ${index} in "${value}"`,
              'INVALID_VARIABLE_PARAM'
            );
          } else {
            paramStart = index;
            if (char === '"') {
              stringContext = 'afterParamString';
              state = 'doubleQuotedString';
            } else if (char === "'") {
              stringContext = 'afterParamString';
              state = 'singleQuotedString';
            } else {
              state = 'param';
              contextVariables = null;
              if (char === '$') registerContext(paramStart);
            }
          }
          break;
        case 'param':
          if (char === ')') {
            let paramValue = value.slice(paramStart, index).trim();
            if (paramValue) {
              if (!contextVariables) paramValue = parseLiteralSource(paramValue, true);
              currentSource.params.push(generateMeta(paramValue, contextVariables));
            }
            state = 'maybeAddressOpen';
          } else if (char === ',') {
            let paramValue = value.slice(paramStart, index).trim();
            if (!contextVariables) paramValue = parseLiteralSource(paramValue, true);
            currentSource.params.push(generateMeta(paramValue, contextVariables));
            state = 'paramStart';
          } else if (char === '}') {
            throw new ServerlessError(
              `Invalid variable param at index ${paramStart} in "${value}"`,
              'INVALID_VARIABLE_PARAM'
            );
          } else if (char === '$') {
            registerContext(paramStart);
          }
          break;
        case 'afterParamString':
          if (char === ' ') continue;
          if (char === ')') {
            currentSource.params.push({ value: parseString(paramStart) });
            state = 'maybeAddressOpen';
          } else if (char === ',') {
            currentSource.params.push({ value: parseString(paramStart) });
            state = 'paramStart';
          } else {
            throw new ServerlessError(
              `Invalid variable param at index ${paramStart} in "${value}"`,
              'INVALID_VARIABLE_PARAM'
            );
          }
          break;
        case 'maybeAddressOpen':
          if (char === ' ') continue;
          if (char === ':') {
            state = 'maybeAddressStart';
          } else if (char === '}') {
            finalizeVariable();
          } else if (char === ',') {
            finalizeSource();
          } else {
            throw new ServerlessError(
              `Invalid variable address at index ${index} in "${value}"`,
              'INVALID_VARIABLE_ADDRESS'
            );
          }
          break;
        case 'maybeAddressStart':
          if (char === ' ') continue;
          if (char === '}') {
            finalizeVariable();
          } else if (char === ',') {
            finalizeSource();
          } else {
            addressStart = index;
            if (char === ':') {
              if (
                !currentSource.params &&
                (!contexts || contexts.every((context) => context.state === 'foreign'))
              ) {
                currentSource = null;
                state = 'foreign';
              } else {
                throw new ServerlessError(
                  `Invalid variable address at index ${addressStart} in "${value}"`,
                  'INVALID_VARIABLE_ADDRESS'
                );
              }
            } else if (char === '"') {
              stringContext = 'afterAddressString';
              state = 'doubleQuotedString';
            } else if (char === "'") {
              stringContext = 'afterAddressString';
              state = 'singleQuotedString';
            } else {
              state = 'address';
              contextVariables = null;
              if (char === '$') registerContext(addressStart);
            }
          }
          break;
        case 'address':
          if (char === '}') {
            currentSource.address = generateMeta(
              value.slice(addressStart, index).trim(),
              contextVariables
            );
            finalizeVariable();
          } else if (char === '$') {
            registerContext(addressStart);
          } else if (char === ',') {
            currentSource.address = generateMeta(
              value.slice(addressStart, index).trim(),
              contextVariables
            );
            finalizeSource();
          } else if (char === ':') {
            throw new ServerlessError(
              `Invalid variable address at index ${sourceStart} in "${value}"`,
              'INVALID_VARIABLE_ADDRESS'
            );
          }
          break;
        case 'afterAddressString':
          if (char === ' ') continue;
          if (char === '}') {
            currentSource.address = { value: parseString(addressStart) };
            finalizeVariable();
          } else if (char === ',') {
            currentSource.address = { value: parseString(addressStart) };
            finalizeSource();
          } else {
            throw new ServerlessError(
              `Invalid variable address at index ${addressStart} in "${value}"`,
              'INVALID_VARIABLE_ADDRESS'
            );
          }
          break;
        case 'afterSourceLiteralString':
          if (char === ' ') continue;
          if (char === '}') {
            currentSource = { value: parseString(sourceStart) };
            finalizeVariable();
          } else {
            throw new ServerlessError(
              `Invalid variable source at index ${sourceStart} in "${value}"`,
              'INVALID_VARIABLE_SOURCE'
            );
          }
          break;
        case 'foreign':
          if (char === '}') {
            releaseContext();
          } else if (char === '$') {
            registerContext();
          }
          break;
        case 'escapeString':
          state = 'doubleQuotedString';
          break;
        case 'doubleQuotedString':
          if (char === '"') {
            state = stringContext;
          } else if (char === '\\') {
            state = 'escapeString';
          }
          break;
        case 'singleQuotedString':
          if (char === "'") state = stringContext;
          break;
        /* istanbul ignore next */
        default:
          throw new Error(`Unexpected state ${state}`);
      }
    }

    if (currentSource || sources) {
      throw new ServerlessError(
        `Missing variable closing bracket in ${value}`,
        'UNTERMINATED_VARIABLE'
      );
    }

    if (!variables) return null;
    return normalizeMetaVariables(value, variables);
  } finally {
    escapeVarStart = null;
    variables = null;
    sources = null;
    contexts = null;
    currentSource = null;
  }
};
