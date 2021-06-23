'use strict';

const proxyquire = require('proxyquire').noCallThru();
const fse = require('fs-extra');
const sinon = require('sinon');
const chai = require('chai');
const { getTmpDirPath, listZipFiles } = require('../../../../../utils/fs');
const { join } = require('path');
const { expect } = require('chai');
const sinonChai = require('sinon-chai');

chai.use(sinonChai);

// Stub out functions that generateZip calls to override hardcoded paths
const ensureArtifactStub = sinon.stub();
const getTmpDirPathStub = sinon.stub();
const generateZip = proxyquire('../../../../../../lib/plugins/aws/customResources/generateZip.js', {
  '../../../utils/ensureArtifact': ensureArtifactStub,
  '../../../utils/fs/getTmpDirPath': getTmpDirPathStub,
});

/**
 * The name of the artefact that generateZip generates
 */
const artefactName = 'resource-lambda.zip';

// Generate temporary directories once per test run
// They will be cleaned up when the tests are done

/**
 * The path to the mock cache directory
 */
const cachePath = getTmpDirPath();
/**
 * The path to the directory when the zip file is generated in
 * before it is copied to the cache path
 */
const sourcePath = getTmpDirPath();

/**
 * The full path to the generated artefact after is has been
 * copied to the cache directory
 */
const cachedFile = join(cachePath, artefactName);

describe('#generateZip()', () => {
  beforeEach(() => {
    // Set up differently by different tests
    ensureArtifactStub.reset();

    // This always returns the same value
    getTmpDirPathStub.reset();
    getTmpDirPathStub.returns(sourcePath);

    // Ensure the cache directory exists so that the rename doesn't fail
    fse.ensureDirSync(cachePath);
  });

  afterEach(() => {
    // Clean up test directories after each test so they don't interfere with each other
    fse.removeSync(cachePath);
    fse.removeSync(sourcePath);
  });

  describe('when the file does not exist by the time the zip is generated', () => {
    beforeEach(async () => {
      // Override the ensureArtifact function to set the cache path to the test one
      ensureArtifactStub.callsFake(async (_, generate) => {
        await generate(cachePath);
        return cachePath;
      });
    });

    it('should write a file', async () => {
      await generateZip(artefactName);

      const exists = fse.existsSync(cachedFile);
      expect(exists).to.be.true;
    });
  });

  describe('when the file already exists by the time the zip is generated', () => {
    beforeEach(async () => {
      // Override the ensureArtifact function so that it always calls the 'generate' function
      // even if the file already exists
      // This will simulate the scenario when multiple serverless instances are packaging at once
      // and one of the instances writes to the cache path while the others are still generating the zip file
      ensureArtifactStub.callsFake(async (_, generate) => {
        await generate(cachePath);
        return cachePath;
      });

      // Create an existing file that should conflict with the generated artefact
      fse.ensureFileSync(cachedFile);
      fse.writeFileSync(cachedFile, 'cached data');
    });

    it('should overwrite the cached file with a valid zip file', async () => {
      await generateZip(artefactName);

      // Check that the file was actually overwritten
      const cachedData = fse.readFileSync(cachedFile).toString();
      expect(cachedData).not.to.eq('cached data');

      // List the files in the zip to make sure it is valid
      const filesInZip = await listZipFiles(cachedFile);
      expect(filesInZip).to.have.all.members([
        'README.md',
        'apiGatewayCloudWatchRole/handler.js',
        'cognitoUserPool/handler.js',
        'cognitoUserPool/lib/permissions.js',
        'cognitoUserPool/lib/userPool.js',
        'eventBridge/handler.js',
        'eventBridge/lib/eventBridge.js',
        'eventBridge/lib/permissions.js',
        'eventBridge/lib/utils.js',
        's3/handler.js',
        's3/lib/bucket.js',
        's3/lib/permissions.js',
        'utils.js',
      ]);
    });
  });
});
