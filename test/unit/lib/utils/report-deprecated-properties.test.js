'use strict';

const expect = require('chai').expect;
const report = require('../../../../lib/utils/report-deprecated-properties');
const { triggeredDeprecations } = require('../../../../lib/utils/logDeprecation');
const overrideStdoutWrite = require('process-utils/override-stdout-write');

describe('report-deprecated-properties', () => {
  let stdoutData = '';
  afterEach(() => {
    stdoutData = '';
    triggeredDeprecations.clear();
  });

  const serviceConfig = {
    provider: {
      role: 'role-a',
      iamRoleStatements: ['something'],
      apiGateway: {
        isDodgy: true,
      },
    },
  };

  it('should warn about deprecated usage', () => {
    overrideStdoutWrite(
      (data) => (stdoutData += data),
      () =>
        report(
          'MY_CODE',
          {
            'provider.role': 'provider.iam.role',
            'provider.cfnRole': 'provider.iam.deploymentRole',
            'provider.iamRoleStatements': 'provider.iam.role.statements',
            'provider.apiGateway.isDodgy': 'provider.apiGateway.legitOption',
          },
          { serviceConfig }
        )
    );
    expect(triggeredDeprecations).to.include('MY_CODE');
    expect(stdoutData).to.include(
      'Starting with version 3.0.0, following properties will be replaced'
    );
    expect(stdoutData).to.include('"provider.role" -> "provider.iam.role"');
    expect(stdoutData).to.include('"provider.iamRoleStatements" -> "provider.iam.role.statements"');
    expect(stdoutData).to.include(
      '"provider.apiGateway.isDodgy" -> "provider.apiGateway.legitOption"'
    );
    expect(stdoutData).not.to.include('"provider.cfnRole" -> "provider.iam.role.deploymentRole"');
  });

  it('no deprecated usage', () => {
    overrideStdoutWrite(
      (data) => (stdoutData += data),
      () =>
        report(
          'MY_CODE',
          {
            'provider.bad': 'provider.good',
            'provider.veryBad': 'provider.veryGood',
          },
          { serviceConfig }
        )
    );

    expect(triggeredDeprecations).not.to.include('MY_CODE');
    expect(stdoutData).to.be.equal('');
  });
});
