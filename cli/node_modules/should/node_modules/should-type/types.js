var types = {
  NUMBER: 'number',
  UNDEFINED: 'undefined',
  STRING: 'string',
  BOOLEAN: 'boolean',
  OBJECT: 'object',
  FUNCTION: 'function',
  NULL: 'null',
  ARRAY: 'array',
  REGEXP: 'regexp',
  DATE: 'date',
  ERROR: 'error',
  ARGUMENTS: 'arguments',
  SYMBOL: 'symbol',
  ARRAY_BUFFER: 'array-buffer',
  TYPED_ARRAY: 'typed-array',
  DATA_VIEW: 'data-view',
  MAP: 'map',
  SET: 'set',
  WEAK_SET: 'weak-set',
  WEAK_MAP: 'weak-map',
  PROMISE: 'promise',

// node buffer
  BUFFER: 'buffer',

// dom html element
  HTML_ELEMENT: 'html-element',
  HTML_ELEMENT_TEXT: 'html-element-text',
  DOCUMENT: 'document',
  WINDOW: 'window',
  FILE: 'file',
  FILE_LIST: 'file-list',
  BLOB: 'blob',

  HOST: 'host',

  XHR: 'xhr'
};

module.exports = types;
