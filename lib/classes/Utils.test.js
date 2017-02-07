'use strict';

const path = require('path');
const os = require('os');
const expect = require('chai').expect;
const fse = require('fs-extra');
const fs = require('fs');
const sinon = require('sinon');
const BbPromise = require('bluebird');
const proxyquire = require('proxyquire');
const Serverless = require('../../lib/Serverless');
const testUtils = require('../../tests/utils');
const serverlessVersion = require('../../package.json').version;

describe('Utils', () => {
  let utils;
  let serverless;
  let fetchStub;
  let Utils;

  beforeEach(() => {
    fetchStub = sinon.stub().returns(BbPromise.resolve());
    Utils = proxyquire('../../lib/classes/Utils.js', {
      'node-fetch': fetchStub,
    });
    serverless = new Serverless();
    utils = new Utils(serverless);
    serverless.init();
  });

  describe('#dirExistsSync()', () => {
    describe('When reading a directory', () => {
      it('should detect if a directory exists', () => {
        const dir = serverless.utils.dirExistsSync(__dirname);
        expect(dir).to.equal(true);
      });

      it('should detect if a directory doesn\'t exist', () => {
        const noDir = serverless.utils.dirExistsSync(path.join(__dirname, '..', 'XYZ'));
        expect(noDir).to.equal(false);
      });
    });
  });

  describe('#fileExistsSync()', () => {
    describe('When reading a file', () => {
      it('should detect if a file exists', () => {
        const file = serverless.utils.fileExistsSync(__filename);
        expect(file).to.equal(true);
      });

      it('should detect if a file doesn\'t exist', () => {
        const noFile = serverless.utils.fileExistsSync(path.join(__dirname, 'XYZ.json'));
        expect(noFile).to.equal(false);
      });
    });
  });

  describe('#writeFileDir()', () => {
    it('should create a directory for the path of the given file', () => {
      const tmpDirPath = testUtils.getTmpDirPath();
      const rootDir = serverless.utils
        .writeFileDir(path.join(tmpDirPath, 'foo', 'bar', 'somefile.js'));

      expect(serverless.utils.dirExistsSync(path.join(rootDir, 'foo', 'bar'))).to.equal(true);
      // it should only create the directories and not the file
      expect(serverless.utils.fileExistsSync(path.join(rootDir, 'foo', 'bar', 'somefile.js')))
        .to.equal(false);
    });
  });

  describe('#writeFileSync()', () => {
    it('should write a .json file synchronously', () => {
      const tmpFilePath = testUtils.getTmpFilePath('anything.json');

      serverless.utils.writeFileSync(tmpFilePath, { foo: 'bar' });
      const obj = serverless.utils.readFileSync(tmpFilePath);

      expect(obj.foo).to.equal('bar');
    });

    it('should write a .yml file synchronously', () => {
      const tmpFilePath = testUtils.getTmpFilePath('anything.yml');

      serverless.utils.writeFileSync(tmpFilePath, { foo: 'bar' });

      return serverless.yamlParser.parse(tmpFilePath).then((obj) => {
        expect(obj.foo).to.equal('bar');
      });
    });

    it('should write a .yaml file synchronously', () => {
      const tmpFilePath = testUtils.getTmpFilePath('anything.yaml');

      serverless.utils.writeFileSync(tmpFilePath, { foo: 'bar' });

      return serverless.yamlParser.parse(tmpFilePath).then((obj) => {
        expect(obj.foo).to.equal('bar');
      });
    });

    it('should throw error if invalid path is provided', () => {
      expect(() => { serverless.utils.writeFileSync(null); }).to.throw(Error);
    });
  });

  describe('#writeFile()', () => {
    it('should write a file asynchronously', () => {
      const tmpFilePath = testUtils.getTmpFilePath('anything.json');

      // note: use return when testing promises otherwise you'll have unhandled rejection errors
      return serverless.utils.writeFile(tmpFilePath, { foo: 'bar' }).then(() => {
        const obj = serverless.utils.readFileSync(tmpFilePath);

        expect(obj.foo).to.equal('bar');
      });
    });
  });

  describe('#appendFileSync()', () => {
    it('should append a line to a text file', () => {
      const tmpFilePath = testUtils.getTmpFilePath('appendedfile.txt');

      serverless.utils.writeFileSync(tmpFilePath, `line 1 ${os.EOL}`);
      serverless.utils.appendFileSync(tmpFilePath, 'line 2');

      const data = serverless.utils.readFileSync(tmpFilePath);
      expect(data.indexOf('line 1')).to.be.greaterThan(-1);
    });

    it('should throw error if invalid path is provided', () => {
      expect(() => { serverless.utils.readFileSync(null); }).to.throw(Error);
    });
  });

  describe('#readFileSync()', () => {
    it('should read a file synchronously', () => {
      const tmpFilePath = testUtils.getTmpFilePath('anything.json');

      serverless.utils.writeFileSync(tmpFilePath, { foo: 'bar' });
      const obj = serverless.utils.readFileSync(tmpFilePath);

      expect(obj.foo).to.equal('bar');
    });

    it('should read a filename extension .yml', () => {
      const tmpFilePath = testUtils.getTmpFilePath('anything.yml');

      serverless.utils.writeFileSync(tmpFilePath, { foo: 'bar' });
      const obj = serverless.utils.readFileSync(tmpFilePath);

      expect(obj.foo).to.equal('bar');
    });

    it('should read a filename extension .yaml', () => {
      const tmpFilePath = testUtils.getTmpFilePath('anything.yaml');

      serverless.utils.writeFileSync(tmpFilePath, { foo: 'bar' });
      const obj = serverless.utils.readFileSync(tmpFilePath);

      expect(obj.foo).to.equal('bar');
    });

    it('should throw YAMLException with filename if yml file is invalid format', () => {
      const tmpFilePath = testUtils.getTmpFilePath('invalid.yml');

      serverless.utils.writeFileSync(tmpFilePath, ': a');

      expect(() => {
        serverless.utils.readFileSync(tmpFilePath);
      }).to.throw(new RegExp('YAMLException:.*invalid.yml'));
    });
  });

  describe('#readFile()', () => {
    it('should read a file asynchronously', () => {
      const tmpFilePath = testUtils.getTmpFilePath('anything.json');

      serverless.utils.writeFileSync(tmpFilePath, { foo: 'bar' });

      // note: use return when testing promises otherwise you'll have unhandled rejection errors
      return serverless.utils.readFile(tmpFilePath).then((obj) => {
        expect(obj.foo).to.equal('bar');
      });
    });
  });

  describe('#walkDirSync()', () => {
    it('should return an array with corresponding paths to the found files', () => {
      const tmpDirPath = testUtils.getTmpDirPath();

      const nestedDir1 = path.join(tmpDirPath, 'foo');
      const nestedDir2 = path.join(tmpDirPath, 'foo', 'bar');
      const nestedDir3 = path.join(tmpDirPath, 'baz');

      const tmpFilePath1 = path.join(nestedDir1, 'foo.js');
      const tmpFilePath2 = path.join(nestedDir2, 'bar.js');
      const tmpFilePath3 = path.join(nestedDir3, 'baz.js');

      serverless.utils.writeFileSync(tmpFilePath1, 'foo');
      serverless.utils.writeFileSync(tmpFilePath2, 'bar');
      serverless.utils.writeFileSync(tmpFilePath3, 'baz');

      const filePaths = serverless.utils.walkDirSync(tmpDirPath);

      expect(filePaths).to.include(tmpFilePath1);
      expect(filePaths).to.include(tmpFilePath2);
      expect(filePaths).to.include(tmpFilePath3);
    });
  });

  describe('#copyDirContentsSync()', () => {
    it('recursively copy directory files', () => {
      const tmpSrcDirPath = path.join(process.cwd(), 'testSrc');
      const tmpDestDirPath = path.join(process.cwd(), 'testDest');

      const srcFile1 = path.join(tmpSrcDirPath, 'file1.txt');
      const srcFile2 = path.join(tmpSrcDirPath, 'folder', 'file2.txt');
      const srcFile3 = path.join(tmpSrcDirPath, 'folder', 'folder', 'file3.txt');

      const destFile1 = path.join(tmpDestDirPath, 'file1.txt');
      const destFile2 = path.join(tmpDestDirPath, 'folder', 'file2.txt');
      const destFile3 = path.join(tmpDestDirPath, 'folder', 'folder', 'file3.txt');

      serverless.utils.writeFileSync(srcFile1, 'foo');
      serverless.utils.writeFileSync(srcFile2, 'foo');
      serverless.utils.writeFileSync(srcFile3, 'foo');

      serverless.utils.copyDirContentsSync(tmpSrcDirPath, tmpDestDirPath);

      expect(serverless.utils.fileExistsSync(destFile1)).to.equal(true);
      expect(serverless.utils.fileExistsSync(destFile2)).to.equal(true);
      expect(serverless.utils.fileExistsSync(destFile3)).to.equal(true);
    });
  });

  describe('#generateShortId()', () => {
    it('should generate a shortId', () => {
      const id = serverless.utils.generateShortId();
      expect(id).to.be.a('string');
    });

    it('should generate a shortId for the given length', () => {
      const id = serverless.utils.generateShortId(6);
      expect(id.length).to.be.equal(6);
    });
  });

  describe('#findServicePath()', () => {
    const testDir = process.cwd();

    it('should detect if the CWD is a service directory when using Serverless .yaml files', () => {
      const tmpDirPath = testUtils.getTmpDirPath();
      const tmpFilePath = path.join(tmpDirPath, 'serverless.yaml');

      serverless.utils.writeFileSync(tmpFilePath, 'foo');
      process.chdir(tmpDirPath);

      const servicePath = serverless.utils.findServicePath();

      expect(servicePath).to.not.equal(null);
    });

    it('should detect if the CWD is a service directory when using Serverless .yml files', () => {
      const tmpDirPath = testUtils.getTmpDirPath();
      const tmpFilePath = path.join(tmpDirPath, 'serverless.yml');

      serverless.utils.writeFileSync(tmpFilePath, 'foo');
      process.chdir(tmpDirPath);

      const servicePath = serverless.utils.findServicePath();

      expect(servicePath).to.not.equal(null);
    });

    it('should detect if the CWD is not a service directory', () => {
      // just use the root of the tmpdir because findServicePath will
      // also check parent directories (and may find matching tmp dirs
      // from old tests)
      const tmpDirPath = os.tmpdir();
      process.chdir(tmpDirPath);

      const servicePath = serverless.utils.findServicePath();

      expect(servicePath).to.equal(null);
    });

    afterEach(() => {
      // always switch back to the test directory
      // so that we have a clean state
      process.chdir(testDir);
    });
  });

  describe('#logStat()', () => {
    let serverlessDirPath;
    let homeDir;

    beforeEach(() => {
      serverless.init();

      // create a new tmpDir for the homeDir path
      const tmpDirPath = testUtils.getTmpDirPath();
      fse.mkdirsSync(tmpDirPath);

      // save the homeDir so that we can reset this later on
      homeDir = os.homedir();
      process.env.HOME = tmpDirPath;
      process.env.HOMEPATH = tmpDirPath;
      process.env.USERPROFILE = tmpDirPath;

      serverlessDirPath = path.join(os.homedir(), '.serverless');

      // set the properties for the processed inputs
      serverless.processedInput.commands = [];
      serverless.processedInput.options = {};
    });

    it('should resolve if a file called stats-disabled is present', () => {
      // create a stats-disabled file
      serverless.utils.writeFileSync(
        path.join(serverlessDirPath, 'stats-disabled'),
        'some content'
      );

      return utils.logStat(serverless).then(() => {
        expect(fetchStub.calledOnce).to.equal(false);
      });
    });

    it('should create a new file with a stats id if not found', () => {
      const statsFilePath = path.join(serverlessDirPath, 'stats-enabled');

      return serverless.utils.logStat(serverless).then(() => {
        expect(fs.readFileSync(statsFilePath).toString().length).to.be.above(1);
      });
    });

    it('should re-use an existing file which contains the stats id if found', () => {
      const statsFilePath = path.join(serverlessDirPath, 'stats-enabled');
      const statsId = 'some-id';

      // create a new file with a stats id
      fse.ensureFileSync(statsFilePath);
      fs.writeFileSync(statsFilePath, statsId);

      return serverless.utils.logStat(serverless).then(() => {
        expect(fs.readFileSync(statsFilePath).toString()).to.be.equal(statsId);
      });
    });

    it('should filter out whitelisted options', () => {
      const options = {
        help: true, // this should appear as it's whitelisted
        confidential: 'some confidential input', // this should be dropped
      };

      // help is a whitelisted option
      serverless.processedInput.options = options;

      return utils.logStat(serverless).then(() => {
        expect(fetchStub.calledOnce).to.equal(true);
        expect(fetchStub.args[0][0]).to.equal('https://api.segment.io/v1/track');
        expect(fetchStub.args[0][1].method).to.equal('POST');
        expect(fetchStub.args[0][1].timeout).to.equal('1000');

        const parsedBody = JSON.parse(fetchStub.args[0][1].body);

        expect(parsedBody.properties.command.filteredOptions)
          .to.deep.equal({ help: true });
      });
    });

    it('should be able to detect Docker containers', () => {
      const cgroupFileContent = '6:devices:/docker/3601745b3bd54d9780436faa5f0e4f72';
      const cgroupFilePath = path.join('/', 'proc', '1', 'cgroup');
      const cgroupFileContentStub = sinon.stub(fs, 'readFileSync')
        .withArgs(cgroupFilePath)
        .returns(cgroupFileContent);

      utils.logStat(serverless).then(() => {
        expect(cgroupFileContentStub.calledOnce).to.equal(true);

        const parsedBody = JSON.parse(fetchStub.args[0][1].body);

        expect(parsedBody.properties.general.isDockerContainer)
          .to.equal(true);

        fs.readFileSync.restore();
      });
    });

    it('should send the gathered information', () => {
      serverless.service = {
        service: 'new-service',
        provider: {
          name: 'aws',
          runtime: 'nodejs4.3',
          stage: 'dev',
          region: 'us-east-1',
          variableSyntax: '\\${foo}',
        },
        plugins: [],
        functions: {
          functionOne: {
            events: [
              {
                http: {
                  path: 'foo',
                  method: 'GET',
                },
              },
              {
                s3: 'my.bucket',
              },
            ],
          },
          functionTwo: {
            memorySize: 16,
            timeout: 200,
            events: [
              {
                http: 'GET bar',
              },
              {
                sns: 'my-topic-name',
              },
            ],
          },
        },
        resources: {
          Resources: {
            foo: 'bar',
          },
        },
      };

      return utils.logStat(serverless).then(() => {
        expect(fetchStub.calledOnce).to.equal(true);
        expect(fetchStub.args[0][0]).to.equal('https://api.segment.io/v1/track');
        expect(fetchStub.args[0][1].method).to.equal('POST');
        expect(fetchStub.args[0][1].timeout).to.equal('1000');

        const parsedBody = JSON.parse(fetchStub.args[0][1].body);

        expect(parsedBody.userId.length).to.be.at.least(1);
        // command property
        expect(parsedBody.properties.command.name)
          .to.equal('');
        expect(parsedBody.properties.command
          .isRunInService).to.equal(false); // false because CWD is not a service
        expect(parsedBody.properties.command.filteredOptions)
          .to.deep.equal({});
        // service property
        expect(parsedBody.properties.service.numberOfCustomPlugins).to.equal(0);
        expect(parsedBody.properties.service.hasCustomResourcesDefined).to.equal(true);
        expect(parsedBody.properties.service.hasVariablesInCustomSectionDefined).to.equal(false);
        expect(parsedBody.properties.service.hasCustomVariableSyntaxDefined).to.equal(true);
        // functions property
        expect(parsedBody.properties.functions.numberOfFunctions).to.equal(2);
        expect(parsedBody.properties.functions.memorySizeAndTimeoutPerFunction[0]
          .memorySize).to.equal(1024);
        expect(parsedBody.properties.functions.memorySizeAndTimeoutPerFunction[0]
          .timeout).to.equal(6);
        expect(parsedBody.properties.functions.memorySizeAndTimeoutPerFunction[1]
          .memorySize).to.equal(16);
        expect(parsedBody.properties.functions.memorySizeAndTimeoutPerFunction[1]
          .timeout).to.equal(200);
        // events property
        expect(parsedBody.properties.events.numberOfEvents).to.equal(3);
        expect(parsedBody.properties.events.numberOfEventsPerType[0].name).to.equal('http');
        expect(parsedBody.properties.events.numberOfEventsPerType[0].count).to.equal(2);
        expect(parsedBody.properties.events.numberOfEventsPerType[1].name).to.equal('s3');
        expect(parsedBody.properties.events.numberOfEventsPerType[1].count).to.equal(1);
        expect(parsedBody.properties.events.numberOfEventsPerType[2].name).to.equal('sns');
        expect(parsedBody.properties.events.numberOfEventsPerType[2].count).to.equal(1);
        expect(parsedBody.properties.events.eventNamesPerFunction[0][0]).to.equal('http');
        expect(parsedBody.properties.events.eventNamesPerFunction[0][1]).to.equal('s3');
        expect(parsedBody.properties.events.eventNamesPerFunction[1][0]).to.equal('http');
        expect(parsedBody.properties.events.eventNamesPerFunction[1][1]).to.equal('sns');
        // general property
        expect(parsedBody.properties.general.userId.length).to.be.at.least(1);
        expect(parsedBody.properties.general.timestamp).to.match(/[0-9]+/);
        expect(parsedBody.properties.general.timezone.length).to.be.at.least(1);
        expect(parsedBody.properties.general.operatingSystem.length).to.be.at.least(1);
        expect(parsedBody.properties.general.serverlessVersion).to.equal(serverlessVersion);
        expect(parsedBody.properties.general.nodeJsVersion.length).to.be.at.least(1);
      });
    });

    afterEach(() => {
      // recover the homeDir
      process.env.HOME = homeDir;
      process.env.HOMEPATH = homeDir;
      process.env.USERPROFILE = homeDir;
    });
  });
});
