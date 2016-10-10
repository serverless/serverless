'use strict';

const expect = require('chai').expect;
const fs = require('fs');
const os = require('os');
const path = require('path');
const JsZip = require('jszip');
const _ = require('lodash');
const Package = require('../index');
const Serverless = require('../../../../lib/Serverless');
const testUtils = require('../../../../tests/utils');

describe('#zipService()', () => {
  let serverless;
  let packageService;
  let zip;
  let servicePath;

  const testDirectory = {
    '.': {
      'a-serverless-plugin.js': 'a-serverless-plugin.js file content',
      'handler.js': 'handler.js file content',
      'exclude-me.js': 'exclude-me.js file content',
      'include-me.js': 'include-me.js file content',
    },
    bin: {
      'some-binary': {
        content: 'some-binary executable file content',
        permissions: 777,
      },
      'read-only': {
        content: 'read-only executable file content',
        permissions: 444,
      },
    },
    'node_modules/include-me': {
      include: 'some-file-content',
      'include-aswell': 'some-file content',
    },
    'node_modules/exclude-me': {
      exclude: 'some-file-content',
      'exclude-aswell': 'some-file content',
    },
    'exclude-me': {
      'some-file': 'some-file content',
    },
    'include-me': {
      'some-file': 'some-file content',
    },
    lib: {
      'function.js': 'function.js file content',
    },
  };

  function getTestArtifactFileName(testName) {
    return `test-${testName}-${(new Date()).getTime().toString()}.zip`;
  }

  beforeEach(() => {
    serverless = new Serverless();
    zip = new JsZip();
    packageService = new Package(serverless);
    packageService.serverless.cli = new serverless.classes.CLI();

    // create a mock service in a temporary directory
    const tmpDirPath = testUtils.getTmpDirPath();

    Object.keys(testDirectory).forEach(dirName => {
      const dirPath = path.join(tmpDirPath, dirName);
      const files = testDirectory[dirName];

      Object.keys(files).forEach(fileName => {
        const filePath = path.join(dirPath, fileName);
        const fileValue = files[fileName];
        const file = _.isObject(fileValue) ? fileValue : { content: fileValue };

        if (!file.content) {
          throw new Error('File content is required');
        }

        serverless.utils.writeFileSync(filePath, file.content);

        if (file.permissions) {
          fs.chmodSync(filePath, file.permissions);
        }
      });
    });
    // set the service name
    serverless.service.service = 'first-service';

    // set the servicePath
    servicePath = tmpDirPath;
  });

  it('should zip a whole service', () => {
    const exclude = [];
    const zipFileName = getTestArtifactFileName('whole-service');

    return packageService
      .zipDirectory(servicePath, exclude, zipFileName).then((artifact) => {
        const data = fs.readFileSync(artifact);

        return zip.loadAsync(data);
      }).then(unzippedData => {
        const unzippedFileData = unzippedData.files;

        expect(Object.keys(unzippedFileData)
               .filter(file => !unzippedFileData[file].dir).length).to.equal(13);

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

        expect(unzippedFileData['node_modules/include-me/include'].name)
          .to.equal('node_modules/include-me/include');

        expect(unzippedFileData['node_modules/include-me/include-aswell'].name)
          .to.equal('node_modules/include-me/include-aswell');

        expect(unzippedFileData['node_modules/exclude-me/exclude'].name)
          .to.equal('node_modules/exclude-me/exclude');

        expect(unzippedFileData['node_modules/exclude-me/exclude-aswell'].name)
          .to.equal('node_modules/exclude-me/exclude-aswell');
      });
  });

  it('should keep file permissions', () => {
    const exclude = [];
    const zipFileName = getTestArtifactFileName('file-permissions');

    return packageService.zipDirectory(servicePath, exclude, zipFileName)
      .then((artifact) => {
        const data = fs.readFileSync(artifact);
        return zip.loadAsync(data);
      }).then(unzippedData => {
        const unzippedFileData = unzippedData.files;

        if (os.platform() === 'win32') {
          // chmod does not work right on windows. this is better than nothing?
          expect(unzippedFileData['bin/some-binary'].unixPermissions)
            .to.not.equal(unzippedFileData['bin/read-only'].unixPermissions);
        } else {
          // binary file is set with chmod of 777
          expect(unzippedFileData['bin/some-binary'].unixPermissions)
            .to.equal(Math.pow(2, 15) + 777);

          // read only file is set with chmod of 444
          expect(unzippedFileData['bin/read-only'].unixPermissions)
            .to.equal(Math.pow(2, 15) + 444);
        }
      });
  });

  it('should exclude globs', () => {
    const exclude = [
      'exclude-me*/**',
      'node_modules/exclude-me/**',
    ];

    const zipFileName = getTestArtifactFileName('re-include');

    return packageService.zipDirectory(servicePath, exclude, zipFileName)
    .then((artifact) => {
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

      expect(unzippedFileData['a-serverless-plugin.js'].name)
        .to.equal('a-serverless-plugin.js');

      expect(unzippedFileData['node_modules/include-me/include'].name)
        .to.equal('node_modules/include-me/include');

      expect(unzippedFileData['node_modules/include-me/include-aswell'].name)
        .to.equal('node_modules/include-me/include-aswell');
    });
  });
});
