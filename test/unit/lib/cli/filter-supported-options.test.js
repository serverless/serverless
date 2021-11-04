'use strict';

const { expect } = require('chai');

const filterSupportedOptions = require('../../../../lib/cli/filter-supported-options');

describe('test/unit/lib/cli/filter-supported-options.test.js', () => {
  it('should recognize just command schema options if passsed', () => {
    expect(
      filterSupportedOptions(
        {
          supString: 'string',
          supBool: false,
          supMultiple: ['multiple'],
          unSupString: 'string',
          unSupBool: false,
          unSupMultiple: ['multiple'],
        },
        {
          commandSchema: {
            options: {
              supString: {},
              supBool: {},
              supMultiple: {},
              extra: {},
            },
          },
        }
      )
    ).to.deep.equal({
      supString: 'string',
      supBool: false,
      supMultiple: ['multiple'],
      extra: null,
    });
  });

  it('should recognize just AWS service options when no command schema and AWS provider', () => {
    expect(
      filterSupportedOptions(
        {
          stage: 'marko',
          region: 'elo',
          unSupString: 'string',
          unSupBool: false,
          unSupMultiple: ['multiple'],
        },
        { providerName: 'aws' }
      )
    ).to.deep.equal({
      'region': 'elo',
      'aws-profile': null,
      'help': null,
      'version': null,
      'config': null,
      'stage': 'marko',
      'app': null,
      'org': null,
      'use-local-credentials': null,
      'verbose': null,
      'debug': null,
    });
  });

  it('should recognize just any service options when no command schema and no AWS provider', () => {
    expect(
      filterSupportedOptions(
        {
          stage: 'marko',
          region: 'elo',
          unSupString: 'string',
          unSupBool: false,
          unSupMultiple: ['multiple'],
        },
        {}
      )
    ).to.deep.equal({
      help: null,
      version: null,
      config: null,
      stage: 'marko',
      verbose: null,
      debug: null,
    });
  });
});
