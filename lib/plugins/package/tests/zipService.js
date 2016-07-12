'use strict';

const expect = require('chai').expect;
const fs = require('fs');
const path = require('path');
const os = require('os');
const Zip = require('node-zip');
const Package = require('../index');
const Serverless = require('../../../../lib/Serverless');

describe('#zipService()', () => {
  let serverless;
  let packageService;
  let zip;

  beforeEach(() => {
    serverless = new Serverless();
    zip = new Zip();
    packageService = new Package(serverless);
    packageService.serverless.cli = new serverless.classes.CLI();

    // create a mock service in a temporary directory
    const tmpDirPath = path.join(os.tmpdir(), (new Date).getTime().toString());
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
    // serverless.yaml
    const serverlessYamlFilePath = path.join(tmpDirPath, 'serverless.yaml');
    serverless.utils.writeFileSync(serverlessYamlFilePath, 'serverless.yaml file content');
    // serverless.env.yaml
    const serverlessEnvYamlFilePath = path.join(tmpDirPath, 'serverless.env.yaml');
    serverless.utils.writeFileSync(serverlessEnvYamlFilePath, 'serverless.env.yaml file content');
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

      const unzippedFileData = zip.load(data).files;

      expect(Object.keys(unzippedFileData).length).to.equal(7);

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

      expect(unzippedFileData['include-me/some-file'].name)
        .to.equal('include-me/some-file');

      expect(unzippedFileData['a-serverless-plugin.js'].name)
        .to.equal('a-serverless-plugin.js');
    })
  );

  it('should resolve if the user has specified his own artifact', (done) => {
    // create an artifact in a temp directory
    const tmpDirPath = path.join(os.tmpdir(), (new Date).getTime().toString());
    const handlerPath = path.join(tmpDirPath, 'handler.js');
    serverless.utils.writeFileSync(handlerPath, 'handler.js file content');
    packageService.serverless.utils.walkDirSync(tmpDirPath).forEach((filePath) => {
      const relativeFilePath = path.relative(tmpDirPath, filePath);
      zip.file(relativeFilePath, fs.readFileSync(filePath));
    });
    const data = zip.generate({ base64: false, compression: 'DEFLATE' });
    const artifactFilePath = path.join(tmpDirPath, 'artifact.zip');
    fs.writeFileSync(artifactFilePath, data, 'binary');

    packageService.serverless.service.package.artifact = artifactFilePath;

    return packageService.zipService().then(() => {
      done();
    });
  });

  it('should exclude defined files and folders', () => {
    packageService.serverless.service.package.exclude = ['exclude-me.js', 'exclude-me'];

    return packageService.zipService().then(() => {
      const artifact = packageService.serverless.service.package.artifact;
      const data = fs.readFileSync(artifact);

      const unzippedFileData = zip.load(data).files;

      expect(Object.keys(unzippedFileData).length).to.equal(5);

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

      const unzippedFileData = zip.load(data).files;

      expect(Object.keys(unzippedFileData).length).to.equal(7);

      expect(unzippedFileData['.gitignore'])
        .to.be.equal(undefined);

      expect(unzippedFileData['.DS_Store'])
        .to.be.equal(undefined);

      expect(unzippedFileData['serverless.yaml'])
        .to.be.equal(undefined);

      expect(unzippedFileData['serverless.env.yaml'])
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

      const unzippedFileData = zip.load(data).files;

      expect(Object.keys(unzippedFileData).length).to.equal(7);

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
