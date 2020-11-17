'use strict';

const expect = require('chai').expect;
const path = require('path');
const fse = require('fs-extra');
const AWSCommon = require('../index');
const Serverless = require('../../../../../lib/Serverless');
const { getTmpDirPath } = require('../../../../../test/utils/fs');

// In regular startup, the package option is processed from the CLI in the
// Serverless init / plugin loading. Here in the tests, we don't call that
// code path and we're setting up the Serverless object before we know what
// the individual test wants the directory to be.
const setPackageOptionFn = (serverless, awsCommon) => targetPath => {
  awsCommon.options.package = targetPath;
  serverless.processedInput = serverless.processedInput || {};
  serverless.processedInput.options = serverless.processedInput.options || {};
  serverless.processedInput.options.package = targetPath;
};
describe('#moveArtifactsToPackage()', () => {
  let serverless;
  let awsCommon;
  let setPackageOption;
  const moveBasePath = path.join(getTmpDirPath(), 'move');
  const moveServerlessPath = path.join(moveBasePath, '.serverless');

  beforeEach(() => {
    serverless = new Serverless();
    awsCommon = new AWSCommon(serverless, {});
    setPackageOption = setPackageOptionFn(serverless, awsCommon);

    serverless.config.servicePath = moveBasePath;
    if (!serverless.utils.dirExistsSync(moveServerlessPath)) {
      serverless.utils.writeFileDir(moveServerlessPath);
    }
  });

  afterEach(() => {
    if (serverless.utils.dirExistsSync(moveBasePath)) {
      fse.removeSync(moveBasePath);
    }
  });

  it('should resolve if servicePath is not present', () => {
    delete serverless.config.servicePath;
    return awsCommon.moveArtifactsToPackage();
  });

  it('should resolve if no package is set', () => awsCommon.moveArtifactsToPackage());

  it('should use package option as target', () => {
    const testFileSource = path.join(moveServerlessPath, 'moveTestFile.tmp');
    const targetPath = path.join(moveBasePath, 'target');

    setPackageOption(targetPath);
    serverless.utils.writeFileSync(testFileSource, '!!!MOVE TEST FILE!!!');
    return awsCommon.moveArtifactsToPackage().then(() => {
      const testFileTarget = path.join(targetPath, 'moveTestFile.tmp');

      expect(serverless.utils.dirExistsSync(targetPath)).to.be.equal(true);
      expect(serverless.utils.fileExistsSync(testFileTarget)).to.be.equal(true);
    });
  });

  it('should use service package path as target', () => {
    const testFileSource = path.join(moveServerlessPath, 'moveTestFile.tmp');
    const targetPath = path.join(moveBasePath, 'target');

    serverless.service.package.path = targetPath;
    serverless.utils.writeFileSync(testFileSource, '!!!MOVE TEST FILE!!!');
    return awsCommon.moveArtifactsToPackage().then(() => {
      const testFileTarget = path.join(targetPath, 'moveTestFile.tmp');

      expect(serverless.utils.dirExistsSync(targetPath)).to.be.equal(true);
      expect(serverless.utils.fileExistsSync(testFileTarget)).to.be.equal(true);
    });
  });

  it('should not fail with non existing temp dir', () => {
    const targetPath = path.join(moveBasePath, 'target');

    if (serverless.utils.dirExistsSync(moveServerlessPath)) {
      fse.removeSync(moveServerlessPath);
    }

    setPackageOption(targetPath);
    return awsCommon.moveArtifactsToPackage().then(() => {
      expect(serverless.utils.dirExistsSync(targetPath)).to.be.equal(false);
    });
  });

  it('should not fail with existing package dir', () => {
    const testFileSource = path.join(moveServerlessPath, 'moveTestFile.tmp');
    const targetPath = path.join(moveBasePath, 'target');
    const testFileTarget = path.join(targetPath, 'moveTestFile.tmp');

    if (!serverless.utils.dirExistsSync(targetPath)) {
      serverless.utils.writeFileDir(targetPath);
      serverless.utils.writeFileSync(testFileTarget, '!!!MOVE TEST FILE!!!');
    }

    serverless.service.package.path = targetPath;
    serverless.utils.writeFileSync(testFileSource, '!!!MOVE TEST FILE!!!');
    return awsCommon.moveArtifactsToPackage().then(() => {
      expect(serverless.utils.dirExistsSync(targetPath)).to.be.equal(true);
      expect(serverless.utils.fileExistsSync(testFileTarget)).to.be.equal(true);
    });
  });
});

describe('#moveArtifactsToTemp()', () => {
  let serverless;
  let awsCommon;
  let setPackageOption;
  const moveBasePath = path.join(getTmpDirPath(), 'move');
  const moveServerlessPath = path.join(moveBasePath, '.serverless');
  const moveTargetPath = path.join(moveBasePath, 'target');

  beforeEach(() => {
    serverless = new Serverless();
    awsCommon = new AWSCommon(serverless, {});
    setPackageOption = setPackageOptionFn(serverless, awsCommon);

    serverless.config.servicePath = moveBasePath;
    if (!serverless.utils.dirExistsSync(moveTargetPath)) {
      serverless.utils.writeFileDir(moveTargetPath);
    }
  });

  afterEach(() => {
    if (serverless.utils.dirExistsSync(moveBasePath)) {
      fse.removeSync(moveBasePath);
    }
  });

  it('should resolve if servicePath is not present', () => {
    delete serverless.config.servicePath;
    return awsCommon.moveArtifactsToTemp();
  });

  it('should resolve if no package is set', () => awsCommon.moveArtifactsToTemp());

  it('should use package option as source path', () => {
    const testFileSource = path.join(moveTargetPath, 'moveTestFile.tmp');

    serverless.utils.writeFileSync(testFileSource, '!!!MOVE TEST FILE!!!');
    setPackageOption(moveTargetPath);
    return awsCommon.moveArtifactsToTemp().then(() => {
      const testFileTarget = path.join(moveServerlessPath, 'moveTestFile.tmp');

      expect(serverless.utils.dirExistsSync(moveServerlessPath)).to.be.equal(true);
      expect(serverless.utils.fileExistsSync(testFileTarget)).to.be.equal(true);
    });
  });

  it('should use package option as source path', () => {
    const testFileSource = path.join(moveTargetPath, 'moveTestFile.tmp');

    serverless.utils.writeFileSync(testFileSource, '!!!MOVE TEST FILE!!!');
    serverless.service.package.path = moveTargetPath;
    return awsCommon.moveArtifactsToTemp().then(() => {
      const testFileTarget = path.join(moveServerlessPath, 'moveTestFile.tmp');

      expect(serverless.utils.dirExistsSync(moveServerlessPath)).to.be.equal(true);
      expect(serverless.utils.fileExistsSync(testFileTarget)).to.be.equal(true);
    });
  });

  it('should not fail with non existing source path', () => {
    if (serverless.utils.dirExistsSync(moveTargetPath)) {
      fse.removeSync(moveTargetPath);
    }

    setPackageOption(moveTargetPath);
    return awsCommon.moveArtifactsToTemp().then(() => {
      expect(serverless.utils.dirExistsSync(moveTargetPath)).to.be.equal(false);
    });
  });

  it('should not fail with existing temp dir', () => {
    const testFileSource = path.join(moveServerlessPath, 'moveTestFile.tmp');
    const testFileTarget = path.join(moveTargetPath, 'moveTestFile.tmp');

    if (!serverless.utils.dirExistsSync(moveServerlessPath)) {
      serverless.utils.writeFileDir(moveServerlessPath);
      serverless.utils.writeFileSync(testFileSource, '!!!MOVE TEST FILE!!!');
    }

    serverless.service.package.path = moveTargetPath;
    serverless.utils.writeFileSync(testFileTarget, '!!!MOVE TEST FILE!!!');
    return awsCommon.moveArtifactsToTemp().then(() => {
      expect(serverless.utils.dirExistsSync(moveServerlessPath)).to.be.equal(true);
      expect(serverless.utils.fileExistsSync(testFileSource)).to.be.equal(true);
    });
  });
});
