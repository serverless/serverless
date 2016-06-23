'use strict';

const expect = require('chai').expect;
const path = require('path');
const os = require('os');
const AwsDeploy = require('../index');
const Serverless = require('../../../../Serverless');
const Zip = require('node-zip');
const sinon = require('sinon');
const BbPromise = require('bluebird');

describe('deployFunctions', () => {
  let serverless;
  let awsDeploy;
  let zip;

  const functionsObjectMock = {
    name_template: 'name-template-name',
    first: {
      handler: 'first.function.handler',
      exclude: [
        'foo',
        'bar.js',
      ],
      include: [
        'bar.js', // should be included even if it's excluded
        'includeme',
      ],
    },
    second: {
      handler: 'second.function.handler',
      exclude: [
        'baz',
        'qux.js',
      ],
      include: [
        'qux.js', // should be included even if it's excluded
        'includeme',
      ],
    },
  };

  const simpleDeployedFunctionsArrayMock = [
    {
      name: 'function',
      handler: 'function.handler',
      exclude: [
        'foo',
        'bar.js',
      ],
    },
  ];

  const nestedDeployedFunctionsArrayMock = [
    {
      name: 'function',
      handler: 'nested/function.handler',
      exclude: [
        'foo',
        'bar.js',
      ],
    },
  ];

  const includeExcludedFileDeployedFunctionsArrayMock = [
    {
      name: 'function',
      handler: 'function.handler',
      exclude: [
        'bar.js',
      ],
      include: [
        'bar.js',
      ],
    },
  ];

  const functionCodeMock = `
    'use strict';

    module.exports.handler = function(event, context, cb) {
      return cb(null, {
        message: 'First function'
      });
    };
  `;

  beforeEach(() => {
    serverless = new Serverless();
    zip = new Zip();
    const options = {
      stage: 'dev',
      region: 'us-east-1',
    };
    awsDeploy = new AwsDeploy(serverless, options);
    awsDeploy.serverless.cli = new serverless.classes.CLI();
  });

  describe('#extractFunctionHandlers()', () => {
    beforeEach(() => {
      serverless.service.functions = functionsObjectMock;
    });

    it('should extract all the handlers in the function definitions', () => awsDeploy
      .extractFunctionHandlers().then(() => {
        expect(
          awsDeploy.deployedFunctions[0].handler
        ).to.equal(functionsObjectMock.first.handler);
        expect(
          awsDeploy.deployedFunctions[1].handler
        ).to.equal(functionsObjectMock.second.handler);
      })
    );

    it('should extract the exclude array in the function definitions', () => awsDeploy
      .extractFunctionHandlers().then(() => {
        expect(
          awsDeploy.deployedFunctions[0].exclude
        ).to.include('foo');
        expect(
          awsDeploy.deployedFunctions[0].exclude
        ).to.include('bar.js');

        expect(
          awsDeploy.deployedFunctions[1].exclude
        ).to.include('baz');
        expect(
          awsDeploy.deployedFunctions[1].exclude
        ).to.include('qux.js');
      })
    );

    it('should extract the include array in the functions definitions', () => awsDeploy
      .extractFunctionHandlers().then(() => {
        expect(
          awsDeploy.deployedFunctions[0].include
        ).to.include('bar.js');
        expect(
          awsDeploy.deployedFunctions[0].include
        ).to.include('includeme');

        expect(
          awsDeploy.deployedFunctions[1].include
        ).to.include('qux.js');
        expect(
          awsDeploy.deployedFunctions[1].include
        ).to.include('includeme');
      })
    );
  });

  describe('#zipFunctions()', () => {
    it('should zip a simple function', () => {
      awsDeploy.deployedFunctions = simpleDeployedFunctionsArrayMock;

      const functionFileNameBase = 'function';

      // create a function in a temporary directory
      const tmpDirPath = path.join(os.tmpdir(), (new Date).getTime().toString());
      const tmpFilePath = path.join(tmpDirPath, `${functionFileNameBase}.js`);
      serverless.utils.writeFileSync(tmpFilePath, functionCodeMock);

      // set the servicePath
      serverless.config.servicePath = tmpDirPath;

      return awsDeploy.zipFunctions().then(() => {
        expect(typeof awsDeploy.deployedFunctions[0].zipFileData).to.not.equal('undefined');

        // look into the zippedFileData
        const unzippedFileData = zip.load(awsDeploy.deployedFunctions[0].zipFileData);

        expect(unzippedFileData.files[`${functionFileNameBase}.js`].name)
          .to.equal(`${functionFileNameBase}.js`);
        expect(unzippedFileData.files[`${functionFileNameBase}.js`].dir).to.equal(false);
      });
    });

    it('should zip nested code', () => {
      // set the deployedFunctions array
      awsDeploy.deployedFunctions = nestedDeployedFunctionsArrayMock;

      const functionFileNameBase = 'function';

      // create a function in a temporary directory --> nested/function.js
      const tmpDirPath = path.join(os.tmpdir(), (new Date).getTime().toString(), 'nested');
      const tmpFilePath = path.join(tmpDirPath, `${functionFileNameBase}.js`);

      serverless.utils.writeFileSync(tmpFilePath, functionCodeMock);

      // add a lib directory on the same level where the "nested" directory lives --> lib/some-file
      const libDirectory = path.join(tmpDirPath, '..', 'lib');
      serverless.utils.writeFileSync(path.join(libDirectory, 'some-file'), 'content');

      // set the servicePath
      serverless.config.servicePath = tmpDirPath;

      return awsDeploy.zipFunctions().then(() => {
        expect(typeof awsDeploy.deployedFunctions[0].zipFileData).to.not.equal('undefined');

        // look into the zippedFileData
        const unzippedFileData = zip.load(awsDeploy.deployedFunctions[0].zipFileData);

        expect(unzippedFileData.files[`nested/${functionFileNameBase}.js`].name)
          .to.equal(`nested/${functionFileNameBase}.js`);
        expect(unzippedFileData.files[`nested/${functionFileNameBase}.js`].dir)
          .to.equal(false);

        expect(unzippedFileData.files['lib/some-file'].name)
          .to.equal('lib/some-file');
        expect(unzippedFileData.files['lib/some-file'].dir)
          .to.equal(false);
      });
    });

    it('should exclude defined files and folders', () => {
      awsDeploy.deployedFunctions = simpleDeployedFunctionsArrayMock;

      const functionFileNameBase = 'function';

      // create a function in a temporary directory
      const tmpDirPath = path.join(os.tmpdir(), (new Date).getTime().toString());
      const tmpFilePath = path.join(tmpDirPath, `${functionFileNameBase}.js`);
      serverless.utils.writeFileSync(tmpFilePath, functionCodeMock);

      // create a folder with the name "foo" which also includes a file --> foo/baz.txt
      serverless.utils.writeFileSync(path.join(tmpDirPath, 'foo', 'baz.txt'), 'content');

      // create a file with the name "bar.js" --> bar.js
      serverless.utils.writeFileSync(path.join(tmpDirPath, 'bar.js'), 'content');

      // set the servicePath
      serverless.config.servicePath = tmpDirPath;

      return awsDeploy.zipFunctions().then(() => {
        // look into the zippedFileData
        const unzippedFileData = zip.load(awsDeploy.deployedFunctions[0].zipFileData);

        expect(unzippedFileData.files[`${functionFileNameBase}.js`].name)
          .to.equal(`${functionFileNameBase}.js`);
        expect(unzippedFileData.files[`${functionFileNameBase}.js`].dir).to.equal(false);

        expect(unzippedFileData.files['foo/baz.txt']).to.equal(undefined);
        expect(unzippedFileData.files['bar.js']).to.equal(undefined);
      });
    });

    it('should exclude predefined files and folders (e.g. like .git)', () => {
      awsDeploy.deployedFunctions = simpleDeployedFunctionsArrayMock;

      const functionFileNameBase = 'function';

      // create a function in a temporary directory
      const tmpDirPath = path.join(os.tmpdir(), (new Date).getTime().toString());
      const tmpFilePath = path.join(tmpDirPath, `${functionFileNameBase}.js`);
      serverless.utils.writeFileSync(tmpFilePath, functionCodeMock);

      // create the files and folder which should be ignored
      // .gitignore
      const gitignoreFilePath = path.join(tmpDirPath, '.gitignore');
      serverless.utils.writeFileSync(gitignoreFilePath, 'content');

      // .DS_Store
      const dsStoreFilePath = path.join(tmpDirPath, '.DS_Store');
      serverless.utils.writeFileSync(dsStoreFilePath, 'content');

      // serverless.yaml
      const serverlessYamlFilePath = path.join(tmpDirPath, 'serverless.yaml');
      serverless.utils.writeFileSync(serverlessYamlFilePath, 'content');

      // serverless.env.yaml
      const serverlessEnvYamlFilePath = path.join(tmpDirPath, 'serverless.env.yaml');
      serverless.utils.writeFileSync(serverlessEnvYamlFilePath, 'content');

      const gitFilePath = path.join(path.join(tmpDirPath, '.git'), 'some-random-git-file');
      serverless.utils.writeFileSync(gitFilePath, 'content');

      // set the servicePath
      serverless.config.servicePath = tmpDirPath;

      return awsDeploy.zipFunctions().then(() => {
        // look into the zippedFileData
        const unzippedFileData = zip.load(awsDeploy.deployedFunctions[0].zipFileData);

        expect(unzippedFileData.files[`${functionFileNameBase}.js`].name)
          .to.equal(`${functionFileNameBase}.js`);
        expect(unzippedFileData.files[`${functionFileNameBase}.js`].dir).to.equal(false);

        expect(unzippedFileData.files['.gitignore']).to.equal(undefined);
        expect(unzippedFileData.files['.DS_Store']).to.equal(undefined);
        expect(unzippedFileData.files['.serverless.yaml']).to.equal(undefined);
        expect(unzippedFileData.files['.serverless.env.yaml']).to.equal(undefined);
        expect(unzippedFileData.files['.git']).to.equal(undefined);
      });
    });

    it('should include a previously excluded file', () => {
      awsDeploy.deployedFunctions = includeExcludedFileDeployedFunctionsArrayMock;

      const functionFileNameBase = 'function';

      // create a function in a temporary directory
      const tmpDirPath = path.join(os.tmpdir(), (new Date).getTime().toString());
      const tmpFilePath = path.join(tmpDirPath, `${functionFileNameBase}.js`);
      serverless.utils.writeFileSync(tmpFilePath, functionCodeMock);

      // create a file with the name "bar.js" --> bar.js
      serverless.utils.writeFileSync(path.join(tmpDirPath, 'bar.js'), 'content');

      // set the servicePath
      serverless.config.servicePath = tmpDirPath;

      return awsDeploy.zipFunctions().then(() => {
        // look into the zippedFileData
        const unzippedFileData = zip.load(awsDeploy.deployedFunctions[0].zipFileData);

        expect(unzippedFileData.files[`${functionFileNameBase}.js`].name)
          .to.equal(`${functionFileNameBase}.js`);
        expect(unzippedFileData.files[`${functionFileNameBase}.js`].dir).to.equal(false);

        expect(unzippedFileData.files['bar.js'].name).to.equal('bar.js');
        expect(unzippedFileData.files['bar.js'].dir).to.equal(false);
      });
    });
  });

  describe('#uploadZipFilesToS3Bucket()', () => {
    it('should upload the zip files to the S3 bucket', () => {
      awsDeploy.deployedFunctions = [
        {
          zipFileKey: true,
          zipFileData: true,
        },
      ];

      const putObjectStub = sinon
        .stub(awsDeploy.sdk, 'request').returns(BbPromise.resolve());

      return awsDeploy.create().then(() => {
        expect(putObjectStub.calledOnce).to.be.equal(true);
        expect(putObjectStub.calledWith(awsDeploy.options.stage, awsDeploy.options.region));
        awsDeploy.sdk.request.restore();
      });
    });
  });
});
