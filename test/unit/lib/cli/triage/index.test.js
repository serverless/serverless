'use strict';

const { expect } = require('chai');
const fs = require('fs');
const overrideCwd = require('process-utils/override-cwd');
const overrideEnv = require('process-utils/override-env');
const overrideArgv = require('process-utils/override-argv');
const path = require('path');
const triage = require('../../../../../lib/cli/triage');

const fixturesDirname = path.resolve(__dirname, 'fixtures');

describe('test/unit/lib/cli/triage/index.test.js', () => {
  before(() => overrideEnv({ variables: { SLS_GEO_LOCATION: 'us' } }));

  describe('CLI params', () => {
    it('should recognize "registry" as "@serverless/components" command', async () =>
      overrideArgv({ args: ['sls', 'registry'] }, async () => {
        expect(await triage()).to.equal('@serverless/components');
      }));
    it('should recognize "init" as "@serverless/components" command', async () =>
      overrideArgv({ args: ['sls', 'init'] }, async () => {
        expect(await triage()).to.equal('@serverless/components');
      }));
    it('should recognize "publish" as "@serverless/components" command', async () =>
      overrideArgv({ args: ['sls', 'publish'] }, async () => {
        expect(await triage()).to.equal('@serverless/components');
      }));
    it('should recognize "--help-components" as "@serverless/components" exclusive flag', async () => {
      await overrideArgv({ args: ['sls', '--help-components'] }, async () => {
        expect(await triage()).to.equal('@serverless/components');
      });
      await overrideArgv({ args: ['sls', 'any', '--help-components'] }, async () => {
        expect(await triage()).to.equal('@serverless/components');
      });
    });

    it('should recognize "--target" as "@serverless/components" exclusive flag', async () => {
      await overrideArgv({ args: ['sls', '--target'] }, async () => {
        expect(await triage()).to.equal('@serverless/components');
      });
      await overrideArgv({ args: ['sls', 'any', '--target'] }, async () => {
        expect(await triage()).to.equal('@serverless/components');
      });
    });

    it('should favor "@serverless/components" for bare "sls" command when tencent platform set explicitly', async () =>
      overrideEnv({ variables: { SERVERLESS_PLATFORM_VENDOR: 'tencent' } }, async () =>
        overrideArgv({ args: ['sls'] }, async () => {
          expect(await triage()).to.equal('@serverless/components');
        })
      ));

    it('should recognize bare "sls" command in China as "@serverless/components" command', async () =>
      overrideEnv({ variables: { SLS_GEO_LOCATION: 'cn' } }, async () =>
        overrideArgv({ args: ['sls'] }, async () => {
          expect(await triage()).to.equal('@serverless/components');
        })
      ));

    it('should unconditionally favor "serverless" for version check', async () =>
      overrideEnv(
        { variables: { SERVERLESS_PLATFORM_VENDOR: 'tencent', SLS_GEO_LOCATION: 'cn' } },
        async () => {
          await overrideArgv({ args: ['sls', '-v'] }, async () => {
            expect(await triage()).to.equal('serverless');
          });
          await overrideArgv({ args: ['sls', '--version'] }, async () => {
            expect(await triage()).to.equal('serverless');
          });
        }
      ));

    it('should favor "serverless" in other cases', async () => {
      await overrideArgv({ args: ['sls', 'print'] }, async () => {
        expect(await triage()).to.equal('serverless');
      });
      await overrideArgv({ args: ['sls', 'deploy'] }, async () => {
        expect(await triage()).to.equal('serverless');
      });
      await overrideArgv({ args: ['sls'] }, async () => {
        expect(await triage()).to.equal('serverless');
      });
      await overrideArgv({ args: ['sls', '--help'] }, async () => {
        expect(await triage()).to.equal('serverless');
      });
    });
  });

  describe('Service configuration', () => {
    let restoreArgv;
    before(() => {
      ({ restoreArgv } = overrideArgv({ args: ['sls', 'deploy'] }));
    });
    after(() => restoreArgv());

    for (const cliName of ['serverless', '@serverless/components', '@serverless/cli']) {
      for (const extension of fs.readdirSync(path.resolve(fixturesDirname, cliName))) {
        for (const fixtureName of fs.readdirSync(
          path.resolve(fixturesDirname, cliName, extension)
        )) {
          const testName = `should recognize "${cliName}" at "${cliName}/${extension}/${fixtureName}"`;
          it(testName, async () =>
            overrideCwd(
              path.resolve(fixturesDirname, cliName, extension, fixtureName),
              async () => {
                expect(await triage()).to.equal(cliName);
              }
            )
          );
        }
      }
    }
  });
});
