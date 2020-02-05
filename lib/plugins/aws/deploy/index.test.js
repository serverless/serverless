'use strict';

const sinon = require('sinon');
const BbPromise = require('bluebird');
const fse = BbPromise.promisifyAll(require('fs-extra'));
const path = require('path');
const runServerless = require('../../../../tests/utils/run-serverless');

// Configure chai
const { expect } = require('chai');

const runServelessOptions = {
  // Mimic existence of AWS cres
  env: { AWS_CONTAINER_CREDENTIALS_FULL_URI: 'ignore' },
  lastLifecycleHookName: 'before:deploy:deploy',
};

describe('AwsDeploy', () => {
  let existsDeploymentBucketStub;
  before(() => {
    existsDeploymentBucketStub = sinon.stub().resolves();
    runServelessOptions.modulesCacheStub = {
      [require.resolve('./lib/existsDeploymentBucket')]: {
        existsDeploymentBucket: existsDeploymentBucketStub,
      },
    };
  });

  afterEach(() => sinon.resetHistory());

  describe('hooks', () => {
    describe('"before:deploy:deploy" hook', () => {
      it('should use the default packaging mechanism if no packaging config is provided', () =>
        runServerless(
          Object.assign(
            {
              config: { service: 'irrelevant', provider: 'aws' },
              cliArgs: ['deploy'],
            },
            runServelessOptions
          )
        )
          .then(serverless => {
            return fse.lstatAsync(
              path.join(
                serverless.config.servicePath,
                '.serverless/cloudformation-template-create-stack.json'
              )
            );
          })
          .then(stats => {
            expect(stats.isFile()).to.be.equal(true);
          }));

      it('should move the artifacts to the tmp dir if options based config is provided', () =>
        runServerless(
          Object.assign(
            {
              config: { service: 'irrelevant', provider: 'aws' },
              cliArgs: ['package', '--package', 'foo'],
            },
            runServelessOptions
          )
        ).then(serverless => {
          const { servicePath } = serverless.config;
          return runServerless(
            Object.assign(
              {
                cwd: servicePath,
                cliArgs: ['deploy'],
              },
              runServelessOptions
            )
          )
            .then(() => {
              return BbPromise.all([
                fse.lstatAsync(
                  path.join(servicePath, '.serverless/cloudformation-template-create-stack.json')
                ),
                fse.lstatAsync(
                  path.join(servicePath, 'foo/cloudformation-template-create-stack.json')
                ),
              ]);
            })
            .then(([defaultStats, customStats]) => {
              expect(defaultStats.isFile()).to.be.equal(true);
              expect(customStats.isFile()).to.be.equal(true);
            });
        }));

      it('should move the artifacts to the tmp dir if service based config is provided', () =>
        runServerless(
          Object.assign(
            {
              config: { service: 'irrelevant', provider: 'aws', package: { path: 'foo' } },
              cliArgs: ['package'],
            },
            runServelessOptions
          )
        ).then(serverless => {
          const { servicePath } = serverless.config;
          return runServerless(
            Object.assign(
              {
                cwd: servicePath,
                cliArgs: ['deploy'],
              },
              runServelessOptions
            )
          )
            .then(() => {
              return BbPromise.all([
                fse.lstatAsync(
                  path.join(servicePath, '.serverless/cloudformation-template-create-stack.json')
                ),
                fse.lstatAsync(
                  path.join(servicePath, 'foo/cloudformation-template-create-stack.json')
                ),
              ]);
            })
            .then(([defaultStats, customStats]) => {
              expect(defaultStats.isFile()).to.be.equal(true);
              expect(customStats.isFile()).to.be.equal(true);
            });
        }));

      it('should be called existsDeploymentBucket method if deploymentBucket is provided', () =>
        runServerless(
          Object.assign(
            {
              config: { service: 'irrelevant', provider: { name: 'aws', deploymentBucket: 'foo' } },
              cliArgs: ['deploy'],
            },
            runServelessOptions
          )
        ).then(() => expect(existsDeploymentBucketStub.called).to.be.equal(true)));
    });
  });
});
