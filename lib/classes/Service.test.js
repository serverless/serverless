'use strict';

const path = require('path');
const YAML = require('js-yaml');
const _ = require('lodash');
const chai = require('chai');
const sinon = require('sinon');
const Service = require('../../lib/classes/Service');
const Utils = require('../../lib/classes/Utils');
const Serverless = require('../../lib/Serverless');
const testUtils = require('../../tests/utils');

// Configure chai
chai.use(require('chai-as-promised'));
const expect = require('chai').expect;

describe('Service', () => {
  describe('#constructor()', () => {
    const serverless = new Serverless();

    it('should attach serverless instance', () => {
      const serviceInstance = new Service(serverless);
      expect(typeof serviceInstance.serverless.version).to.be.equal('string');
    });

    it('should construct with defaults', () => {
      const serviceInstance = new Service(serverless);

      expect(serviceInstance.service).to.be.equal(null);
      expect(serviceInstance.serviceObject).to.be.equal(null);
      expect(serviceInstance.provider).to.deep.equal({
        stage: 'dev',
        region: 'us-east-1',
        variableSyntax: '\\${([ ~:a-zA-Z0-9._@\'",\\-\\/\\(\\)]+?)}',
      });
      expect(serviceInstance.custom).to.deep.equal({});
      expect(serviceInstance.plugins).to.deep.equal([]);
      expect(serviceInstance.functions).to.deep.equal({});
      expect(serviceInstance.resources).to.deep.equal({});
      expect(serviceInstance.package).to.deep.equal({});
    });

    it('should construct with data', () => {
      const data = {
        service: 'testService',
        provider: 'testProvider',
        custom: {
          customProp: 'value',
        },
        plugins: ['testPlugin'],
        functions: {
          functionA: {},
        },
        resources: {
          aws: {
            resourcesProp: 'value',
          },
          azure: {},
          google: {},
        },
        package: {
          exclude: ['exclude-me'],
          include: ['include-me'],
          artifact: 'some/path/foo.zip',
        },
      };

      const serviceInstance = new Service(serverless, data);

      expect(serviceInstance.service).to.be.equal('testService');
      expect(serviceInstance.provider).to.be.equal('testProvider');
      expect(serviceInstance.custom).to.deep.equal({ customProp: 'value' });
      expect(serviceInstance.plugins).to.deep.equal(['testPlugin']);
      expect(serviceInstance.functions).to.deep.equal({ functionA: {} });
      expect(serviceInstance.resources.aws).to.deep.equal({ resourcesProp: 'value' });
      expect(serviceInstance.resources.azure).to.deep.equal({});
      expect(serviceInstance.resources.google).to.deep.equal({});
      expect(serviceInstance.package.exclude.length).to.equal(1);
      expect(serviceInstance.package.exclude[0]).to.equal('exclude-me');
      expect(serviceInstance.package.include.length).to.equal(1);
      expect(serviceInstance.package.include[0]).to.equal('include-me');
      expect(serviceInstance.package.artifact).to.equal('some/path/foo.zip');
      expect(serviceInstance.package.excludeDevDependencies).to.equal(undefined);
    });

    it('should support string based provider config', () => {
      const data = {
        provider: 'testProvider',
      };

      const serviceInstance = new Service(serverless, data);

      expect(serviceInstance.provider).to.be.equal('testProvider');
    });

    it('should support object based provider config', () => {
      const data = {
        provider: {
          name: 'testProvider',
          runtime: 'nodejs6.10',
        },
      };

      const serviceInstance = new Service(serverless, data);

      expect(serviceInstance.provider.name).to.be.equal('testProvider');
      expect(serviceInstance.provider.runtime).to.be.equal('nodejs6.10');
    });
  });

  describe('#load()', () => {
    let serviceInstance;
    let tmpDirPath;

    beforeEach(() => {
      tmpDirPath = testUtils.getTmpDirPath();
    });

    it('should resolve if no servicePath is found', () => {
      const serverless = new Serverless();
      const noService = new Service(serverless);

      return expect(noService.load()).to.eventually.resolve;
    });

    it('should load serverless.yml from filesystem', () => {
      const SUtils = new Utils();
      const serverlessYml = {
        service: 'new-service',
        provider: {
          name: 'aws',
          stage: 'dev',
          region: 'us-east-1',
          variableSyntax: '\\${{([ ~:a-zA-Z0-9._@\'",\\-\\/\\(\\)]+?)}}',
        },
        plugins: ['testPlugin'],
        functions: {
          functionA: {},
        },
        resources: {
          aws: {
            resourcesProp: 'value',
          },
          azure: {},
          google: {},
        },
        package: {
          exclude: ['exclude-me'],
          include: ['include-me'],
          artifact: 'some/path/foo.zip',
          excludeDevDependencies: false,
        },
      };

      SUtils.writeFileSync(path.join(tmpDirPath, 'serverless.yml'),
        YAML.dump(serverlessYml));

      const serverless = new Serverless();
      serverless.config.update({ servicePath: tmpDirPath });
      serviceInstance = new Service(serverless);

      return expect(serviceInstance.load()).to.eventually.be.fulfilled.then(() => {
        expect(serviceInstance.service).to.be.equal('new-service');
        expect(serviceInstance.provider.name).to.deep.equal('aws');
        expect(serviceInstance.provider.variableSyntax).to.equal(
          '\\${{([ ~:a-zA-Z0-9._@\'",\\-\\/\\(\\)]+?)}}'
        );
        expect(serviceInstance.plugins).to.deep.equal(['testPlugin']);
        expect(serviceInstance.resources.aws).to.deep.equal({ resourcesProp: 'value' });
        expect(serviceInstance.resources.azure).to.deep.equal({});
        expect(serviceInstance.resources.google).to.deep.equal({});
        expect(serviceInstance.package.exclude.length).to.equal(1);
        expect(serviceInstance.package.exclude[0]).to.equal('exclude-me');
        expect(serviceInstance.package.include.length).to.equal(1);
        expect(serviceInstance.package.include[0]).to.equal('include-me');
        expect(serviceInstance.package.artifact).to.equal('some/path/foo.zip');
        expect(serviceInstance.package.excludeDevDependencies).to.equal(false);
      });
    });

    it('should load serverless.yaml from filesystem', () => {
      const SUtils = new Utils();
      const serverlessYml = {
        service: 'new-service',
        provider: {
          name: 'aws',
          stage: 'dev',
          region: 'us-east-1',
          variableSyntax: '\\${{([ ~:a-zA-Z0-9._@\'",\\-\\/\\(\\)]+?)}}',
        },
        plugins: ['testPlugin'],
        functions: {
          functionA: {},
        },
        resources: {
          aws: {
            resourcesProp: 'value',
          },
          azure: {},
          google: {},
        },
        package: {
          exclude: ['exclude-me'],
          include: ['include-me'],
          artifact: 'some/path/foo.zip',
        },
      };

      SUtils.writeFileSync(path.join(tmpDirPath, 'serverless.yaml'),
        YAML.dump(serverlessYml));

      const serverless = new Serverless();
      serverless.config.update({ servicePath: tmpDirPath });
      serviceInstance = new Service(serverless);

      return expect(serviceInstance.load()).to.eventually.be.fulfilled.then(() => {
        expect(serviceInstance.service).to.be.equal('new-service');
        expect(serviceInstance.provider.name).to.deep.equal('aws');
        expect(serviceInstance.provider.variableSyntax).to.equal(
          '\\${{([ ~:a-zA-Z0-9._@\'",\\-\\/\\(\\)]+?)}}'
        );
        expect(serviceInstance.plugins).to.deep.equal(['testPlugin']);
        expect(serviceInstance.resources.aws).to.deep.equal({ resourcesProp: 'value' });
        expect(serviceInstance.resources.azure).to.deep.equal({});
        expect(serviceInstance.resources.google).to.deep.equal({});
        expect(serviceInstance.package.exclude.length).to.equal(1);
        expect(serviceInstance.package.exclude[0]).to.equal('exclude-me');
        expect(serviceInstance.package.include.length).to.equal(1);
        expect(serviceInstance.package.include[0]).to.equal('include-me');
        expect(serviceInstance.package.artifact).to.equal('some/path/foo.zip');
        expect(serviceInstance.package.excludeDevDependencies).to.equal(undefined);
      });
    });

    it('should load serverless.json from filesystem', () => {
      const SUtils = new Utils();
      const serverlessJSON = {
        service: 'new-service',
        provider: {
          name: 'aws',
          stage: 'dev',
          region: 'us-east-1',
          variableSyntax: '\\${{([ ~:a-zA-Z0-9._@\'",\\-\\/\\(\\)]+?)}}',
        },
        plugins: ['testPlugin'],
        functions: {
          functionA: {},
        },
        resources: {
          aws: {
            resourcesProp: 'value',
          },
          azure: {},
          google: {},
        },
        package: {
          exclude: ['exclude-me'],
          include: ['include-me'],
          artifact: 'some/path/foo.zip',
        },
      };

      SUtils.writeFileSync(path.join(tmpDirPath, 'serverless.json'),
        JSON.stringify(serverlessJSON));

      const serverless = new Serverless();
      serverless.config.update({ servicePath: tmpDirPath });
      serviceInstance = new Service(serverless);

      return expect(serviceInstance.load()).to.eventually.be.fulfilled
      .then(() => {
        expect(serviceInstance.service).to.be.equal('new-service');
        expect(serviceInstance.provider.name).to.deep.equal('aws');
        expect(serviceInstance.provider.variableSyntax).to.equal(
          '\\${{([ ~:a-zA-Z0-9._@\'",\\-\\/\\(\\)]+?)}}'
        );
        expect(serviceInstance.plugins).to.deep.equal(['testPlugin']);
        expect(serviceInstance.resources.aws).to.deep.equal({ resourcesProp: 'value' });
        expect(serviceInstance.resources.azure).to.deep.equal({});
        expect(serviceInstance.resources.google).to.deep.equal({});
        expect(serviceInstance.package.exclude.length).to.equal(1);
        expect(serviceInstance.package.exclude[0]).to.equal('exclude-me');
        expect(serviceInstance.package.include.length).to.equal(1);
        expect(serviceInstance.package.include[0]).to.equal('include-me');
        expect(serviceInstance.package.artifact).to.equal('some/path/foo.zip');
        expect(serviceInstance.package.excludeDevDependencies).to.equal(undefined);
      });
    });

    it('should load serverless.js from filesystem', () => {
      const SUtils = new Utils();
      const serverlessJSON = {
        service: 'new-service',
        provider: {
          name: 'aws',
          stage: 'dev',
          region: 'us-east-1',
          variableSyntax: '\\${{([ ~:a-zA-Z0-9._@\'",\\-\\/\\(\\)]+?)}}',
        },
        plugins: ['testPlugin'],
        functions: {
          functionA: {},
        },
        resources: {
          aws: {
            resourcesProp: 'value',
          },
          azure: {},
          google: {},
        },
        package: {
          exclude: ['exclude-me'],
          include: ['include-me'],
          artifact: 'some/path/foo.zip',
        },
      };

      SUtils.writeFileSync(path.join(tmpDirPath, 'serverless.js'),
        `module.exports = ${JSON.stringify(serverlessJSON)};`);

      const serverless = new Serverless();
      serverless.config.update({ servicePath: tmpDirPath });
      serviceInstance = new Service(serverless);

      return expect(serviceInstance.load()).to.eventually.be.fulfilled
      .then(() => {
        expect(serviceInstance.service).to.be.equal('new-service');
        expect(serviceInstance.provider.name).to.deep.equal('aws');
        expect(serviceInstance.provider.variableSyntax).to.equal(
          '\\${{([ ~:a-zA-Z0-9._@\'",\\-\\/\\(\\)]+?)}}'
        );
        expect(serviceInstance.plugins).to.deep.equal(['testPlugin']);
        expect(serviceInstance.resources.aws).to.deep.equal({ resourcesProp: 'value' });
        expect(serviceInstance.resources.azure).to.deep.equal({});
        expect(serviceInstance.resources.google).to.deep.equal({});
        expect(serviceInstance.package.exclude.length).to.equal(1);
        expect(serviceInstance.package.exclude[0]).to.equal('exclude-me');
        expect(serviceInstance.package.include.length).to.equal(1);
        expect(serviceInstance.package.include[0]).to.equal('include-me');
        expect(serviceInstance.package.artifact).to.equal('some/path/foo.zip');
        expect(serviceInstance.package.excludeDevDependencies).to.equal(undefined);
      });
    });

    it('should load serverless.js from filesystem', () => {
      const SUtils = new Utils();
      const serverlessJSON = {
        service: 'new-service',
        provider: {
          name: 'aws',
          stage: 'dev',
          region: 'us-east-1',
          variableSyntax: '\\${{([ ~:a-zA-Z0-9._\'",\\-\\/\\(\\)]+?)}}',
        },
        plugins: ['testPlugin'],
        functions: {
          functionA: {},
        },
        resources: {
          aws: {
            resourcesProp: 'value',
          },
          azure: {},
          google: {},
        },
        package: {
          exclude: ['exclude-me'],
          include: ['include-me'],
          artifact: 'some/path/foo.zip',
        },
      };

      SUtils.writeFileSync(path.join(tmpDirPath, 'serverless.js'),
        `module.exports = new Promise(resolve => { resolve(${JSON.stringify(serverlessJSON)}) });`);

      const serverless = new Serverless();
      serverless.config.update({ servicePath: tmpDirPath });
      serviceInstance = new Service(serverless);

      return expect(serviceInstance.load()).to.eventually.be.fulfilled
      .then(() => {
        expect(serviceInstance.service).to.be.equal('new-service');
        expect(serviceInstance.provider.name).to.deep.equal('aws');
        expect(serviceInstance.provider.variableSyntax).to.equal(
          '\\${{([ ~:a-zA-Z0-9._\'",\\-\\/\\(\\)]+?)}}'
        );
        expect(serviceInstance.plugins).to.deep.equal(['testPlugin']);
        expect(serviceInstance.resources.aws).to.deep.equal({ resourcesProp: 'value' });
        expect(serviceInstance.resources.azure).to.deep.equal({});
        expect(serviceInstance.resources.google).to.deep.equal({});
        expect(serviceInstance.package.exclude.length).to.equal(1);
        expect(serviceInstance.package.exclude[0]).to.equal('exclude-me');
        expect(serviceInstance.package.include.length).to.equal(1);
        expect(serviceInstance.package.include[0]).to.equal('include-me');
        expect(serviceInstance.package.artifact).to.equal('some/path/foo.zip');
        expect(serviceInstance.package.excludeDevDependencies).to.equal(undefined);
      });
    });

    it('should throw error if serverless.js exports invalid config', () => {
      const SUtils = new Utils();

      SUtils.writeFileSync(path.join(tmpDirPath, 'serverless.js'),
        'module.exports = function config() {};');

      const serverless = new Serverless();
      serverless.config.update({ servicePath: tmpDirPath });
      serviceInstance = new Service(serverless);

      return expect(serviceInstance.load())
        .to.be.rejectedWith('serverless.js must export plain object');
    });

    it('should load YAML in favor of JSON', () => {
      const SUtils = new Utils();
      const serverlessJSON = {
        provider: {
          name: 'aws',
          stage: 'dev',
          region: 'us-east-1',
          variableSyntax: '\\${{([ ~:a-zA-Z0-9._@\'",\\-\\/\\(\\)]+?)}}',
        },
        plugins: ['testPlugin'],
        functions: {
          functionA: {},
        },
        resources: {
          aws: {
            resourcesProp: 'value',
          },
          azure: {},
          google: {},
        },
        package: {
          exclude: ['exclude-me'],
          include: ['include-me'],
          artifact: 'some/path/foo.zip',
        },
      };

      serverlessJSON.service = 'JSON service';
      SUtils.writeFileSync(path.join(tmpDirPath, 'serverless.json'),
        JSON.stringify(serverlessJSON));

      serverlessJSON.service = 'YAML service';
      SUtils.writeFileSync(path.join(tmpDirPath, 'serverless.yaml'),
        YAML.dump(serverlessJSON));

      const serverless = new Serverless();
      serverless.config.update({ servicePath: tmpDirPath });
      serviceInstance = new Service(serverless);

      return expect(serviceInstance.load()).to.eventually.be.fulfilled
      .then(() => {
        // YAML should have been loaded instead of JSON
        expect(serviceInstance.service).to.be.equal('YAML service');
      });
    });

    it('should reject when the service name is missing', () => {
      const SUtils = new Utils();
      const serverlessYaml = {
        service: {},
        provider: 'aws',
      };

      SUtils.writeFileSync(path.join(tmpDirPath, 'serverless.yaml'),
        YAML.dump(serverlessYaml));

      const serverless = new Serverless({ servicePath: tmpDirPath });
      serviceInstance = new Service(serverless);

      return expect(serviceInstance.load()).to.eventually.be
        .rejectedWith('"service" is missing the "name" property in');
    });

    it('should support service objects', () => {
      const SUtils = new Utils();
      const serverlessYaml = {
        service: {
          name: 'my-service',
          foo: 'bar',
        },
        provider: 'aws',
      };

      SUtils.writeFileSync(path.join(tmpDirPath, 'serverless.yaml'),
        YAML.dump(serverlessYaml));

      const serverless = new Serverless({ servicePath: tmpDirPath });
      serviceInstance = new Service(serverless);

      return expect(serviceInstance.load()).to.eventually.be.fulfilled
      .then(() => {
        expect(serviceInstance.service).to.equal('my-service');
        expect(serviceInstance.serviceObject).to.deep.equal(serverlessYaml.service);
      });
    });

    it('should support Serverless file with a non-aws provider', () => {
      const SUtils = new Utils();
      const serverlessYaml = {
        service: 'my-service',
        provider: 'openwhisk',
        functions: {
          functionA: {
            name: 'customFunctionName',
          },
        },
      };

      SUtils.writeFileSync(path.join(tmpDirPath, 'serverless.yaml'),
        YAML.dump(serverlessYaml));

      const serverless = new Serverless({ servicePath: tmpDirPath });
      serviceInstance = new Service(serverless);

      return expect(serviceInstance.load()).to.eventually.be.fulfilled
      .then(() => {
        serviceInstance.setFunctionNames();
        const expectedFunc = {
          functionA: {
            name: 'customFunctionName',
            events: [],
          },
        };
        expect(serviceInstance.service).to.be.equal('my-service');
        expect(serviceInstance.provider.name).to.deep.equal('openwhisk');
        expect(serviceInstance.functions).to.deep.equal(expectedFunc);
      });
    });

    it('should support Serverless file with a .yaml extension', () => {
      const SUtils = new Utils();
      const serverlessYaml = {
        service: 'my-service',
        provider: 'aws',
        functions: {
          functionA: {
            name: 'customFunctionName',
          },
        },
      };

      SUtils.writeFileSync(path.join(tmpDirPath, 'serverless.yaml'),
        YAML.dump(serverlessYaml));

      const serverless = new Serverless({ servicePath: tmpDirPath });
      serviceInstance = new Service(serverless);

      return expect(serviceInstance.load()).to.eventually.be.fulfilled
      .then(() => {
        serviceInstance.setFunctionNames();
        const expectedFunc = {
          functionA: {
            name: 'customFunctionName',
            events: [],
          },
        };
        expect(serviceInstance.service).to.be.equal('my-service');
        expect(serviceInstance.provider.name).to.deep.equal('aws');
        expect(serviceInstance.functions).to.deep.equal(expectedFunc);
      });
    });

    it('should support Serverless file with a .yml extension', () => {
      const SUtils = new Utils();
      const serverlessYml = {
        service: 'my-service',
        provider: 'aws',
        functions: {
          functionA: {},
        },
      };

      SUtils.writeFileSync(path.join(tmpDirPath, 'serverless.yml'),
        YAML.dump(serverlessYml));

      const serverless = new Serverless({ servicePath: tmpDirPath });
      serviceInstance = new Service(serverless);

      return expect(serviceInstance.load({ stage: 'dev' })).to.eventually.be.fulfilled
      .then(() => {
        serviceInstance.setFunctionNames();
        const expectedFunc = {
          functionA: {
            name: 'my-service-dev-functionA',
            events: [],
          },
        };
        expect(serviceInstance.service).to.be.equal('my-service');
        expect(serviceInstance.provider.name).to.deep.equal('aws');
        expect(serviceInstance.functions).to.deep.equal(expectedFunc);
      });
    });

    it('should reject if service property is missing', () => {
      const SUtils = new Utils();
      const serverlessYml = {
        provider: 'aws',
        functions: {},
      };
      SUtils.writeFileSync(path.join(tmpDirPath, 'serverless.yml'),
        YAML.dump(serverlessYml));

      const serverless = new Serverless({ servicePath: tmpDirPath });
      serviceInstance = new Service(serverless);

      return expect(serviceInstance.load()).to.eventually.be
        .rejectedWith('"service" property is missing in serverless.yml');
    });

    it('should reject if provider property is missing', () => {
      const SUtils = new Utils();
      const serverlessYml = {
        service: 'service-name',
        functions: {},
      };
      SUtils.writeFileSync(path.join(tmpDirPath, 'serverless.yml'),
        YAML.dump(serverlessYml));

      const serverless = new Serverless({ servicePath: tmpDirPath });
      serviceInstance = new Service(serverless);

      return expect(serviceInstance.load()).to.eventually.be
        .rejectedWith('"provider" property is missing in serverless.yml');
    });

    it('should reject if frameworkVersion is not satisfied', () => {
      const SUtils = new Utils();
      const serverlessYml = {
        service: 'service-name',
        frameworkVersion: '=1.0.0',
        provider: 'aws',
        functions: {},
      };
      SUtils.writeFileSync(path.join(tmpDirPath, 'serverless.yml'),
        YAML.dump(serverlessYml));

      const serverless = new Serverless({ servicePath: tmpDirPath });
      const getVersion = sinon.stub(serverless.utils, 'getVersion');
      getVersion.returns('1.0.2');
      serviceInstance = new Service(serverless);

      return expect(serviceInstance.load()).to.eventually.be
        .rejectedWith(/version \(1\.0\.2\).*"frameworkVersion" \(=1\.0\.0\)/);
    });

    it('should pass if frameworkVersion is satisfied', () => {
      const SUtils = new Utils();
      const serverlessYml = {
        service: 'service-name',
        frameworkVersion: '>=1.0.0',
        provider: 'aws',
        functions: {},
      };
      SUtils.writeFileSync(path.join(tmpDirPath, 'serverless.yml'),
        YAML.dump(serverlessYml));

      const serverless = new Serverless({ servicePath: tmpDirPath });
      const getVersion = sinon.stub(serverless.utils, 'getVersion');
      getVersion.returns('1.2.2');
      serviceInstance = new Service(serverless);

      return expect(serviceInstance.load()).to.eventually.be.fulfilled;
    });

    it('should fulfill if functions property is missing', () => {
      const SUtils = new Utils();
      const serverlessYml = {
        service: 'service-name',
        provider: 'aws',
      };
      SUtils.writeFileSync(path.join(tmpDirPath, 'serverless.yml'),
        YAML.dump(serverlessYml));

      const serverless = new Serverless({ servicePath: tmpDirPath });
      serverless.variables.service = serverless.service;
      serviceInstance = new Service(serverless);

      return expect(serviceInstance.load()).to.eventually.be.fulfilled
      .then(() => {
        // populate variables in service configuration
        serverless.variables.populateService();

        // validate the service configuration, now that variables are loaded
        serviceInstance.validate();

        expect(serviceInstance.functions).to.deep.equal({});
      });
    });
  });

  describe('#validate()', () => {
    let tmpDirPath;

    beforeEach(() => {
      tmpDirPath = testUtils.getTmpDirPath();
    });

    it('should throw if a function\'s event is not an array or a variable', () => {
      const SUtils = new Utils();
      const serverlessYml = {
        service: 'service-name',
        provider: 'aws',
        functions: {
          functionA: {
            events: 'not an array or a variable',
          },
        },
      };
      SUtils.writeFileSync(path.join(tmpDirPath, 'serverless.yml'),
        YAML.dump(serverlessYml));

      const serverless = new Serverless({ servicePath: tmpDirPath });
      serverless.service = new Service(serverless);

      return expect(serverless.service.load()).to.eventually.be.fulfilled
      .then(() => {
        // validate the service configuration, now that variables are loaded
        expect(() => serverless.service.validate())
          .to.throw('Events for "functionA" must be an array, not an string');
      });
    });

    describe('stage name validation', () => {
      function simulateRun(serverless) {
        return serverless.init().then(() =>
          serverless.variables.populateService(serverless.pluginManager.cliOptions)
            .then(() => {
              serverless.service.mergeArrays();
              serverless.service.setFunctionNames(serverless.processedInput.options);
            }));
      }

      it(`should not throw an error if http event is absent and 
            stage contains only alphanumeric, underscore and hyphen`, () => {
        const SUtils = new Utils();
        const serverlessYml = {
          service: 'new-service',
          provider: {
            name: 'aws',
            stage: 'xyz-101_abc-123',
          },
          functions: {
            first: {
              events: [],
            },
          },
        };
        SUtils.writeFileSync(path.join(tmpDirPath, 'serverless.yml'),
          YAML.dump(serverlessYml));

        const serverless = new Serverless({ servicePath: tmpDirPath });
        return expect(simulateRun(serverless)).to.eventually.be.fulfilled.then(() => {
          expect(() => serverless.service.validate()).to.not.throw(serverless.classes.Error);
        });
      });

      it(`should not throw an error after variable population if http event is present and
            the populated stage contains only alphanumeric, underscore and hyphen`, () => {
        const SUtils = new Utils();
        const serverlessYml = {
          service: 'new-service',
          provider: {
            name: 'aws',
            stage: '${opt:stage, "default-stage"}',
          },
          functions: {
            first: {
              events: [
                {
                  http: {
                    path: 'foo',
                    method: 'GET',
                  },
                },
              ],
            },
          },
        };
        SUtils.writeFileSync(path.join(tmpDirPath, 'serverless.yml'),
          YAML.dump(serverlessYml));

        const serverless = new Serverless({ servicePath: tmpDirPath });
        return expect(simulateRun(serverless)).to.eventually.be.fulfilled.then(() => {
          expect(() => serverless.service.validate()).to.not.throw(serverless.classes.Error);
        });
      });

      it('should throw an error if http event is present and stage contains invalid chars', () => {
        const SUtils = new Utils();
        const serverlessYml = {
          service: 'new-service',
          provider: {
            name: 'aws',
            stage: 'my@stage',
          },
          functions: {
            first: {
              events: [
                {
                  http: {
                    path: 'foo',
                    method: 'GET',
                  },
                },
              ],
            },
          },
        };
        SUtils.writeFileSync(path.join(tmpDirPath, 'serverless.yml'),
          YAML.dump(serverlessYml));

        const serverless = new Serverless({ servicePath: tmpDirPath });
        return expect(simulateRun(serverless)).to.eventually.be.fulfilled.then(() => {
          expect(() => serverless.service.validate()).to.throw(serverless.classes.Error, [
            'Invalid stage name my@stage: it should contains only [-_a-zA-Z0-9]',
            'for AWS provider if http event are present',
            'according to API Gateway limitation.',
          ].join(' '));
        });
      });

      it(`should throw an error after variable population
            if http event is present and stage contains hyphen`, () => {
        const SUtils = new Utils();
        const serverlessYml = {
          service: 'new-service',
          provider: {
            name: 'aws',
            stage: '${opt:stage, "default:stage"}',
          },
          functions: {
            first: {
              events: [
                {
                  http: {
                    path: 'foo',
                    method: 'GET',
                  },
                },
              ],
            },
          },
        };
        SUtils.writeFileSync(path.join(tmpDirPath, 'serverless.yml'),
          YAML.dump(serverlessYml));

        const serverless = new Serverless({ servicePath: tmpDirPath });
        return expect(simulateRun(serverless)).to.eventually.be.fulfilled.then(() => {
          expect(() => serverless.service.validate()).to.throw(serverless.classes.Error, [
            'Invalid stage name default:stage: it should contains only [-_a-zA-Z0-9]',
            'for AWS provider if http event are present',
            'according to API Gateway limitation.',
          ].join(' '));
        });
      });
    });
  });

  describe('#mergeArrays', () => {
    it('should merge resources given as an array', () => {
      const serverless = new Serverless();
      const serviceInstance = new Service(serverless);

      serviceInstance.resources = [
        {
          Resources: {
            aws: {
              resourcesProp: 'value',
            },
          },
        },
        {
          Resources: {
            azure: {},
          },
        }, {
          foo: 'bar',
        },
      ];

      serviceInstance.mergeArrays();

      expect(serviceInstance.resources).to.be.an('object');
      expect(serviceInstance.resources.Resources).to.be.an('object');
      expect(serviceInstance.resources.Resources.aws).to.deep.equal({ resourcesProp: 'value' });
      expect(serviceInstance.resources.Resources.azure).to.deep.equal({});
      expect(serviceInstance.resources.foo).to.deep.equal('bar');
    });

    it('should ignore an object', () => {
      const serverless = new Serverless();
      const serviceInstance = new Service(serverless);

      serviceInstance.resources = {
        Resources: 'foo',
      };

      serviceInstance.mergeArrays();

      expect(serviceInstance.resources).to.deep.eql({
        Resources: 'foo',
      });
    });

    it('should tolerate an empty string', () => {
      const serverless = new Serverless();
      const serviceInstance = new Service(serverless);

      serviceInstance.resources = [
        '',
        {
          aws: {
            resourcesProp: 'value',
          },
        },
      ];

      serviceInstance.mergeArrays();
      expect(serviceInstance.resources).to.deep.eql({
        aws: {
          resourcesProp: 'value',
        },
      });
    });

    it('should throw when given a number', () => {
      const serverless = new Serverless();
      const serviceInstance = new Service(serverless);

      serviceInstance.resources = [
        42,
      ];

      expect(() => serviceInstance.mergeArrays()).to.throw(Error);
    });

    it('should throw when given a string', () => {
      const serverless = new Serverless();
      const serviceInstance = new Service(serverless);

      serviceInstance.resources = [
        'string',
      ];

      expect(() => serviceInstance.mergeArrays()).to.throw(Error);
    });

    it('should merge functions given as an array', () => {
      const serverless = new Serverless();
      const serviceInstance = new Service(serverless);

      serviceInstance.functions = [{
        a: {},
      }, {
        b: {},
      }];

      serviceInstance.mergeArrays();

      expect(serviceInstance.functions).to.be.an('object');
      expect(serviceInstance.functions.a).to.be.an('object');
      expect(serviceInstance.functions.b).to.be.an('object');
    });
  });

  describe('#setFunctionNames()', () => {
    let serviceInstance;
    let tmpDirPath;

    beforeEach(() => {
      tmpDirPath = testUtils.getTmpDirPath();
    });

    it('should make sure function name contains the default stage', () => {
      const SUtils = new Utils();
      const serverlessYml = {
        service: 'new-service',
        provider: {
          name: 'aws',
          stage: 'dev',
          region: 'us-east-1',
          variableSyntax: '\\${{([ ~:a-zA-Z0-9._@\'",\\-\\/\\(\\)]+?)}}',
        },
        plugins: ['testPlugin'],
        functions: {
          functionA: {},
        },
        resources: {
          aws: {
            resourcesProp: 'value',
          },
          azure: {},
          google: {},
        },
        package: {
          exclude: ['exclude-me'],
          include: ['include-me'],
          artifact: 'some/path/foo.zip',
        },
      };

      SUtils.writeFileSync(path.join(tmpDirPath, 'serverless.yml'),
        YAML.dump(serverlessYml));

      const serverless = new Serverless();
      serverless.config.update({ servicePath: tmpDirPath });
      serviceInstance = new Service(serverless);

      return expect(serviceInstance.load()).to.eventually.be.fulfilled.then(() => {
        serviceInstance.setFunctionNames();
        expect(serviceInstance.functions.functionA.name).to.be.equal('new-service-dev-functionA');
      });
    });
  });

  describe('#update()', () => {
    it('should update service instance data', () => {
      const serverless = new Serverless();
      const serviceInstance = new Service(serverless);
      const newData = { service: 'newName' };
      const updatedInstance = serviceInstance.update(newData);
      expect(updatedInstance.service).to.be.equal('newName');
    });
  });

  describe('#getServiceName()', () => {
    it('should return the service name', () => {
      const serverless = new Serverless();
      const serviceInstance = new Service(serverless);
      serviceInstance.serviceObject = {
        name: 'my-service',
      };

      const serviceName = serviceInstance.getServiceName();

      expect(serviceName).to.equal('my-service');
    });
  });

  describe('#getServiceObject()', () => {
    it('should return the service object with all properties', () => {
      const serverless = new Serverless();
      const serviceInstance = new Service(serverless);
      const testObject = {
        name: 'my-service',
        foo: 'bar',
      };
      // Use a clone here to check for implicit reference errors
      serviceInstance.serviceObject = _.cloneDeep(testObject);

      expect(serviceInstance.getServiceObject()).to.deep.equal(testObject);
    });
  });

  describe('#getFunction()', () => {
    let serviceInstance;
    before(() => {
      const serverless = new Serverless();
      serviceInstance = new Service(serverless);
      serviceInstance.functions = {
        create: {
          handler: 'users.create',
        },
      };
    });

    it('should return function object', () => {
      expect(serviceInstance.getFunction('create')).to.deep.equal({ handler: 'users.create' });
    });

    it('should throw error if function does not exist', () => {
      expect(() => {
        serviceInstance.getFunction('random');
      }).to.throw(Error);
    });
  });

  describe('#getAllFunctionsNames', () => {
    it('should return an empty array if there are no functions in Service', () => {
      const serverless = new Serverless();
      const serviceInstance = new Service(serverless);
      serviceInstance.functions = {};

      const functionsNames = serviceInstance.getAllFunctionsNames();

      expect(functionsNames).to.deep.equal([]);
    });

    it('should return array of lambda function names in Service', () => {
      const serverless = new Serverless();
      const serviceInstance = new Service(serverless);
      serviceInstance.functions = {
        create: {
          name: 'createUser',
        },
        list: {
          name: 'listUsers',
        },
      };

      const functionsNames = serviceInstance.getAllFunctionsNames();

      expect(functionsNames).to.deep.equal(['createUser', 'listUsers']);
    });
  });

  describe('#getAllFunctions()', () => {
    it('should return an empty array if there are no functions in Service', () => {
      const serverless = new Serverless();
      const serviceInstance = new Service(serverless);
      serviceInstance.functions = {};
      expect(serviceInstance.getAllFunctions()).to.deep.equal([]);
    });

    it('should return an array of function names in Service', () => {
      const serverless = new Serverless();
      const serviceInstance = new Service(serverless);
      serviceInstance.functions = {
        create: {
          handler: 'users.create',
        },
        list: {
          handler: 'users.list',
        },
      };
      expect(serviceInstance.getAllFunctions()).to.deep.equal(['create', 'list']);
    });
  });

  describe('#getEventInFunction()', () => {
    let serviceInstance;
    before(() => {
      const serverless = new Serverless();
      serviceInstance = new Service(serverless);
      serviceInstance.functions = {
        create: {
          events: [{
            schedule: 'rate(5 minutes)',
          }],
        },
      };
    });

    it('should return an event object based on provided function', () => {
      expect(serviceInstance.getEventInFunction('schedule', 'create'))
        .to.deep.equal({ schedule: 'rate(5 minutes)' });
    });

    it('should throw error if function does not exist in service', () => {
      expect(() => {
        serviceInstance.getEventInFunction(null, 'list');
      }).to.throw(Error);
    });

    it('should throw error if event doesnt exist in function', () => {
      expect(() => {
        serviceInstance.getEventInFunction('randomEvent', 'create');
      }).to.throw(Error);
    });
  });

  describe('#getAllEventsInFunction()', () => {
    it('should return an array of events in a specified function', () => {
      const serverless = new Serverless();
      const serviceInstance = new Service(serverless);
      serviceInstance.functions = {
        create: {
          events: [{
            schedule: 'rate(5 minutes)',
          }, {
            bucket: 'my_bucket',
          }],
        },
      };

      expect(serviceInstance.getAllEventsInFunction('create'))
        .to.deep.equal([{
          schedule: 'rate(5 minutes)',
        }, {
          bucket: 'my_bucket',
        }]);
    });
  });
});
