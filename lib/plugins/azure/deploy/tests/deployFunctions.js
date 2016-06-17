'use strict';

const expect = require('chai').expect;
const path = require('path');
const os = require('os');
const Zip = require('node-zip');

const deployFunctions = require('../lib/deployFunctions');
const Serverless = require('../../../../Serverless');

describe('deployFunctions', () => {
  let serverless;
  let azureDeployMock;
  let zip;

  class AzureDeployMock {
    constructor(serverlessInstance) {
      Object.assign(this, deployFunctions);
      this.serverless = serverlessInstance;
      this.options = {};
      this.deployedFunctions = [];
    }
  }

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

  const resourcesMock = {
    azure: {
      functions: {
        function: {
          type: 'fake-function.json',
        },
      },
    },
  };

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
    serverless.init();
    azureDeployMock = new AzureDeployMock(serverless);
    zip = new Zip();
  });

  describe('#extractFunctionHandlers()', () => {
    beforeEach(() => {
      serverless.service.functions = functionsObjectMock;
    });

    it('should extract all the handlers in the function definitions', () => azureDeployMock
      .extractFunctionHandlers().then(() => {
        expect(
          azureDeployMock.deployedFunctions[0].handler
        ).to.equal(functionsObjectMock.first.handler);
        expect(
          azureDeployMock.deployedFunctions[1].handler
        ).to.equal(functionsObjectMock.second.handler);
      })
    );

    it('should extract the exclude array in the function definitions', () => azureDeployMock
      .extractFunctionHandlers().then(() => {
        expect(
          azureDeployMock.deployedFunctions[0].exclude
        ).to.include('foo');
        expect(
          azureDeployMock.deployedFunctions[0].exclude
        ).to.include('bar.js');

        expect(
          azureDeployMock.deployedFunctions[1].exclude
        ).to.include('baz');
        expect(
          azureDeployMock.deployedFunctions[1].exclude
        ).to.include('qux.js');
      })
    );

    it('should extract the include array in the functions definitions', () => azureDeployMock
      .extractFunctionHandlers().then(() => {
        expect(
          azureDeployMock.deployedFunctions[0].include
        ).to.include('bar.js');
        expect(
          azureDeployMock.deployedFunctions[0].include
        ).to.include('includeme');

        expect(
          azureDeployMock.deployedFunctions[1].include
        ).to.include('qux.js');
        expect(
          azureDeployMock.deployedFunctions[1].include
        ).to.include('includeme');
      })
    );
  });

  describe('#zipFunctions()', () => {
    it('should zip a simple function', () => {
      azureDeployMock.deployedFunctions = simpleDeployedFunctionsArrayMock;
      azureDeployMock.serverless.service.resources = resourcesMock;
      const functionFileNameBase = 'function';

      // create a function in a temporary directory
      const tmpDirPath = path.join(os.tmpdir(), (new Date).getTime().toString());
      const tmpFilePath = path.join(tmpDirPath, `${functionFileNameBase}.js`);
      serverless.utils.writeFileSync(tmpFilePath, functionCodeMock);

      // set the servicePath
      serverless.config.servicePath = tmpDirPath;

      return azureDeployMock.zipFunctions().then(() => {
        expect(azureDeployMock.deployedFunctions[0].zipFileData).to.be.not.empty;

        // look into the zippedFileData
        const unzippedFileData = zip.load(azureDeployMock.deployedFunctions[0].zipFileData);

        expect(unzippedFileData.files[`${functionFileNameBase}.js`].name)
          .to.equal(`${functionFileNameBase}.js`);
        expect(unzippedFileData.files[`${functionFileNameBase}.js`].dir).to.equal(false);
      });
    });

    it('should zip nested code', () => {
      // set the deployedFunctions array
      azureDeployMock.deployedFunctions = nestedDeployedFunctionsArrayMock;
      azureDeployMock.serverless.service.resources = resourcesMock;

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

      return azureDeployMock.zipFunctions().then(() => {
        expect(azureDeployMock.deployedFunctions[0].zipFileData).to.be.not.empty;

        // look into the zippedFileData
        const unzippedFileData = zip.load(azureDeployMock.deployedFunctions[0].zipFileData);
        const name = path.normalize(`nested/${functionFileNameBase}.js`);
        const name2 = path.normalize('lib/some-file');

        expect(unzippedFileData.files[path.normalize(name)].name)
          .to.equal(name);
        expect(unzippedFileData.files[name].dir)
          .to.equal(false);

        expect(unzippedFileData.files[name2].name)
          .to.equal(name2);
        expect(unzippedFileData.files[name2].dir)
          .to.equal(false);
      });
    });

    it('should exclude defined files and folders', () => {
      azureDeployMock.deployedFunctions = simpleDeployedFunctionsArrayMock;
      azureDeployMock.serverless.service.resources = resourcesMock;

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

      return azureDeployMock.zipFunctions().then(() => {
        // look into the zippedFileData
        const unzippedFileData = zip.load(azureDeployMock.deployedFunctions[0].zipFileData);

        expect(unzippedFileData.files[`${functionFileNameBase}.js`].name)
          .to.equal(`${functionFileNameBase}.js`);
        expect(unzippedFileData.files[`${functionFileNameBase}.js`].dir).to.equal(false);

        expect(unzippedFileData.files['foo/baz.txt']).to.equal(undefined);
        expect(unzippedFileData.files['bar.js']).to.equal(undefined);
      });
    });

    it('should exclude predefined files and folders (e.g. like .git)', () => {
      azureDeployMock.deployedFunctions = simpleDeployedFunctionsArrayMock;
      azureDeployMock.serverless.service.resources = resourcesMock;
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

      return azureDeployMock.zipFunctions().then(() => {
        // look into the zippedFileData
        const unzippedFileData = zip.load(azureDeployMock.deployedFunctions[0].zipFileData);

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
      azureDeployMock.deployedFunctions = includeExcludedFileDeployedFunctionsArrayMock;
      azureDeployMock.serverless.service.resources = resourcesMock;

      const functionFileNameBase = 'function';

      // create a function in a temporary directory
      const tmpDirPath = path.join(os.tmpdir(), (new Date).getTime().toString());
      const tmpFilePath = path.join(tmpDirPath, `${functionFileNameBase}.js`);
      serverless.utils.writeFileSync(tmpFilePath, functionCodeMock);

      // create a file with the name "bar.js" --> bar.js
      serverless.utils.writeFileSync(path.join(tmpDirPath, 'bar.js'), 'content');

      // set the servicePath
      serverless.config.servicePath = tmpDirPath;

      return azureDeployMock.zipFunctions().then(() => {
        // look into the zippedFileData
        const unzippedFileData = zip.load(azureDeployMock.deployedFunctions[0].zipFileData);

        expect(unzippedFileData.files[`${functionFileNameBase}.js`].name)
          .to.equal(`${functionFileNameBase}.js`);
        expect(unzippedFileData.files[`${functionFileNameBase}.js`].dir).to.equal(false);

        expect(unzippedFileData.files['bar.js'].name).to.equal('bar.js');
        expect(unzippedFileData.files['bar.js'].dir).to.equal(false);
      });
    });

    it('should include a previously excluded file', () => {
      azureDeployMock.deployedFunctions = includeExcludedFileDeployedFunctionsArrayMock;
      azureDeployMock.serverless.service.resources = resourcesMock;

      const functionFileNameBase = 'function';

      // create a function in a temporary directory
      const tmpDirPath = path.join(os.tmpdir(), (new Date).getTime().toString());
      const tmpFilePath = path.join(tmpDirPath, `${functionFileNameBase}.js`);
      serverless.utils.writeFileSync(tmpFilePath, functionCodeMock);

      // create a file with the name "bar.js" --> bar.js
      serverless.utils.writeFileSync(path.join(tmpDirPath, 'bar.js'), 'content');

      // set the servicePath
      serverless.config.servicePath = tmpDirPath;

      return azureDeployMock.zipFunctions().then(() => {
        // look into the zippedFileData
        const unzippedFileData = zip.load(azureDeployMock.deployedFunctions[0].zipFileData);

        expect(unzippedFileData.files[`${functionFileNameBase}.js`].name)
          .to.equal(`${functionFileNameBase}.js`);
        expect(unzippedFileData.files[`${functionFileNameBase}.js`].dir).to.equal(false);

        expect(unzippedFileData.files['bar.js'].name).to.equal('bar.js');
        expect(unzippedFileData.files['bar.js'].dir).to.equal(false);

        expect(unzippedFileData.files['function.json'].name).to.equal('function.json');
        expect(unzippedFileData.files['function.json'].dir).to.equal(false);
      });
    });
  });

  describe('#uploadZipFiles()', () => {
    it('should upload the zip files to azure', () => {
      azureDeployMock.deployedFunctions = includeExcludedFileDeployedFunctionsArrayMock;
      azureDeployMock.serverless.service.resources = resourcesMock;
      azureDeployMock.deployedFunctions = [
        {
          handler: 'test-function',
          zipFileData: true,
        },
      ];
      azureDeployMock.serverless.service = {
        resources: { azure: { variables: { sitename: 'serverless-test-site', }, }, },
      };
      process.env.AZURE_USERNAME = 'test';
      process.env.AZURE_PASSWORD = 'test';

      const expectedUrl = 'https://test:test@serverless-test-site.scm.azurewebsites.net/api/vfs/site/wwwroot/test-function/';

      return azureDeployMock.uploadZipFiles()
        .then(() => {
          // Wait, why did we hit this
          expect(false).to.be.equal(true);
        })
        .catch((err) => {
          expect(err.name).to.be.equal('FetchError');
          expect(err.message.includes(expectedUrl)).to.be.equal(true);
        });
    });
  });
});
