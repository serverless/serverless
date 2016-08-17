'use strict';

const path = require('path');
const os = require('os');
const YAML = require('js-yaml');
const expect = require('chai').expect;
const Service = require('../../lib/classes/Service');
const Utils = require('../../lib/classes/Utils');
const Serverless = require('../../lib/Serverless');

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
      expect(serviceInstance.provider).to.deep.equal({});
      expect(serviceInstance.defaults).to.deep.equal({
        stage: 'dev',
        region: 'us-east-1',
        variableSyntax: '\\${([ :a-zA-Z0-9._,\\-\\/\\(\\)]+?)}',
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
          include: ['include-me.js'],
          exclude: ['exclude-me.js'],
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
      expect(serviceInstance.package.include[0]).to.equal('include-me.js');
      expect(serviceInstance.package.exclude[0]).to.equal('exclude-me.js');
      expect(serviceInstance.package.artifact).to.equal('some/path/foo.zip');
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
          runtime: 'nodejs4.3',
        },
      };

      const serviceInstance = new Service(serverless, data);

      expect(serviceInstance.provider.name).to.be.equal('testProvider');
      expect(serviceInstance.provider.runtime).to.be.equal('nodejs4.3');
    });
  });

  describe('#load()', () => {
    let serviceInstance;

    it('should resolve if no servicePath is found', () => {
      const serverless = new Serverless();
      const noService = new Service(serverless);

      return noService.load();
    });

    it('should load from filesystem', () => {
      const SUtils = new Utils();
      const tmpDirPath = path.join(os.tmpdir(), (new Date()).getTime().toString());
      const serverlessYml = {
        service: 'new-service',
        provider: 'aws',
        defaults: {
          stage: 'dev',
          region: 'us-east-1',
          variableSyntax: '\\${{([\\s\\S]+?)}}',
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
          include: ['include-me.js'],
          exclude: ['exclude-me.js'],
          artifact: 'some/path/foo.zip',
        },
      };

      SUtils.writeFileSync(path.join(tmpDirPath, 'serverless.yml'),
        YAML.dump(serverlessYml));

      const serverless = new Serverless();
      serverless.init();
      serverless.config.update({ servicePath: tmpDirPath });
      serviceInstance = new Service(serverless);

      return serviceInstance.load().then(() => {
        expect(serviceInstance.service).to.be.equal('new-service');
        expect(serviceInstance.provider.name).to.deep.equal('aws');
        expect(serviceInstance.defaults.variableSyntax).to.equal('\\${{([\\s\\S]+?)}}');
        expect(serviceInstance.plugins).to.deep.equal(['testPlugin']);
        expect(serviceInstance.resources.aws).to.deep.equal({ resourcesProp: 'value' });
        expect(serviceInstance.resources.azure).to.deep.equal({});
        expect(serviceInstance.resources.google).to.deep.equal({});
        expect(serviceInstance.package.include.length).to.equal(1);
        expect(serviceInstance.package.include[0]).to.equal('include-me.js');
        expect(serviceInstance.package.exclude.length).to.equal(1);
        expect(serviceInstance.package.exclude[0]).to.equal('exclude-me.js');
        expect(serviceInstance.package.artifact).to.equal('some/path/foo.zip');
      });
    });

    it('should support Serverless file with a .yaml extension', () => {
      const SUtils = new Utils();
      const tmpDirPath = path.join(os.tmpdir(), (new Date()).getTime().toString());
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

      return serviceInstance.load().then(() => {
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
      const tmpDirPath = path.join(os.tmpdir(), (new Date()).getTime().toString());
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

      return serviceInstance.load({ stage: 'dev' }).then(() => {
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

    it('should throw error if service property is missing', () => {
      const SUtils = new Utils();
      const tmpDirPath = path.join(os.tmpdir(), (new Date()).getTime().toString());
      const serverlessYml = {
        provider: 'aws',
        functions: {},
      };
      SUtils.writeFileSync(path.join(tmpDirPath, 'serverless.yml'),
        YAML.dump(serverlessYml));

      const serverless = new Serverless({ servicePath: tmpDirPath });
      serviceInstance = new Service(serverless);

      return serviceInstance.load().then(() => {
        // if we reach this, then no error was thrown as expected
        // so make assertion fail intentionally to let us know something is wrong
        expect(1).to.equal(2);
      }).catch(e => {
        expect(e.name).to.be.equal('ServerlessError');
      });
    });

    it('should throw error if provider property is missing', () => {
      const SUtils = new Utils();
      const tmpDirPath = path.join(os.tmpdir(), (new Date()).getTime().toString());
      const serverlessYml = {
        service: 'service-name',
        functions: {},
      };
      SUtils.writeFileSync(path.join(tmpDirPath, 'serverless.yml'),
        YAML.dump(serverlessYml));

      const serverless = new Serverless({ servicePath: tmpDirPath });
      serviceInstance = new Service(serverless);

      return serviceInstance.load().then(() => {
        // if we reach this, then no error was thrown as expected
        // so make assertion fail intentionally to let us know something is wrong
        expect(1).to.equal(2);
      }).catch(e => {
        expect(e.name).to.be.equal('ServerlessError');
      });
    });

    it('should throw error if functions property is missing', () => {
      const SUtils = new Utils();
      const tmpDirPath = path.join(os.tmpdir(), (new Date()).getTime().toString());
      const serverlessYml = {
        service: 'service-name',
        provider: 'aws',
      };
      SUtils.writeFileSync(path.join(tmpDirPath, 'serverless.yml'),
        YAML.dump(serverlessYml));

      const serverless = new Serverless({ servicePath: tmpDirPath });
      serviceInstance = new Service(serverless);

      return serviceInstance.load().then(() => {
        // if we reach this, then no error was thrown as expected
        // so make assertion fail intentionally to let us know something is wrong
        expect(1).to.equal(2);
      }).catch(e => {
        expect(e.name).to.be.equal('ServerlessError');
      });
    });

    it('should throw error if provider property is invalid', () => {
      const SUtils = new Utils();
      const tmpDirPath = path.join(os.tmpdir(), (new Date()).getTime().toString());
      const serverlessYml = {
        service: 'service-name',
        provider: 'invalid',
        functions: {},
      };

      SUtils.writeFileSync(path.join(tmpDirPath, 'serverless.yml'),
        YAML.dump(serverlessYml));

      const serverless = new Serverless({ servicePath: tmpDirPath });
      serviceInstance = new Service(serverless);

      return serviceInstance.load().then(() => {
        // if we reach this, then no error was thrown as expected
        // so make assertion fail intentionally to let us know something is wrong
        expect(1).to.equal(2);
      }).catch(e => {
        expect(e.name).to.be.equal('ServerlessError');
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

  describe('#getAllFunctions()', () => {
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
          events: {
            schedule: 'rate(5 minutes)',
          },
        },
      };
    });

    it('should return an event object based on provided function', () => {
      expect(serviceInstance.getEventInFunction('schedule', 'create'))
        .to.be.equal('rate(5 minutes)');
    });

    it('should throw error if function does not exist in service', () => {
      expect(() => {
        serviceInstance.getEventInFunction(null, 'list');
      }).to.throw(Error);
    });

    it('should throw error if event doesnt exist in function', () => {
      expect(() => {
        serviceInstance.getEventInFunction('randomEvent', 'create');
      })
        .to.throw(Error);
    });
  });

  describe('#getAllEventsInFunction()', () => {
    it('should return an array of events in a specified function', () => {
      const serverless = new Serverless();
      const serviceInstance = new Service(serverless);
      serviceInstance.functions = {
        create: {
          events: {
            schedule: 'rate(5 minutes)',
            bucket: 'my_bucket',
          },
        },
      };

      expect(serviceInstance.getAllEventsInFunction('create'))
        .to.deep.equal(['schedule', 'bucket']);
    });
  });
});
