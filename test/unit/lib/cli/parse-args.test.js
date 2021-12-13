'use strict';

const { expect } = require('chai');
const ServerlessError = require('../../../../lib/serverless-error');
const parseArgs = require('../../../../lib/cli/parse-args');

describe('test/unit/lib/cli/parse-args.test.js', () => {
  let parsedArgs;
  before(() => {
    parsedArgs = parseArgs(
      [
        '--string',
        'one space separated',
        '--unspecified-string=two space separated',
        '--unspecified-boolean',
        '--unspecified-multiple',
        'one',
        '--unspecified-multiple=',
        '--unspecified-multiple=',
        '--unspecified-multiple',
        'test',
        '--unspecified-multiple=another',
        '--unspecified-multiple',
        'another2',
        '--unspecified-multiple2',
        'one',
        '--unspecified-multiple2',
        'other',
        '--multiple',
        'single',
        '--string-empty=',
        '-a',
        'value',
        '--multiple=',
        '--multiple',
        'other',
        '--boolean',
        'elo',
        '--no-other-boolean',
        'foo',
        '--empty=',
        '-bc',
        '--underscore_separator',
        'underscored_value',
        '--UPPER_CASE_PARAM',
        'UPPER_CASE_VALUE',
        '--',
        '--ignored1',
        '--ignored2',
      ],
      {
        boolean: new Set(['boolean', 'other-boolean']),
        string: new Set(['string', 'string-empty']),
        multiple: new Set(['multiple']),
        alias: new Map([['a', 'alias']]),
      }
    );
  });

  it('should recognize string param', async () => {
    expect(parsedArgs.string).to.equal('one space separated');
    delete parsedArgs.string;
  });

  it('should recognize unspecified string param', async () => {
    expect(parsedArgs['unspecified-string']).to.equal('two space separated');
    delete parsedArgs['unspecified-string'];
  });

  it('should recognize unspecified boolean param', async () => {
    expect(parsedArgs['unspecified-boolean']).to.equal(true);
    delete parsedArgs['unspecified-boolean'];
  });

  it('should recognize unspecified multiple param', async () => {
    expect(parsedArgs['unspecified-multiple']).to.deep.equal([
      'one',
      null,
      null,
      'test',
      'another',
      'another2',
    ]);
    expect(parsedArgs['unspecified-multiple2']).to.deep.equal(['one', 'other']);
    delete parsedArgs['unspecified-multiple'];
    delete parsedArgs['unspecified-multiple2'];
  });

  it('should recognize multiple param', async () => {
    expect(parsedArgs.multiple).to.deep.equal(['single', null, 'other']);
    delete parsedArgs.multiple;
  });

  it('should recognize alias', async () => {
    expect(parsedArgs.alias).to.equal('value');
    delete parsedArgs.alias;
  });

  it('should recognize boolean', async () => {
    expect(parsedArgs.boolean).to.equal(true);
    delete parsedArgs.boolean;
  });

  it('should recognize negated boolean', async () => {
    expect(parsedArgs['other-boolean']).to.equal(false);
    delete parsedArgs['other-boolean'];
  });

  it('should recognize mutliple aliases shortcut', async () => {
    expect(parsedArgs.b).to.equal(true);
    expect(parsedArgs.c).to.equal(true);
    delete parsedArgs.b;
    delete parsedArgs.c;
  });

  it('should recognize empty value', async () => {
    expect(parsedArgs.empty).to.equal(null);
    expect(parsedArgs['string-empty']).to.equal(null);
    delete parsedArgs.empty;
    delete parsedArgs['string-empty'];
  });

  it('should recognize underscore chars in params', async () => {
    expect(parsedArgs.underscore_separator).to.equal('underscored_value');
    delete parsedArgs.underscore_separator;
  });

  it('should recognize uppercased params', async () => {
    expect(parsedArgs.UPPER_CASE_PARAM).to.equal('UPPER_CASE_VALUE');
    delete parsedArgs.UPPER_CASE_PARAM;
  });

  it('should recognize positional arguments', async () => {
    expect(parsedArgs._).to.deep.equal(['elo', 'foo', '--ignored1', '--ignored2']);
    delete parsedArgs._;
  });

  it('should not expose unexpected properties', async () => {
    expect(parsedArgs).to.deep.equal({});
  });

  it('should not throw if -h or --help param', () => {
    parseArgs(['-ab=foo', '--help'], {});
    parseArgs(['--boolean=value', '-h'], { boolean: new Set(['boolean']) });
  });

  it('should reject value for mutliple boolean properties alias', () =>
    expect(() => parseArgs(['-ab=foo'], {}))
      .to.throw(ServerlessError)
      .with.property('code', 'UNEXPECTED_CLI_PARAM_VALUE'));

  it('should reject multiple values for aliased boolean properties', () =>
    expect(() => parseArgs(['-a', 'foo', '-ab'], {}))
      .to.throw(ServerlessError)
      .with.property('code', 'UNEXPECTED_CLI_PARAM_MULTIPLE_VALUE'));

  it('should reject value for negated boolean properties', () =>
    expect(() => parseArgs(['--no-boolean=value'], { boolean: new Set(['boolean']) }))
      .to.throw(ServerlessError)
      .with.property('code', 'UNEXPECTED_CLI_PARAM_VALUE'));

  it('should reject multiple values for negated boolean properties', () =>
    expect(() => parseArgs(['--boolean', 'foo', '--no-boolean'], {}))
      .to.throw(ServerlessError)
      .with.property('code', 'UNEXPECTED_CLI_PARAM_MULTIPLE_VALUE'));

  it('should reject value for boolean properties', () =>
    expect(() => parseArgs(['--boolean=value'], { boolean: new Set(['boolean']) }))
      .to.throw(ServerlessError)
      .with.property('code', 'UNEXPECTED_CLI_PARAM_VALUE'));

  it('should reject multiple values for boolean properties', () =>
    expect(() => parseArgs(['--boolean', 'foo', '--boolean'], {}))
      .to.throw(ServerlessError)
      .with.property('code', 'UNEXPECTED_CLI_PARAM_MULTIPLE_VALUE'));

  it('should reject boolean value for string property', () =>
    expect(() => parseArgs(['--string'], { string: new Set(['string']) }))
      .to.throw(ServerlessError)
      .with.property('code', 'MISSING_CLI_PARAM_VALUE'));

  it('should reject multiple values for singular properties', () =>
    expect(() => parseArgs(['--string', 'foo', '--string=bar'], { string: new Set(['string']) }))
      .to.throw(ServerlessError)
      .with.property('code', 'UNEXPECTED_CLI_PARAM_MULTIPLE_VALUE'));

  it('should reject multiple values for unspecified boolean properties', () =>
    expect(() => parseArgs(['--boolean', '--boolean=foo'], {}))
      .to.throw(ServerlessError)
      .with.property('code', 'UNEXPECTED_CLI_PARAM_MULTIPLE_VALUE'));
});
