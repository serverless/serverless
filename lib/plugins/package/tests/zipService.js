'use strict';

const expect = require('chai').expect;
const fs = require('fs');
const path = require('path');
const JsZip = require('jszip');
const Package = require('../index');
const Serverless = require('../../../../lib/Serverless');
const testUtils = require('../../../../tests/utils');

describe('#zipService()', () => {
  let serverless;
  let packageService;
  let zip;

  beforeEach(() => {
    serverless = new Serverless();
    zip = new JsZip();
    packageService = new Package(serverless);
    packageService.serverless.cli = new serverless.classes.CLI();

    // create a mock service in a temporary directory
    const tmpDirPath = testUtils.getTmpDirPath();
    const handlerPath = path.join(tmpDirPath, 'handler.js');
    serverless.utils.writeFileSync(handlerPath, 'handler.js file content');
    const nestedFunctionPath = path.join(tmpDirPath, 'lib', 'function.js');
    serverless.utils.writeFileSync(nestedFunctionPath, 'function.js content');
    // create the files and folders which should be excluded
    const excludeMeDirectoryPath = path.join(tmpDirPath, 'exclude-me', 'some-file');
    serverless.utils.writeFileSync(excludeMeDirectoryPath, 'some-file content');
    const excludeMeFilePath = path.join(tmpDirPath, 'exclude-me.js');
    serverless.utils.writeFileSync(excludeMeFilePath, 'exclude-me.js file content');
    // create the files and folders which should be included
    const includeMeDirectoryPath = path.join(tmpDirPath, 'include-me', 'some-file');
    serverless.utils.writeFileSync(includeMeDirectoryPath, 'some-file content');
    const includeMeFilePath = path.join(tmpDirPath, 'include-me.js');
    serverless.utils.writeFileSync(includeMeFilePath, 'include-me.js file content');
    // create a executable file
    const executableFilePath = path.join(tmpDirPath, 'bin/some-binary');
    serverless.utils.writeFileSync(executableFilePath, 'some-binary executable file content');
    fs.chmodSync(executableFilePath, 777);
    // create a readonly file
    const readOnlyFilePath = path.join(tmpDirPath, 'bin/read-only');
    serverless.utils.writeFileSync(readOnlyFilePath, 'read-only executable file content');
    fs.chmodSync(readOnlyFilePath, 444);
    // a serverless plugin that should be included
    const includeMe2FilePath = path.join(tmpDirPath, 'a-serverless-plugin.js');
    serverless.utils.writeFileSync(includeMe2FilePath, 'a-serverless-plugin.js file content');
    // create the files and folder which should be ignored by default
    // .gitignore
    const gitignoreFilePath = path.join(tmpDirPath, '.gitignore');
    serverless.utils.writeFileSync(gitignoreFilePath, 'content');
    // .DS_Store
    const dsStoreFilePath = path.join(tmpDirPath, '.DS_Store');
    serverless.utils.writeFileSync(dsStoreFilePath, 'content');
    // serverless.yml
    const serverlessYmlFilePath = path.join(tmpDirPath, 'serverless.yml');
    serverless.utils.writeFileSync(serverlessYmlFilePath, 'serverless.yml file content');
    // serverless.env.yml
    const serverlessEnvYmlFilePath = path.join(tmpDirPath, 'serverless.env.yml');
    serverless.utils.writeFileSync(serverlessEnvYmlFilePath, 'serverless.env.yml file content');
    // .git
    const gitFilePath = path.join(path.join(tmpDirPath, '.git'), 'some-git-file');
    serverless.utils.writeFileSync(gitFilePath, 'some-git-file content');

    // set the service name
    serverless.service.service = 'first-service';

    // set the servicePath
    serverless.config.servicePath = tmpDirPath;
  });

  it('should zip a whole service', () => packageService
    .zipService().then(() => {
      const artifact = packageService.serverless.service.package.artifact;
      const data = fs.readFileSync(artifact);

      return zip.loadAsync(data);
    }).then(unzippedData => {
      const unzippedFileData = unzippedData.files;

      expect(Object.keys(unzippedFileData)
             .filter(file => !unzippedFileData[file].dir).length).to.equal(9);

      expect(unzippedFileData['handler.js'].name)
        .to.equal('handler.js');

      expect(unzippedFileData['lib/function.js'].name)
        .to.equal('lib/function.js');

      expect(unzippedFileData['exclude-me.js'].name)
        .to.equal('exclude-me.js');

      expect(unzippedFileData['exclude-me/some-file'].name)
        .to.equal('exclude-me/some-file');

      expect(unzippedFileData['include-me.js'].name)
        .to.equal('include-me.js');

      expect(unzippedFileData['bin/some-binary'].name)
        .to.equal('bin/some-binary');
      expect(unzippedFileData['bin/read-only'].name)
        .to.equal('bin/read-only');

      expect(unzippedFileData['include-me/some-file'].name)
        .to.equal('include-me/some-file');

      expect(unzippedFileData['a-serverless-plugin.js'].name)
        .to.equal('a-serverless-plugin.js');
    })
  );

  it('should keep file permissions', () => packageService
    .zipService().then(() => {
      const artifact = packageService.serverless.service.package.artifact;
      const data = fs.readFileSync(artifact);

      return zip.loadAsync(data);
    }).then(unzippedData => {
      const unzippedFileData = unzippedData.files;

      // binary file is set with chmod of 777
      expect(unzippedFileData['bin/some-binary'].unixPermissions)
        .to.equal(Math.pow(2, 15) + 777);

      // read only file is set with chmod of 444
      expect(unzippedFileData['bin/read-only'].unixPermissions)
        .to.equal(Math.pow(2, 15) + 444);
    })
  );

  it('should resolve if the user has specified his own artifact', (done) => {
    // create an artifact in a temp directory
    const tmpDirPath = testUtils.getTmpDirPath();
    const handlerPath = path.join(tmpDirPath, 'handler.js');
    serverless.utils.writeFileSync(handlerPath, 'handler.js file content');
    packageService.serverless.utils.walkDirSync(tmpDirPath).forEach((filePath) => {
      const relativeFilePath = path.relative(tmpDirPath, filePath);
      zip.file(relativeFilePath, fs.readFileSync(filePath));
    });
    zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }).then(data => {
      const artifactFilePath = path.join(tmpDirPath, 'artifact.zip');
      fs.writeFileSync(artifactFilePath, data, 'binary');

      packageService.serverless.service.package.artifact = artifactFilePath;

      return packageService.zipService();
    }).then(() => {
      done();
    });
  });

  it('should exclude defined files and folders', () => {
    packageService.serverless.service.package.exclude = ['exclude-me.js', 'exclude-me'];

    return packageService.zipService().then(() => {
      const artifact = packageService.serverless.service.package.artifact;
      const data = fs.readFileSync(artifact);

      return zip.loadAsync(data);
    }).then(unzippedData => {
      const unzippedFileData = unzippedData.files;

      expect(Object.keys(unzippedFileData)
             .filter(file => !unzippedFileData[file].dir).length).to.equal(7);

      expect(unzippedFileData['handler.js'].name)
        .to.equal('handler.js');

      expect(unzippedFileData['lib/function.js'].name)
        .to.equal('lib/function.js');

      expect(unzippedFileData['include-me.js'].name)
        .to.equal('include-me.js');

      expect(unzippedFileData['include-me/some-file'].name)
        .to.equal('include-me/some-file');

      expect(unzippedFileData['a-serverless-plugin.js'].name)
        .to.equal('a-serverless-plugin.js');
    });
  });

  it('should exclude predefined files and folders (e.g. like .git)', () => packageService
    .zipService().then(() => {
      const artifact = packageService.serverless.service.package.artifact;
      const data = fs.readFileSync(artifact);

      return zip.loadAsync(data);
    }).then(unzippedData => {
      const unzippedFileData = unzippedData.files;

      expect(Object.keys(unzippedFileData)
             .filter(file => !unzippedFileData[file].dir).length).to.equal(9);

      expect(unzippedFileData['.gitignore'])
        .to.be.equal(undefined);

      expect(unzippedFileData['.DS_Store'])
        .to.be.equal(undefined);

      expect(unzippedFileData['serverless.yml'])
        .to.be.equal(undefined);

      expect(unzippedFileData['serverless.env.yml'])
        .to.be.equal(undefined);

      expect(unzippedFileData['.git/some-git-file'])
        .to.equal(undefined);
    })
  );

  it('should include a previously excluded file', () => {
    packageService.serverless.service.package.exclude = ['exclude-me.js', 'exclude-me'];
    packageService.serverless.service.package.include = ['exclude-me.js', 'exclude-me'];

    return packageService.zipService().then(() => {
      const artifact = packageService.serverless.service.package.artifact;
      const data = fs.readFileSync(artifact);

      return zip.loadAsync(data);
    }).then(unzippedData => {
      const unzippedFileData = unzippedData.files;

      expect(Object.keys(unzippedFileData)
             .filter(file => !unzippedFileData[file].dir).length).to.equal(9);

      expect(unzippedFileData['handler.js'].name)
        .to.equal('handler.js');

      expect(unzippedFileData['lib/function.js'].name)
        .to.equal('lib/function.js');

      expect(unzippedFileData['include-me.js'].name)
        .to.equal('include-me.js');

      expect(unzippedFileData['include-me/some-file'].name)
        .to.equal('include-me/some-file');

      expect(unzippedFileData['exclude-me.js'].name)
        .to.equal('exclude-me.js');

      expect(unzippedFileData['exclude-me/some-file'].name)
        .to.equal('exclude-me/some-file');

      expect(unzippedFileData['a-serverless-plugin.js'].name)
        .to.equal('a-serverless-plugin.js');
    });
  });
});
