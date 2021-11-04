'use strict';

const { expect } = require('chai');
const path = require('path');
const fsp = require('fs').promises;
const spawn = require('child-process-ext/spawn');
const got = require('got');
const AdmZip = require('adm-zip');
const { deployService, removeService } = require('../utils/integration');
const fixturesEngine = require('../fixtures/programmatic');

const serverlessExec = require('../serverlessBinary');

describe('test/integration/curated-plugins.test.js', function () {
  this.timeout(1000 * 60 * 10); // Involves time-taking npm install

  let serviceDir;
  let updateConfig;
  let serviceConfig;
  let isDeployed = false;
  before(async () => {
    ({
      servicePath: serviceDir,
      updateConfig,
      serviceConfig,
    } = await fixturesEngine.setup('curated-plugins'));
    // Needed to test "serverless-domain-manager"
    await deployService(serviceDir);
    isDeployed = true;
  });
  after(async () => {
    if (!isDeployed) return;
    await removeService(serviceDir);
  });

  afterEach(async () => updateConfig({ plugins: null }));

  it('should be extended by "serverless-offline"', async () => {
    await updateConfig({ plugins: ['serverless-offline'] });
    const slsProcessPromise = spawn(serverlessExec, ['offline'], {
      cwd: serviceDir,
    });
    const slsProcess = slsProcessPromise.child;
    let output = '';
    slsProcess.stderr.on('data', function self(data) {
      output += data;
      if (output.includes('server ready:')) {
        slsProcess.stderr.off('data', self);
        got('http://localhost:3000/dev/foo')
          .json()
          .then(async (responseBody) => {
            expect(responseBody.message).to.equal('Test');
          })
          .finally(() => slsProcess.kill('SIGINT'));
      }
    });
    await slsProcessPromise;
  });

  it('should be extended by "serverless-webpack"', async () => {
    await spawn(serverlessExec, ['package'], { cwd: serviceDir });
    const packagePath = path.resolve(serviceDir, '.serverless', `${serviceConfig.service}.zip`);
    const originalPackageSize = (await fsp.stat(packagePath)).size;
    await updateConfig({ plugins: ['serverless-webpack'] });
    await spawn(serverlessExec, ['package'], { cwd: serviceDir });
    const bundledPackageSize = (await fsp.stat(packagePath)).size;
    expect(originalPackageSize / 10).to.be.above(bundledPackageSize);
  });

  it('should be extended by "serverless-domain-manager"', async () => {
    await updateConfig({ plugins: ['serverless-domain-manager'] });
    const { stderrBuffer } = await spawn(serverlessExec, ['info'], { cwd: serviceDir });
    expect(String(stderrBuffer)).to.include('Serverless Domain Manager:');
  });

  it('should be extended by "serverless-prune-plugin"', async () => {
    await updateConfig({ plugins: ['serverless-prune-plugin'] });
    const { stderrBuffer } = await spawn(serverlessExec, ['prune', '-n', '10'], {
      cwd: serviceDir,
    });
    expect(String(stderrBuffer)).to.include('Prune: Pruning complete.');
  });

  it('should be extended by "serverless-dotenv-plugin"', async () => {
    await updateConfig({ plugins: ['serverless-dotenv-plugin'] });
    const { stderrBuffer } = await spawn(serverlessExec, ['package'], {
      cwd: serviceDir,
    });
    expect(String(stderrBuffer)).to.include('DOTENV: Loading environment variables');
    const cfTemplate = JSON.parse(
      await fsp.readFile(
        path.resolve(serviceDir, '.serverless/cloudformation-template-update-stack.json')
      )
    );
    expect(
      cfTemplate.Resources.FunctionLambdaFunction.Properties.Environment.Variables
        .DOTENV_PLUGIN_TEST
    ).to.equal('passed');
  });

  it('should be extended by "serverless-iam-roles-per-function"', async () => {
    await updateConfig({
      plugins: ['serverless-iam-roles-per-function'],
      functions: {
        function: {
          iamRoleStatementsName: 'fn-plugin-role-name',
          iamRoleStatements: [
            {
              Effect: 'Allow',
              Action: ['dynamodb:GetItem'],
              Resource: 'arn:aws:dynamodb:${aws:region}:*:table/mytable',
            },
          ],
        },
      },
    });
    try {
      await spawn(serverlessExec, ['package'], { cwd: serviceDir });
      const cfTemplate = JSON.parse(
        await fsp.readFile(
          path.resolve(serviceDir, '.serverless/cloudformation-template-update-stack.json')
        )
      );
      expect(cfTemplate.Resources.FunctionIamRoleLambdaExecution.Properties.RoleName).to.equal(
        'fn-plugin-role-name'
      );
    } finally {
      await updateConfig({
        functions: {
          function: { iamRoleStatementsName: null, iamRoleStatements: null },
        },
      });
    }
  });

  it('should be extended by "serverless-plugin-typescript"', async () => {
    await updateConfig({
      plugins: ['serverless-plugin-typescript'],
      functions: {
        functionTs: {
          handler: 'index-ts.handler',
        },
      },
    });
    try {
      await spawn(serverlessExec, ['package'], { cwd: serviceDir });
      const zip = new AdmZip(path.resolve(serviceDir, `.serverless/${serviceConfig.service}.zip`));
      const zipEntry = zip.getEntries().find(({ entryName }) => entryName === 'index-ts.js');
      const tmpModulePath = path.resolve(serviceDir, '.serverless/test-ts.js');
      await fsp.writeFile(tmpModulePath, zipEntry.getData());
      expect(require(tmpModulePath).testData).to.deep.equal({ value: 'test-ts-compilation' });
    } finally {
      await updateConfig({
        functions: { functionTs: null },
      });
    }
  });

  it('should be extended by "serverless-step-functions"', async () => {
    await updateConfig({
      plugins: ['serverless-step-functions'],
      stepFunctions: {
        stateMachines: {
          testMachine: {
            definition: {
              StartAt: 'FirstState',
              States: {
                FirstState: {
                  Type: 'Task',
                  Resource: {
                    'Fn::GetAtt': ['entry', 'Arn'],
                  },
                  Next: 'mapped_task',
                },
                mapped_task: {
                  Type: 'Map',
                  Iterator: {
                    StartAt: 'FirstMapTask',
                    States: {
                      FirstMapTask: {
                        Type: 'Task',
                        Resource: {
                          'Fn::GetAtt': ['mapTask', 'Arn'],
                        },
                        End: true,
                      },
                    },
                  },
                  End: true,
                },
              },
            },
          },
        },
        validate: true,
      },
    });
    try {
      await spawn(serverlessExec, ['package'], { cwd: serviceDir });
      const cfTemplate = JSON.parse(
        await fsp.readFile(
          path.resolve(serviceDir, '.serverless/cloudformation-template-update-stack.json')
        )
      );
      expect(cfTemplate.Resources.TestMachineStepFunctionsStateMachine.Type).to.equal(
        'AWS::StepFunctions::StateMachine'
      );
    } finally {
      await updateConfig({
        stepFunctions: null,
      });
    }
  });
});
