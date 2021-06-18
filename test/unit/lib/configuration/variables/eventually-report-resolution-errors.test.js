'use strict';

const { expect } = require('chai');

const overrideArgv = require('process-utils/override-argv');
const overrideStdoutWrite = require('process-utils/override-stdout-write');
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
    it('should log errors with help command', () => {
      const configuration = { foo: '${foo:raz' };
      const variablesMeta = resolveMeta(configuration);
      let stdoutData = '';
      overrideArgv({ args: ['serverless', '--help'] }, () =>
        overrideStdoutWrite(
          (data) => (stdoutData += data),
          () =>
            expect(
              eventuallyReportResolutionErrors(process.cwd(), configuration, variablesMeta)
            ).to.equal(true)
        )
      );

      expect(stdoutData).to.include('Resolution of service configuration failed');
    });

    it('should log deprecation with no "variablesResolutionMode" set', () => {
      const configuration = { foo: '${foo:raz' };
      const variablesMeta = resolveMeta(configuration);
      overrideArgv(
        { args: ['serverless', 'foo'] },
        () => () =>
          expect(() =>
            eventuallyReportResolutionErrors(process.cwd(), configuration, variablesMeta)
          )
            .to.throw(ServerlessError)
            .with.property('code', 'REJECTED_DEPRECATION_VARIABLES_RESOLUTION_ERROR')
      );
    });
    it('should throw with no "variablesResolutionMode" set', () => {
      const configuration = { foo: '${foo:raz', variablesResolutionMode: 20210326 };
      const variablesMeta = resolveMeta(configuration);
      overrideArgv({ args: ['serverless', 'foo'] }, () =>
        expect(() => eventuallyReportResolutionErrors(process.cwd(), configuration, variablesMeta))
          .to.throw(ServerlessError)
          .with.property('code', 'VARIABLES_RESOLUTION_ERROR')
      );
    });
  });
});
