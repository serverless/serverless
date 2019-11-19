'use strict';

const expect = require('chai').expect;
const path = require('path');
const BbPromise = require('bluebird');
const fse = BbPromise.promisifyAll(require('fs-extra'));
const sinon = require('sinon');
const runServerless = require('../../../../../tests/utils/run-serverless');
const artifacts = require('./artifacts');

for (const method of Object.keys(artifacts)) {
  artifacts[method] = sinon.stub(artifacts, method).callsFake(function(...args) {
    return artifacts[method].wrappedMethod.apply(this, args);
  });
}
describe('#moveArtifactsToPackage()', () => {
  const runServelessOptions = {
    modulesCacheStub: {
      [require.resolve('./artifacts')]: artifacts,
    },
  };

  afterEach(() => sinon.resetHistory());

  it('should resolve if no package option is set', () =>
    runServerless(
      Object.assign(
        {
          config: { service: 'irrelevant', provider: 'aws' },
          cliArgs: ['package'],
        },
        runServelessOptions
      )
    )
      .then(serverless => {
        expect(artifacts.moveArtifactsToPackage.called).to.be.equal(true);
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

  it('should use package option as target', () =>
    runServerless(
      Object.assign(
        {
          config: { service: 'irrelevant', provider: 'aws' },
          cliArgs: ['package', '--package', 'foo'],
        },
        runServelessOptions
      )
    )
      .then(serverless => {
        expect(artifacts.moveArtifactsToPackage.called).to.be.equal(true);
        return BbPromise.all([
          fse
            .lstatAsync(
              path.join(
                serverless.config.servicePath,
                '.serverless/cloudformation-template-create-stack.json'
              )
            )
            .catch(error => {
              if (error.code === 'ENOENT') return null;
              throw error;
            }),
          fse.lstatAsync(
            path.join(
              serverless.config.servicePath,
              'foo/cloudformation-template-create-stack.json'
            )
          ),
        ]);
      })
      .then(([defaultStats, customStats]) => {
        expect(defaultStats).to.be.equal(null);
        expect(customStats.isFile()).to.be.equal(true);
      }));

  it('should use service package path as target', () =>
    runServerless(
      Object.assign(
        {
          config: { service: 'irrelevant', provider: 'aws', package: { path: 'foo' } },
          cliArgs: ['package'],
        },
        runServelessOptions
      )
    )
      .then(serverless => {
        expect(artifacts.moveArtifactsToPackage.called).to.be.equal(true);
        return BbPromise.all([
          fse
            .lstatAsync(
              path.join(
                serverless.config.servicePath,
                '.serverless/cloudformation-template-create-stack.json'
              )
            )
            .catch(error => {
              if (error.code === 'ENOENT') return null;
              throw error;
            }),
          fse.lstatAsync(
            path.join(
              serverless.config.servicePath,
              'foo/cloudformation-template-create-stack.json'
            )
          ),
        ]);
      })
      .then(([defaultStats, customStats]) => {
        expect(defaultStats).to.be.equal(null);
        expect(customStats.isFile()).to.be.equal(true);
      }));

  it('should not fail with existing package dir', () =>
    runServerless(
      Object.assign(
        {
          config: { service: 'irrelevant', provider: 'aws', package: { path: 'foo' } },
          cliArgs: ['package'],
          hooks: {
            before: (ignore, { cwd }) => fse.ensureFileAsync(path.join(cwd, 'foo/tmp-file')),
          },
        },
        runServelessOptions
      )
    )
      .then(serverless => {
        expect(artifacts.moveArtifactsToPackage.called).to.be.equal(true);
        return BbPromise.all([
          fse
            .lstatAsync(
              path.join(
                serverless.config.servicePath,
                '.serverless/cloudformation-template-create-stack.json'
              )
            )
            .catch(error => {
              if (error.code === 'ENOENT') return null;
              throw error;
            }),
          fse.lstatAsync(
            path.join(
              serverless.config.servicePath,
              'foo/cloudformation-template-create-stack.json'
            )
          ),
          fse.lstatAsync(path.join(serverless.config.servicePath, 'foo/tmp-file')).catch(error => {
            if (error.code === 'ENOENT') return null;
            throw error;
          }),
        ]);
      })
      .then(([defaultStats, customStats, customFileStats]) => {
        expect(defaultStats).to.be.equal(null);
        expect(customStats.isFile()).to.be.equal(true);
        expect(customFileStats).to.be.equal(null);
      }));
});

describe('#moveArtifactsToTemp()', () => {
  const runServelessOptions = {
    // Mimic existence of AWS cres
    env: { AWS_CONTAINER_CREDENTIALS_FULL_URI: 'ignore' },
    lastLifecycleHookName: 'before:deploy:deploy',
    modulesCacheStub: {
      [require.resolve('./artifacts')]: artifacts,
    },
  };

  afterEach(() => sinon.resetHistory());

  it('should not be called if no package is set', () =>
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
        expect(artifacts.moveArtifactsToTemp.called).to.be.equal(false);
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

  it('should use package option as source path', () =>
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
            cliArgs: ['deploy', '--package', 'foo'],
          },
          runServelessOptions
        )
      )
        .then(() => {
          expect(artifacts.moveArtifactsToTemp.called).to.be.equal(true);
          return BbPromise.all([
            fse.lstatAsync(
              path.join(servicePath, '.serverless/cloudformation-template-create-stack.json')
            ),
            fse.lstatAsync(path.join(servicePath, 'foo/cloudformation-template-create-stack.json')),
          ]);
        })
        .then(([defaultStats, customStats]) => {
          expect(defaultStats.isFile()).to.be.equal(true);
          expect(customStats.isFile()).to.be.equal(true);
        });
    }));

  it('should use service package path as target', () =>
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
          expect(artifacts.moveArtifactsToTemp.called).to.be.equal(true);
          return BbPromise.all([
            fse.lstatAsync(
              path.join(servicePath, '.serverless/cloudformation-template-create-stack.json')
            ),
            fse.lstatAsync(path.join(servicePath, 'foo/cloudformation-template-create-stack.json')),
          ]);
        })
        .then(([defaultStats, customStats]) => {
          expect(defaultStats.isFile()).to.be.equal(true);
          expect(customStats.isFile()).to.be.equal(true);
        });
    }));

  it('should not fail with existing temp dir', () =>
    runServerless(
      Object.assign(
        {
          config: { service: 'irrelevant', provider: 'aws' },
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
          expect(artifacts.moveArtifactsToTemp.called).to.be.equal(false);
          return fse.lstatAsync(
            path.join(servicePath, '.serverless/cloudformation-template-create-stack.json')
          );
        })
        .then(stats => {
          expect(stats.isFile()).to.be.equal(true);
        });
    }));
});
