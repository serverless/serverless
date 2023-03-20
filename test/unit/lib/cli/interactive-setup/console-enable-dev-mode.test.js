'use strict';

const chai = require('chai');
const proxyquire = require('proxyquire').noPreserveCache();

const { expect } = chai;
chai.use(require('chai-as-promised'));

let step;
describe('test/unit/lib/cli/interactive-setup/console-enable-dev-mode.test.js', () => {
  let fakeOrgId;
  let expectedFunctionCount;
  let fakeRegion;
  let expectedFunctionHits;
  let expectedServiceFunctionNames;

  beforeEach(() => {
    fakeOrgId = '123';
    expectedFunctionHits = [
      {
        aws_lambda_name: 'function1',
      },
    ];
    expectedServiceFunctionNames = expectedFunctionHits.map((hit) => hit.aws_lambda_name);
    expectedFunctionCount = expectedFunctionHits.length;
    fakeRegion = 'us-east-1';
  });

  const configureStep = ({
    functionExistResponse,
    checkInstrumentationResponse,
    instrumentFunctionResponse = { success: true },
  }) => {
    step = proxyquire('../../../../../lib/cli/interactive-setup/console-enable-dev-mode', {
      '@serverless/utils/api-request': async (pathname, options) => {
        if (
          pathname === `/api/search/orgs/${fakeOrgId}/search` &&
          options.body.query.bool.must.length === 3
        ) {
          return functionExistResponse;
        }
        if (
          pathname === `/api/search/orgs/${fakeOrgId}/search` &&
          options.body.query.bool.must.length === 4
        ) {
          return checkInstrumentationResponse;
        }
        if (pathname === '/api/integrations/aws/instrumentations') {
          if (options.body.resources.length > 50) {
            throw new Error('Too many resources to instrument');
          }
          return instrumentFunctionResponse;
        }
        throw new Error(`Unexpected pathname "${pathname}"`);
      },
    });
  };

  it('Should be ineffective, when not in console dev mode context', async () => {
    configureStep({
      functionExistResponse: {},
      checkInstrumentationResponse: {},
    });
    const context = { isConsoleDevMode: false, options: {} };
    expect(await step.isApplicable(context)).to.be.false;
    expect(context.inapplicabilityReasonCode).to.equal('NON_DEV_MODE_CONTEXT');
  });

  it('Should be ineffective, when no org is selected', async () => {
    configureStep({
      functionExistResponse: {},
      checkInstrumentationResponse: {},
    });
    const context = { isConsoleDevMode: true, options: {}, org: null };
    expect(await step.isApplicable(context)).to.be.false;
    expect(context.inapplicabilityReasonCode).to.equal('UNRESOLVED_ORG');
  });

  it('Should be ineffective, when functions are already instrumented', async () => {
    configureStep({
      functionExistResponse: {
        total: expectedFunctionCount,
        hits: expectedFunctionHits,
      },
      checkInstrumentationResponse: {
        total: expectedFunctionCount,
        hits: expectedFunctionHits,
      },
    });

    const context = {
      isConsoleDevMode: true,
      options: {},
      org: {
        orgId: fakeOrgId,
      },
      serverless: {
        service: {
          provider: {
            region: fakeRegion,
          },
          setFunctionNames: () => {},
          getAllFunctionsNames: () => expectedServiceFunctionNames,
        },
      },
    };
    expect(await step.isApplicable(context)).to.be.false;
    expect(context.inapplicabilityReasonCode).to.equal('ALREADY_INSTRUMENTED');
    expect(context.targetInstrumentations.length).to.equal(1);
    expect(context.consoleDevModeTargetFunctions.length).to.equal(1);
  });

  it('Should be ineffective and cancel, when only one function exists and it is not included in the integration', async () => {
    configureStep({
      functionExistResponse: {
        total: 0,
        hits: [],
      },
      checkInstrumentationResponse: {
        total: 0,
        hits: [],
      },
    });

    const context = {
      isConsoleDevMode: true,
      options: {},
      org: {
        orgId: fakeOrgId,
      },
      serverless: {
        service: {
          provider: {
            region: fakeRegion,
          },
          setFunctionNames: () => {},
          getAllFunctionsNames: () => expectedServiceFunctionNames,
        },
      },
    };
    expect(await step.isApplicable(context)).to.be.false;
    expect(context.inapplicabilityReasonCode).to.equal('NO_FUNCTIONS_EXIST');
    expect(context.targetInstrumentations).to.be.undefined;
    expect(context.consoleDevModeTargetFunctions).to.be.undefined;
  });

  it('Should be effective and only update functions that were found in the integration', async () => {
    // Add a function that is not in the integration to the serverless service
    expectedServiceFunctionNames.push('function2');
    // Set up the expected responses from the API
    const functionExistResponse = {
      total: expectedFunctionCount,
      hits: expectedFunctionHits,
    };
    const checkInstrumentationResponse = {
      total: 0,
      hits: [],
    };
    configureStep({
      functionExistResponse,
      checkInstrumentationResponse,
    });

    const context = {
      isConsoleDevMode: true,
      options: {},
      org: {
        orgId: fakeOrgId,
      },
      serverless: {
        service: {
          provider: {
            region: fakeRegion,
          },
          setFunctionNames: () => {},
          getAllFunctionsNames: () => expectedServiceFunctionNames,
        },
      },
    };
    expect(await step.isApplicable(context)).to.be.true;
    expect(context.targetInstrumentations.length).to.equal(1);
    expect(context.consoleDevModeTargetFunctions.length).to.equal(1);

    // Re-proxyquire step so we can update the response to the checkInstrumentation call
    configureStep({
      functionExistResponse,
      checkInstrumentationResponse: {
        total: expectedFunctionCount,
        hits: expectedFunctionHits,
      },
    });

    expect(await step.run(context)).to.be.true;
  });

  it('Should be effective and only target function from -f option', async () => {
    const functionExistResponse = {
      total: expectedFunctionCount,
      hits: expectedFunctionHits,
    };
    const checkInstrumentationResponse = {
      total: 0,
      hits: [],
    };
    configureStep({
      functionExistResponse,
      checkInstrumentationResponse,
    });

    const context = {
      isConsoleDevMode: true,
      options: {
        function: expectedServiceFunctionNames[0],
      },
      org: {
        orgId: fakeOrgId,
      },
      serverless: {
        service: {
          provider: {
            region: fakeRegion,
          },
          setFunctionNames: () => {},
          getFunction: (name) => ({
            name,
          }),
          getAllFunctionsNames: () => [],
        },
      },
    };
    expect(await step.isApplicable(context)).to.be.true;
    expect(context.targetInstrumentations.length).to.equal(1);
    expect(context.consoleDevModeTargetFunctions.length).to.equal(1);

    // Re-proxyquire step so we can update the response to the checkInstrumentation call
    configureStep({
      functionExistResponse,
      checkInstrumentationResponse: {
        total: expectedFunctionCount,
        hits: expectedFunctionHits,
      },
    });

    expect(await step.run(context)).to.be.true;
  });

  it('Should be effective and update 50 functions at a time', async () => {
    expectedFunctionHits = new Array(100)
      .fill(0)
      .map((_, i) => ({ aws_lambda_name: `function${i + 1}` }));
    expectedFunctionCount = expectedFunctionHits.length;
    expectedServiceFunctionNames = expectedFunctionHits.map((hit) => hit.aws_lambda_name);
    const functionExistResponse = {
      total: expectedFunctionCount,
      hits: expectedFunctionHits,
    };
    const checkInstrumentationResponse = {
      total: 0,
      hits: [],
    };
    configureStep({
      functionExistResponse,
      checkInstrumentationResponse,
    });

    const context = {
      isConsoleDevMode: true,
      options: {},
      org: {
        orgId: fakeOrgId,
      },
      serverless: {
        service: {
          provider: {
            region: fakeRegion,
          },
          setFunctionNames: () => {},
          getFunction: () => ({}),
          getAllFunctionsNames: () => expectedServiceFunctionNames,
        },
      },
    };
    expect(await step.isApplicable(context)).to.be.true;
    expect(context.targetInstrumentations.length).to.equal(expectedFunctionCount);
    expect(context.consoleDevModeTargetFunctions.length).to.equal(expectedFunctionCount);

    // Re-proxyquire step so we can update the response to the checkInstrumentation call
    configureStep({
      functionExistResponse,
      checkInstrumentationResponse: {
        total: expectedFunctionCount,
        hits: expectedFunctionHits,
      },
    });

    expect(await step.run(context)).to.be.true;
  });
});
