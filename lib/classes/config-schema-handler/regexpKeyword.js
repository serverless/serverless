'use strict';

// Implementation has been heavily inspired by `ajv-keywords` implementation from:
// https://github.com/ajv-validator/ajv-keywords/blob/9656614be0104fe71d229459a5217ccac11958a6/src/definitions/regexp.ts
// Copyright (c) 2016 Evgeny Poberezkin (https://github.com/ajv-validator/ajv-keywords/blob/master/LICENSE)
// The reason for that is the issue with `peerDependencies` of `ajv-keywords`, that causes the project to fail when other
// dependency also relies on different `ajv` version and `npm@6` is used.
// Related issue: https://github.com/ajv-validator/ajv-keywords/issues/170
// After the issue is addressed, or if `npm@6` is no longer supported, this module can be removed
// and we can go back to using `ajv-keywords` directly.

const { _ } = require('ajv/dist/compile/codegen');

const regexpMetaSchema = {
  type: 'object',
  properties: {
    pattern: { type: 'string' },
    flags: { type: 'string', nullable: true },
  },
  required: ['pattern'],
  additionalProperties: false,
};

const metaRegexp = /^\/(.*)\/([gimuy]*)$/;

const usePattern = ({ gen, it: { opts } }, pattern, flags = opts.unicodeRegExp ? 'u' : '') => {
  const rx = new RegExp(pattern, flags);
  return gen.scopeValue('pattern', {
    key: rx.toString(),
    ref: rx,
    code: _`new RegExp(${pattern}, ${flags})`,
  });
};

module.exports = {
  keyword: 'regexp',
  type: 'string',
  schemaType: ['string', 'object'],
  code(cxt) {
    const { data, schema } = cxt;
    const regx = getRegExp(schema);
    cxt.pass(_`${regx}.test(${data})`);

    function getRegExp(sch) {
      if (typeof sch === 'object') return usePattern(cxt, sch.pattern, sch.flags);
      const rx = metaRegexp.exec(sch);
      if (rx) return usePattern(cxt, rx[1], rx[2]);
      throw new Error('cannot parse string into RegExp');
    }
  },
  metaSchema: {
    anyOf: [{ type: 'string' }, regexpMetaSchema],
  },
};
