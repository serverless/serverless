'use strict';

const expect = require('chai').expect;
const fs = require('fs');
const path = require('path');
const os = require('os');
const JsZip = require('jszip');
const _ = require('lodash');
const Package = require('../index');
const Serverless = require('../../../../lib/Serverless');

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
    const tmpDirPath = path.join(os.tmpdir(), (new Date()).getTime().toString());

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
    const include = [];
    const zipFileName = getTestArtifactFileName('whole-service');

    return packageService
      .zipDirectory(servicePath, exclude, include, zipFileName).then((artifact) => {
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
      });
  });

  it('should keep file permissions', () => {
    const exclude = [];
    const include = [];
    const zipFileName = getTestArtifactFileName('file-permissions');

    return packageService.zipDirectory(servicePath, exclude, include, zipFileName)
      .then((artifact) => {
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
      });
  });

  it('should exclude defined files and folders', () => {
    const exclude = ['exclude-me.js', 'exclude-me'];
    const include = [];
    const zipFileName = getTestArtifactFileName('exclude');

    return packageService.zipDirectory(servicePath, exclude, include, zipFileName)
    .then((artifact) => {
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

  it('should include a previously excluded file', () => {
    const exclude = ['exclude-me.js', 'exclude-me'];
    const include = ['exclude-me.js', 'exclude-me'];
    const zipFileName = getTestArtifactFileName('re-include');

    return packageService.zipDirectory(servicePath, exclude, include, zipFileName)
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

      expect(unzippedFileData['exclude-me.js'].name)
        .to.equal('exclude-me.js');

      expect(unzippedFileData['exclude-me/some-file'].name)
        .to.equal('exclude-me/some-file');

      expect(unzippedFileData['a-serverless-plugin.js'].name)
        .to.equal('a-serverless-plugin.js');
    });
  });
});
