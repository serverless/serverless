'use strict';

const { expect } = require('chai');

const ServerlessError = require('../../../../../lib/serverless-error');
const parse = require('../../../../../lib/configuration/variables/parse');

describe('test/unit/lib/configuration/variables/parse.test.js', () => {
  describe('Valid', () => {
    it('should support partially variable value at begin of a string', () =>
      expect(parse('${type:address}foo')).to.deep.equal([
        { start: 0, end: 15, sources: [{ type: 'type', address: { value: 'address' } }] },
      ]));

    it('should support partially variable value at end of a string', () =>
      expect(parse('foo${type:address}')).to.deep.equal([
        { start: 3, end: 18, sources: [{ type: 'type', address: { value: 'address' } }] },
      ]));

    it('should support partially variable value in a middle of a string', () =>
      expect(parse('foo${type:address}bar')).to.deep.equal([
        { start: 3, end: 18, sources: [{ type: 'type', address: { value: 'address' } }] },
      ]));

    // ${type:}
    it('should support type only notation', () =>
      expect(parse('${type:}')).to.deep.equal([{ sources: [{ type: 'type' }] }]));

    // ${type:address}
    it('should support type and address', () =>
      expect(parse('${type:address}')).to.deep.equal([
        { sources: [{ type: 'type', address: { value: 'address' } }] },
      ]));

    // ${type:address:with:colons}
    it('should support type and address with colons', () =>
      expect(parse('${type:address:with:colons}')).to.deep.equal([
        { sources: [{ type: 'type', address: { value: 'address:with:colons' } }] },
      ]));

    // ${type(param)}
    it('should support param', () =>
      expect(parse('${type(param)}')).to.deep.equal([
        { sources: [{ type: 'type', params: [{ value: 'param' }] }] },
      ]));

    // ${type(param1, param2)}
    it('should support multiple params', () =>
      expect(parse('${type(param1, param2)}')).to.deep.equal([
        { sources: [{ type: 'type', params: [{ value: 'param1' }, { value: 'param2' }] }] },
      ]));

    // ${type(param1, ",},${\"param2", param3)}
    it('should support double quoted params', () =>
      expect(parse('${type(param1, ",},${\\"param2", param3)}')).to.deep.equal([
        {
          sources: [
            {
              type: 'type',
              params: [{ value: 'param1' }, { value: ',},${"param2' }, { value: 'param3' }],
            },
          ],
        },
      ]));

    // ${type(param1, ',},${\'param2' )}
    it('should support single quoted params', () =>
      expect(parse("${type(param1, ',},${param2' )}")).to.deep.equal([
        {
          sources: [
            {
              type: 'type',
              params: [{ value: 'param1' }, { value: ',},${param2' }],
            },
          ],
        },
      ]));

    // ${type(param1, 232, param3)}
    it('should support number params', () =>
      expect(parse('${type(param1, 232, param3)}')).to.deep.equal([
        {
          sources: [
            {
              type: 'type',
              params: [{ value: 'param1' }, { value: 232 }, { value: 'param3' }],
            },
          ],
        },
      ]));

    // ${type(param1, true, param3)}
    it('should support boolean params', () =>
      expect(parse('${type(param1, true, param3)}')).to.deep.equal([
        {
          sources: [
            {
              type: 'type',
              params: [{ value: 'param1' }, { value: true }, { value: 'param3' }],
            },
          ],
        },
      ]));

    // ${type(param1, null, param3) }
    it('should support null params', () =>
      expect(parse('${type(param1, null, param3) }')).to.deep.equal([
        {
          sources: [
            {
              type: 'type',
              params: [{ value: 'param1' }, { value: null }, { value: 'param3' }],
            },
          ],
        },
      ]));

    // ${type(param):address}
    it('should support param and address', () =>
      expect(parse('${type(param):address}')).to.deep.equal([
        {
          sources: [{ type: 'type', params: [{ value: 'param' }], address: { value: 'address' } }],
        },
      ]));

    // ${type(param):",},${\"address"}
    it('should support quoted address', () =>
      expect(parse('${type(param):",},${\\"address"}')).to.deep.equal([
        {
          sources: [
            { type: 'type', params: [{ value: 'param' }], address: { value: ',},${"address' } },
          ],
        },
      ]));

    // ${type(param):'}$address' }
    it('should support single quoted address', () =>
      expect(parse("${type(param):'}$address' }")).to.deep.equal([
        {
          sources: [
            { type: 'type', params: [{ value: 'param' }], address: { value: '}$address' } },
          ],
        },
      ]));

    // ${type1(param1), type2(param2):address2, type3:, type4:address4}
    it('should support fallback sources', () =>
      expect(
        parse('${type1(param1), type2(param2):"address2", type3:, type4:address4}')
      ).to.deep.equal([
        {
          sources: [
            { type: 'type1', params: [{ value: 'param1' }] },
            { type: 'type2', params: [{ value: 'param2' }], address: { value: 'address2' } },
            { type: 'type3' },
            { type: 'type4', address: { value: 'address4' } },
          ],
        },
      ]));

    // ${type(param), "foo, bar"}
    it('should support double quoted string as fallback source', () =>
      expect(parse('${type(param), "foo, bar"}')).to.deep.equal([
        {
          sources: [{ type: 'type', params: [{ value: 'param' }] }, { value: 'foo, bar' }],
        },
      ]));

    // ${type(param), 'foo, bar' }
    it('should support single quoted string as fallback source', () => {
      expect(parse("${type(param), 'foo, bar' }")).to.deep.equal([
        {
          sources: [{ type: 'type', params: [{ value: 'param' }] }, { value: 'foo, bar' }],
        },
      ]);
    });

    // ${type(param), 232}
    it('should support number as a fallback source', () =>
      expect(parse('${type(param), 232}')).to.deep.equal([
        {
          sources: [{ type: 'type', params: [{ value: 'param' }] }, { value: 232 }],
        },
      ]));

    // ${type(param), true}
    it('should support bolean "true" as a fallback source', () =>
      expect(parse('${type(param), true}')).to.deep.equal([
        {
          sources: [{ type: 'type', params: [{ value: 'param' }] }, { value: true }],
        },
      ]));

    // ${type(param), false }
    it('should support bolean "false" as a fallback source', () =>
      expect(parse('${type(param), false }')).to.deep.equal([
        {
          sources: [{ type: 'type', params: [{ value: 'param' }] }, { value: false }],
        },
      ]));

    // ${type(param), null}
    it('should support null as a fallback source', () =>
      expect(parse('${type(param), null}')).to.deep.equal([
        {
          sources: [{ type: 'type', params: [{ value: 'param' }] }, { value: null }],
        },
      ]));

    // ${type()}
    it('should support empty parens', () =>
      expect(parse('${type()}')).to.deep.equal([
        {
          sources: [{ type: 'type', params: [] }],
        },
      ]));

    // ${type(\t)}
    it('should ignore any whitespace between brackets', () =>
      expect(parse('${type(\t)}')).to.deep.equal([{ sources: [{ type: 'type', params: [] }] }]));

    // ${type(,,)}
    it('should support skipping arguments', () =>
      expect(parse('${type(,,)}')).to.deep.equal([
        {
          sources: [{ type: 'type', params: [{ value: null }, { value: null }] }],
        },
      ]));

    // ${type(${innerType(innerParam, ${deep:}):innerAddress}, foo${bar:}): address}
    it('should support variables in params', () =>
      expect(
        parse('${type(${innerType(innerParam, ${deep:}):innerAddress}, foo${bar:}): address}')
      ).to.deep.equal([
        {
          sources: [
            {
              type: 'type',
              params: [
                {
                  value: '${innerType(innerParam, ${deep:}):innerAddress}',
                  variables: [
                    {
                      sources: [
                        {
                          type: 'innerType',
                          params: [
                            { value: 'innerParam' },
                            { value: '${deep:}', variables: [{ sources: [{ type: 'deep' }] }] },
                          ],
                          address: { value: 'innerAddress' },
                        },
                      ],
                    },
                  ],
                },
                {
                  value: 'foo${bar:}',
                  variables: [
                    {
                      start: 3,
                      end: 10,
                      sources: [{ type: 'bar' }],
                    },
                  ],
                },
              ],
              address: { value: 'address' },
            },
          ],
        },
      ]));

    // ${type(params):${innerType(innerParam):innerAddress}}
    // ${type(param):foo${innerType(innerParam)}}
    it('should support variables in address', () => {
      expect(parse('${type(param):${innerType(innerParam):innerAddress}}')).to.deep.equal([
        {
          sources: [
            {
              type: 'type',
              params: [{ value: 'param' }],
              address: {
                value: '${innerType(innerParam):innerAddress}',
                variables: [
                  {
                    sources: [
                      {
                        type: 'innerType',
                        params: [{ value: 'innerParam' }],
                        address: { value: 'innerAddress' },
                      },
                    ],
                  },
                ],
              },
            },
          ],
        },
      ]);
      expect(parse('${type(param):foo${innerType(innerParam)}}')).to.deep.equal([
        {
          sources: [
            {
              type: 'type',
              params: [{ value: 'param' }],
              address: {
                value: 'foo${innerType(innerParam)}',
                variables: [
                  {
                    start: 3,
                    end: 27,
                    sources: [
                      {
                        type: 'innerType',
                        params: [{ value: 'innerParam' }],
                      },
                    ],
                  },
                ],
              },
            },
          ],
        },
      ]);
    });

    // ${type.dot(param)}
    it('should support dots in type notation', () =>
      expect(parse('${type.dot(param)}')).to.deep.equal([
        { sources: [{ type: 'type.dot', params: [{ value: 'param' }] }] },
      ]));

    // ${type.us-east-1(param)}
    it('should support hyphens in type notation', () =>
      expect(parse('${type.us-east-1(param)}')).to.deep.equal([
        { sources: [{ type: 'type.us-east-1', params: [{ value: 'param' }] }] },
      ]));

    // ${AWS::${type:address}}
    it('should support variable nested in foreign variable', () =>
      expect(parse('${AWS::${type:address}}')).to.deep.equal([
        { start: 7, end: 22, sources: [{ type: 'type', address: { value: 'address' } }] },
      ]));

    // ${sourceDirect:}elo${sourceIncomplete:}
    it('should support multiple variables in a value', () =>
      expect(parse('${type1:}elo${type2:}')).to.deep.equal([
        { start: 0, end: 9, sources: [{ type: 'type1' }] },
        { start: 12, end: 21, sources: [{ type: 'type2' }] },
      ]));

    // ${s:${s:}, 1}
    // https://github.com/serverless/serverless/issues/8999
    it("should recognize variables in address, if it's followed by source", () =>
      expect(parse('${s:${s:}, 1}')).to.deep.equal([
        {
          sources: [
            {
              type: 's',
              address: {
                value: '${s:}',
                variables: [{ sources: [{ type: 's' }] }],
              },
            },
            { value: 1 },
          ],
        },
      ]));

    // ${s:, s:${s:}}
    // https://github.com/serverless/serverless/issues/9010
    it('should resolve nested sources, when at least one parent source was resolved', () =>
      expect(parse('${s:, s:${s:}}')).to.deep.equal([
        {
          sources: [
            { type: 's' },
            {
              type: 's',
              address: {
                value: '${s:}',
                variables: [{ sources: [{ type: 's' }] }],
              },
            },
          ],
        },
      ]));
  });

  describe('Invalid', () => {
    // ${type(${invalid.notation}):address}
    it('should reject invalid configuration in params', () =>
      expect(() => parse('${type(${invalid.notation}):address}'))
        .to.throw(ServerlessError)
        .with.property('code', 'INVALID_VARIABLE_TYPE'));

    // ${type(params):${innerType(innerParam):${sdfs.fefef}
    it('should reject invalid configuration in address', () =>
      expect(() => parse('${type(params):${innerType(innerParam):${sdfs.fefef}'))
        .to.throw(ServerlessError)
        .with.property('code', 'INVALID_VARIABLE_TYPE'));

    // ${type:address
    it('should detect not closed variable', () => {
      expect(() => parse('${type:address'))
        .to.throw(ServerlessError)
        .with.property('code', 'UNTERMINATED_VARIABLE');
      expect(() => parse('${type(foo)'))
        .to.throw(ServerlessError)
        .with.property('code', 'UNTERMINATED_VARIABLE');
      expect(() => parse('${s:, s:${s:}'))
        .to.throw(ServerlessError)
        .with.property('code', 'UNTERMINATED_VARIABLE');
      expect(() => parse('${s:, s:${s:'))
        .to.throw(ServerlessError)
        .with.property('code', 'UNTERMINATED_VARIABLE');
    });

    // ${type("\u")}
    it('should reject invalid string literal', () =>
      expect(() => parse('${type("\\u")}'))
        .to.throw(ServerlessError)
        .with.property('code', 'INVALID_VARIABLE_STRING_LITERAL'));

    // '${type:foo, elo}
    it('should reject invalid source literal', () =>
      expect(() => parse('${type:foo, elo}'))
        .to.throw(ServerlessError)
        .with.property('code', 'INVALID_VARIABLE_LITERAL_SOURCE'));

    // ${type('foo')bar}
    it('should reject missing colon for address', () =>
      expect(() => parse("${type('foo')bar}"))
        .to.throw(ServerlessError)
        .with.property('code', 'INVALID_VARIABLE_ADDRESS'));

    // ${type:"address"marko}
    it('should reject invalid address configuration', () =>
      expect(() => parse('${type:"address"marko}'))
        .to.throw(ServerlessError)
        .with.property('code', 'INVALID_VARIABLE_ADDRESS'));

    // ${type:foo, ---}
    // ${type:foo, 000:}
    // ${type:foo, 000()}
    // ${type:foo, aa--}
    it('should reject invalid following source', () => {
      expect(() => parse('${type:foo, ___}'))
        .to.throw(ServerlessError)
        .with.property('code', 'INVALID_VARIABLE_SOURCE');

      expect(() => parse('${type:foo, --}'))
        .to.throw(ServerlessError)
        .with.property('code', 'INVALID_VARIABLE_LITERAL_SOURCE');

      expect(() => parse('${type:foo, 000:}'))
        .to.throw(ServerlessError)
        .with.property('code', 'INVALID_VARIABLE_SOURCE');

      expect(() => parse('${type:foo, 000()}'))
        .to.throw(ServerlessError)
        .with.property('code', 'INVALID_VARIABLE_SOURCE');

      expect(() => parse('${type:foo, aa--}'))
        .to.throw(ServerlessError)
        .with.property('code', 'INVALID_VARIABLE_LITERAL_SOURCE');

      expect(() => parse('${type:foo, aa__}'))
        .to.throw(ServerlessError)
        .with.property('code', 'INVALID_VARIABLE_SOURCE');

      expect(() => parse('${type:foo,"dev",20}'))
        .to.throw(ServerlessError)
        .with.property('code', 'INVALID_VARIABLE_SOURCE');
    });

    // ${type(${AWS::Region})}
    // ${type(${foo::Region})}
    it('should reject nested foreign variables', () => {
      expect(() => parse('${type(${AWS::Region})}'))
        .to.throw(ServerlessError)
        .with.property('code', 'INVALID_VARIABLE_TYPE');

      expect(() => parse('${type(${foo::Region})}'))
        .to.throw(ServerlessError)
        .with.property('code', 'INVALID_VARIABLE_ADDRESS');
    });

    // ${type(foo})
    // ${type(foo,})
    it('should reject closing bracket at unexpected location', () => {
      expect(() => parse('${type(foo})'))
        .to.throw(ServerlessError)
        .with.property('code', 'INVALID_VARIABLE_PARAM');
      expect(() => parse('${type(foo,})'))
        .to.throw(ServerlessError)
        .with.property('code', 'INVALID_VARIABLE_PARAM');
    });

    // ${type('foo'bar)}
    it('should reject unexpected content after param string', () =>
      expect(() => parse("${type('foo'bar)}"))
        .to.throw(ServerlessError)
        .with.property('code', 'INVALID_VARIABLE_PARAM'));
  });

  describe('Foreign', () => {
    // ${}
    it('should ignore empty value', () => expect(parse('${}')).to.equal(null));

    // ${${AWS::Region}}
    it('should ignore nested foreign notations', () =>
      expect(parse('${${AWS::Region}}')).to.equal(null));

    // ${type}
    it('should ignore just type name string', () => expect(parse('${type}')).to.equal(null));

    // ${AWS::Region}
    // ${foo::Region}
    it('should ignore double clon vars ', () => {
      expect(parse('${AWS::Region}')).to.equal(null);
      expect(parse('${foo::Region}')).to.equal(null);
    });

    // ${Database}
    // ${stageVariables.stageName}
    it('should ignore AWS CF references', () => {
      expect(parse('${Database}')).to.equal(null);
      expect(parse('foo ${stageVariables.stageName} var')).to.equal(null);
    });

    //  ${sour${inner.type}ce}
    it('should ignore nested not supported notations', () =>
      expect(parse('fo${bla${foo}}o  ${so,ur${inner.type}ce} var')).to.equal(null));
  });

  describe('Not used', () => {
    // foo bar ()
    it('should return null', () => expect(parse('fo$o b$$ar ()')).to.equal(null));

    // foo\${elo:}
    it('should support escape character', () =>
      expect(parse('e\\${s:}n\\$${s:}qe\\\\\\${s:}qn\\\\${s:}')).to.deep.equal([
        {
          start: 1,
          end: 3,
          value: '$',
        },
        {
          start: 10,
          end: 15,
          sources: [{ type: 's' }],
        },
        {
          start: 17,
          end: 21,
          value: '\\$',
        },
        {
          start: 27,
          end: 29,
          value: '\\',
        },
        {
          start: 29,
          end: 34,
          sources: [{ type: 's' }],
        },
      ]));
  });
});
