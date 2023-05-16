'use strict';

const { expect } = require('chai');

const overrideArgv = require('process-utils/override-argv');
const ServerlessError = require('../../../../../lib/serverless-error');
const resolveCliInput = require('../../../../../lib/cli/resolve-input');
const resolveMeta = require('../../../../../lib/configuration/variables/resolve-meta');
const eventuallyReportResolutionErrors = require('../../../../../lib/configuration/variables/eventually-report-resolution-errors');

describe('test/unit/lib/configuration/variables/eventually-report-resolution-errors.test.js', () => {
  beforeEach(() => {
    resolveCliInput.clear();
  });
  it('should return "false" on no errors', () => {
    const configuration = { foo: 'bar' };
    const variablesMeta = resolveMeta(configuration);

    expect(eventuallyReportResolutionErrors(process.cwd(), configuration, variablesMeta)).to.equal(
      false
    );
  });

  describe('On errors', () => {
    it('should throw error in regular circumstances', () => {
      const configuration = { foo: '${foo:raz' };
      const variablesMeta = resolveMeta(configuration);
      overrideArgv({ args: ['serverless', 'foo'] }, () =>
        expect(() => eventuallyReportResolutionErrors(process.cwd(), configuration, variablesMeta))
          .to.throw(ServerlessError)
          .with.property('code', 'VARIABLES_RESOLUTION_ERROR')
      );
    });
  });
});
