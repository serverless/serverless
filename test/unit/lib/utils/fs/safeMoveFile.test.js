'use strict';

const fse = require('fs-extra');
const sinon = require('sinon');
const chai = require('chai');
const { getTmpDirPath } = require('../../../../utils/fs');
const { join } = require('path');
const { expect } = require('chai');
const fsp = require('fs').promises;
const sinonChai = require('sinon-chai');
const safeMoveFile = require('../../../../../lib/utils/fs/safeMoveFile');

chai.use(sinonChai);

/**
 * Returns and Error object that resembles the EXDEV errors that are thrown
 * when you try to rename across device boundaries.
 *
 * @returns an Error object that resembles the EXDEV errors are thrown
 */
const createFakeExDevError = () => {
  // Properties captured by using fs.renameSync in the Node v12.20.1 REPL
  const fakeCrossDeviceError = new Error(
    "Error: EXDEV: cross-device link not permitted, rename '/foo/bar' -> '/bar/baz'"
  );
  // This is the important property that safeMoveFile looks for
  // to fallback to copy then rename behaviour
  fakeCrossDeviceError.code = 'EXDEV';

  // These other properties aren't used but it doesn't hurt to have an accurate error object
  fakeCrossDeviceError.errno = -18;
  fakeCrossDeviceError.syscall = 'rename';
  fakeCrossDeviceError.path = '/foo/bar';
  fakeCrossDeviceError.dest = '/bar/baz';
  return fakeCrossDeviceError;
};

/**
 * The name of the file that will be moved
 */
const artefactName = 'foo-bar.zip';

// Generate temporary directories once per test run
// They will be cleaned up when the tests are done

/**
 * The folder that the test file will be moved to
 */
const destinationPath = getTmpDirPath();

/**
 * The folder that the test file will come from
 */
const sourcePath = getTmpDirPath();

/**
 * The full path to destination where the file is being moved to
 */
const destinationFile = join(destinationPath, artefactName);

/**
 * The full path to the file that is being moved
 */
const sourceFile = join(sourcePath, artefactName);

describe('#safeMoveFile()', () => {
  let renameStub;
  let copyFileStub;
  let unlinkStub;

  beforeEach(async () => {
    renameStub = sinon.stub(fsp, 'rename');
    copyFileStub = sinon.stub(fsp, 'copyFile');
    unlinkStub = sinon.stub(fsp, 'unlink');
    // Allow the fs calls to act as normal until we want to force the rename to fail
    renameStub.callThrough();
    copyFileStub.callThrough();
    unlinkStub.callThrough();

    // Ensure the cache directory exists so that the rename doesn't fail
    fse.ensureDirSync(sourcePath);
    fse.ensureDirSync(destinationPath);

    // Write a test file to rename
    await fse.writeFile(sourceFile, 'source data');
  });

  afterEach(() => {
    // Clean up test directories after each test so they don't interfere with each other
    fse.removeSync(destinationPath);
    fse.removeSync(sourcePath);
    // Reset stubbed methods
    fsp.rename.restore();
    fsp.copyFile.restore();
    fsp.unlink.restore();
  });

  /**
   * Run the test suite with the provided post assertion function.
   * The post assertion function will be called after each test scenario is executed
   * so that the test scenarios can be reused.
   *
   * @param {*} postAssertion the function that is called after every test scenario
   */
  const runTestScenariosWithPostAssertion = (postAssertion) => {
    describe('when the file does not exist by the time the zip is generated', () => {
      it('should write a file', async () => {
        await safeMoveFile(sourceFile, destinationFile);

        const exists = fse.existsSync(destinationFile);
        expect(exists).to.be.true;
        postAssertion();
      });
    });

    describe('when the file already exists by the time the zip is generated', () => {
      beforeEach(async () => {
        // Create an existing file that is at the destination
        fse.ensureFileSync(destinationFile);
        fse.writeFileSync(destinationFile, 'existing destination data');
      });

      describe('when the cached file is not open', () => {
        it('should overwrite the cached file with a valid zip file', async () => {
          await safeMoveFile(sourceFile, destinationFile);

          // Check that the file was actually overwritten
          const cachedData = fse.readFileSync(destinationFile).toString();
          expect(cachedData).not.to.eq('existing destination data');

          postAssertion();
        });
      });
    });
  };

  describe('when the temporary directory is not on a different device to the cache directory', () => {
    runTestScenariosWithPostAssertion(() => {
      // Happy path: Only rename is called
      expect(renameStub).to.have.be.calledOnce;
      expect(copyFileStub).to.not.have.been.called;
      expect(unlinkStub).to.not.have.been.called;
    });
  });

  describe('when the temporary directory is on a different device to the cache directory', () => {
    beforeEach(async () => {
      const error = createFakeExDevError();
      renameStub.onFirstCall().rejects(error);
    });

    runTestScenariosWithPostAssertion(() => {
      // Rename is called twice because the first call will fail due to the cross device rename
      // The second call is across the same device
      expect(renameStub).to.have.been.calledTwice;
      expect(copyFileStub).to.have.been.calledOnce;
      expect(unlinkStub).to.have.been.calledOnce;
    });
  });
});
