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
        variableSyntax: '\\${([a-zA-Z0-9._\\-\\/\\(\\)]+?)}',
      });
      expect(serviceInstance.custom).to.deep.equal({});
      expect(serviceInstance.plugins).to.deep.equal([]);
      expect(serviceInstance.functions).to.deep.equal({});
      expect(serviceInstance.environment).to.deep.equal({});
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
      expect(serviceInstance.environment).to.deep.equal({});
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

    it('should resolve if no servicePath is found', (done) => {
      const serverless = new Serverless();
      const noService = new Service(serverless);

      return noService.load().then(() => done());
    });

    it('should load from filesystem', () => {
      const SUtils = new Utils();
      const tmpDirPath = path.join(os.tmpdir(), (new Date).getTime().toString());
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
        expect(serviceInstance.provider).to.deep.equal({ name: 'aws' });
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
      const tmpDirPath = path.join(os.tmpdir(), (new Date).getTime().toString());
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
        expect(serviceInstance.provider).to.deep.equal({ name: 'aws' });
        expect(serviceInstance.functions).to.deep.equal(expectedFunc);
      });
    });

    it('should support Serverless file with a .yml extension', () => {
      const SUtils = new Utils();
      const tmpDirPath = path.join(os.tmpdir(), (new Date).getTime().toString());
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
        expect(serviceInstance.provider).to.deep.equal({ name: 'aws' });
        expect(serviceInstance.functions).to.deep.equal(expectedFunc);
      });
    });

    it('should throw error if service property is missing', () => {
      const SUtils = new Utils();
      const tmpDirPath = path.join(os.tmpdir(), (new Date).getTime().toString());
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
      const tmpDirPath = path.join(os.tmpdir(), (new Date).getTime().toString());
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
      const tmpDirPath = path.join(os.tmpdir(), (new Date).getTime().toString());
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
      const tmpDirPath = path.join(os.tmpdir(), (new Date).getTime().toString());
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

  describe('#populate()', () => {
    const serverless = new Serverless();
    it('should populate an entire variable file', () => {
      const SUtils = new Utils();
      const tmpDirPath = path.join(os.tmpdir(), (new Date).getTime().toString());
      const configYml = {
        test: 1,
        test2: 'test2',
        testObj: {
          sub: 2,
          prob: 'prob',
        },
      };

      SUtils.writeFileSync(path.join(tmpDirPath, 'config.yml'),
        YAML.dump(configYml));
      serverless.config.update({ servicePath: tmpDirPath });

      const data = {
        service: 'testService',
        provider: 'testProvider',
        custom: {
          anotherFile: '${file(./config.yml)}',
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
      const populatedService = serviceInstance.populate();
      expect(populatedService.custom.anotherFile).to.deep.equal(configYml);
    });

    it('should populate from another file when variable is of any type', () => {
      const SUtils = new Utils();
      const tmpDirPath = path.join(os.tmpdir(), (new Date).getTime().toString());
      const configYml = {
        test: 1,
        test2: 'test2',
        testObj: {
          sub: 2,
          prob: 'prob',
        },
      };

      SUtils.writeFileSync(path.join(tmpDirPath, 'config.yml'),
        YAML.dump(configYml));
      serverless.config.update({ servicePath: tmpDirPath });

      const data = {
        service: 'testService',
        provider: 'testProvider',
        custom: {
          anotherFile: '${file(./config.yml).testObj.sub}',
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
      const populatedService = serviceInstance.populate();
      expect(populatedService.custom.anotherFile).to.equal(2);
    });

    it('should populate from another file as substring when variable is of a string', () => {
      const SUtils = new Utils();
      const tmpDirPath = path.join(os.tmpdir(), (new Date).getTime().toString());
      const configYml = {
        test: 1,
        test2: 'test2',
        testObj: {
          sub: 2,
          prob: 'prob',
        },
      };

      SUtils.writeFileSync(path.join(tmpDirPath, 'config.yml'),
        YAML.dump(configYml));
      serverless.config.update({ servicePath: tmpDirPath });

      const data = {
        service: 'testService',
        provider: 'testProvider',
        custom: {
          anotherFile: '${file(./config.yml).testObj.prob}--${file(./config.yml).test2}',
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
      const populatedService = serviceInstance.populate();
      expect(populatedService.custom.anotherFile).to.equal('prob--test2');
    });

    it('should populate from environment variables', () => {
      const data = {
        service: 'testService',
        provider: 'testProvider',
        custom: {
          customProp: 'value',
          envVarRef: '${env.TEST_VAR}',
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
      process.env.TEST_VAR = 'someValue';
      const populatedService = serviceInstance.populate();
      expect(populatedService.custom.envVarRef).to.equal('someValue');
      delete process.env.TEST_VAR;
    });

    it('should populate from options', () => {
      const data = {
        service: 'testService',
        provider: 'testProvider',
        custom: {
          customProp: 'value',
          optVarRef: '${opt.stage}',
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
      const options = {
        stage: 'prod',
      };

      const serviceInstance = new Service(serverless, data);
      const populatedService = serviceInstance.populate(options);
      expect(populatedService.custom.optVarRef).to.equal('prod');
    });

    it('should populate entire options object', () => {
      const data = {
        service: 'testService',
        provider: 'testProvider',
        custom: {
          customProp: 'value',
          optVarRef: '${opt}',
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
      const options = {
        stage: 'prod',
        region: 'us-east-1',
      };

      const serviceInstance = new Service(serverless, data);
      const populatedService = serviceInstance.populate(options);
      expect(populatedService.custom.optVarRef).to.deep.equal(options);
    });

    it('should populate complex nested variable references', () => {
      const data = {
        service: 'testService',
        provider: 'testProvider',
        custom: {
          test: '${env.${opt.${self.custom.selfVarRef}}_arn} xxx ${env.${opt.${opt.test}}_arn}',
          selfVarRef: 'stageA',
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
      const options = {
        stageA: 'dev',
        stageB: 'prod',
        test: 'stageB',
      };
      process.env.dev_arn = 'devArn';
      process.env.prod_arn = 'prodArn';
      const populatedService = serviceInstance.populate(options);
      expect(populatedService.custom.test)
        .to.equal('devArn xxx prodArn');
      delete process.env.dev_arn;
      delete process.env.prod_arn;
    });

    it('should populate from deep any type properties in self service', () => {
      const data = {
        service: 'testService',
        provider: 'testProvider',
        custom: {
          customObj: {
            prop1: 1,
            prop2: {
              subProp1: 'subProp1',
            },
          },
          selfVarRef: '${self.custom.customObj.prop1}',
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
      const populatedService = serviceInstance.populate();
      expect(populatedService.custom.selfVarRef)
        .to.equal(data.custom.customObj.prop1);
      expect(typeof populatedService.custom.selfVarRef)
        .to.equal('number');
    });

    it('should populate all when the referenced variable contains a variable', () => {
      const data = {
        service: 'testService',
        provider: 'testProvider',
        custom: {
          selfVarRef: '${self.custom.customObj.prop2.subProp1}',
          customObj: {
            prop1: 'world',
            prop2: {
              subProp1: 'hello ${self.custom.customObj.prop1}',
            },
          },
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
      const populatedService = serviceInstance.populate();
      expect(populatedService.custom.selfVarRef)
        .to.equal('hello world');
    });

    it('should throw error when referencing sub properties with invalid syntax', () => {
      const SUtils = new Utils();
      const tmpDirPath = path.join(os.tmpdir(), (new Date).getTime().toString());
      const configYml = {
        test: 1,
        test2: 'test2',
        testObj: {
          sub: 2,
          prob: 'prob',
        },
      };

      SUtils.writeFileSync(path.join(tmpDirPath, 'config.yml'),
        YAML.dump(configYml));
      serverless.config.update({ servicePath: tmpDirPath });

      const data = {
        service: 'testService',
        provider: 'testProvider',
        custom: {
          anotherFile: '${file(./config.yml)testObj.prob}',
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
      expect(() => serviceInstance.populate()).to.throw(Error);
    });

    it('should throw error when referencing non-existing sub properties of a file', () => {
      const SUtils = new Utils();
      const tmpDirPath = path.join(os.tmpdir(), (new Date).getTime().toString());
      const configYml = {
        test: 1,
        test2: 'test2',
        testObj: {
          sub: 2,
          prob: 'prob',
        },
      };

      SUtils.writeFileSync(path.join(tmpDirPath, 'config.yml'),
        YAML.dump(configYml));
      serverless.config.update({ servicePath: tmpDirPath });

      const data = {
        service: 'testService',
        provider: 'testProvider',
        custom: {
          anotherFile: '${file(./config.yml).testObj.probDoesNotExist}',
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
      expect(() => serviceInstance.populate()).to.throw(Error);
    });

    it('should throw error on non string variables from a file as a substring', () => {
      const SUtils = new Utils();
      const tmpDirPath = path.join(os.tmpdir(), (new Date).getTime().toString());
      const configYml = {
        test: 1,
        test2: 'test2',
        testObj: {
          sub: 2,
          prob: 'prob',
        },
      };

      SUtils.writeFileSync(path.join(tmpDirPath, 'config.yml'),
        YAML.dump(configYml));
      serverless.config.update({ servicePath: tmpDirPath });

      const data = {
        service: 'testService',
        provider: 'testProvider',
        custom: {
          anotherFile: '${file(./config.yml).testObj.prob}--${file(./config.yml).test}',
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
      expect(() => serviceInstance.populate()).to.throw(Error);
    });

    it('should throw error when populating non string as substring from self service', () => {
      const data = {
        service: 'testService',
        provider: 'testProvider',
        custom: {
          customObj: {
            prop1: 1,
            prop2: {
              subProp1: 'subProp1',
            },
          },
          selfVarRef: 'this is a string: ${self.custom.customObj.prop1}',
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
      expect(() => serviceInstance.populate())
        .to.throw(Error);
    });

    it('should throw error when populating from self service with invalid property', () => {
      const data = {
        service: 'testService',
        provider: 'testProvider',
        custom: {
          customObj: {
            prop1: 1,
            prop2: {
              subProp1: 'subProp1',
            },
          },
          selfVarRef: '${self.custom.invalidCustomObj.prop3}',
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
      expect(() => serviceInstance.populate())
        .to.throw(Error);
    });

    it('should throw error when referencing the entire serverless.yml file', () => {
      const data = {
        service: 'testService',
        provider: 'testProvider',
        custom: {
          customObj: {
            prop1: 1,
            prop2: {
              subProp1: 'subProp1',
            },
          },
          varRef: '${self}',
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
      expect(() => serviceInstance.populate())
        .to.throw(Error);
    });

    it('should throw error when populating env vars strings as objects', () => {
      const data = {
        service: 'testService',
        provider: 'testProvider',
        custom: {
          customObj: {
            prop1: 1,
            prop2: {
              subProp1: 'subProp1',
            },
          },
          envVarRef: '${env.var.subProp}',
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
      expect(() => serviceInstance.populate())
        .to.throw(Error);
    });

    it('should throw error when populating undefined env vars', () => {
      const data = {
        service: 'testService',
        provider: 'testProvider',
        custom: {
          customObj: {
            prop1: 1,
            prop2: {
              subProp1: 'subProp1',
            },
          },
          envVarRef: '${env.undefinedVar}',
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
      expect(() => serviceInstance.populate())
        .to.throw(Error);
    });

    it('should throw error when populating option strings as objects', () => {
      const data = {
        service: 'testService',
        provider: 'testProvider',
        custom: {
          customObj: {
            prop1: 1,
            prop2: {
              subProp1: 'subProp1',
            },
          },
          optVarRef: '${opt.stage.subProp}',
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
      const options = {
        stage: 'prod',
        region: 'us-east-1',
      };
      const serviceInstance = new Service(serverless, data);
      expect(() => serviceInstance.populate(options))
        .to.throw(Error);
    });

    it('should throw error when populating option obj as sub string', () => {
      const data = {
        service: 'testService',
        provider: 'testProvider',
        custom: {
          customObj: {
            prop1: 1,
            prop2: {
              subProp1: 'subProp1',
            },
          },
          optVarRef: 'this is a string: ${opt}',
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
      const options = {
        stage: 'prod',
        region: 'us-east-1',
      };
      const serviceInstance = new Service(serverless, data);
      expect(() => serviceInstance.populate(options))
        .to.throw(Error);
    });

    it('should throw error when populating an option that was not passed', () => {
      const data = {
        service: 'testService',
        provider: 'testProvider',
        custom: {
          customObj: {
            prop1: 1,
            prop2: {
              subProp1: 'subProp1',
            },
          },
          optVarRef: 'this is a string: ${opt.unPassedOption}',
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
      const options = {
        stage: 'prod',
        region: 'us-east-1',
      };
      const serviceInstance = new Service(serverless, data);
      expect(() => serviceInstance.populate(options))
        .to.throw(Error);
    });

    it('should throw error when referencing invalid source', () => {
      const data = {
        service: 'testService',
        provider: 'testProvider',
        custom: {
          customObj: {
            prop1: 1,
            prop2: {
              subProp1: 'subProp1',
            },
          },
          varRef: '${src.var}',
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
      expect(() => serviceInstance.populate())
        .to.throw(Error);
    });


    it('should throw an error if there is an issue in a complex nested variable references', () => {
      const data = {
        service: 'testService',
        provider: {
          name: 'aws',
        },
        custom: {
          test: '${env.${opt.${self.provider}}_arn} xxx ${env.${opt.${opt.test}}_arn}',
          selfVarRef: 'stageA',
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
      const options = {
        stageA: 'dev',
        stageB: 'prod',
        test: 'stageB',
      };
      process.env.dev_arn = 'devArn';
      process.env.prod_arn = 'prodArn';
      expect(() => serviceInstance.populate(options))
        .to.throw(Error);
      delete process.env.dev_arn;
      delete process.env.prod_arn;
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
        variableSyntax: '\\${([a-zA-Z0-9._\\-\\/\\(\\)]+?)}',
      });
      expect(serviceInstance.custom).to.deep.equal({});
      expect(serviceInstance.plugins).to.deep.equal([]);
      expect(serviceInstance.functions).to.deep.equal({});
      expect(serviceInstance.environment).to.deep.equal({});
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
      expect(serviceInstance.environment).to.deep.equal({});
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

    it('should resolve if no servicePath is found', (done) => {
      const serverless = new Serverless();
      const noService = new Service(serverless);

      return noService.load().then(() => done());
    });

    it('should load from filesystem', () => {
      const SUtils = new Utils();
      const tmpDirPath = path.join(os.tmpdir(), (new Date).getTime().toString());
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
        expect(serviceInstance.provider).to.deep.equal({ name: 'aws' });
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
      const tmpDirPath = path.join(os.tmpdir(), (new Date).getTime().toString());
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
        expect(serviceInstance.provider).to.deep.equal({ name: 'aws' });
        expect(serviceInstance.functions).to.deep.equal(expectedFunc);
      });
    });

    it('should support Serverless file with a .yml extension', () => {
      const SUtils = new Utils();
      const tmpDirPath = path.join(os.tmpdir(), (new Date).getTime().toString());
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
        expect(serviceInstance.provider).to.deep.equal({ name: 'aws' });
        expect(serviceInstance.functions).to.deep.equal(expectedFunc);
      });
    });

    it('should throw error if service property is missing', () => {
      const SUtils = new Utils();
      const tmpDirPath = path.join(os.tmpdir(), (new Date).getTime().toString());
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
      const tmpDirPath = path.join(os.tmpdir(), (new Date).getTime().toString());
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
      const tmpDirPath = path.join(os.tmpdir(), (new Date).getTime().toString());
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
      const tmpDirPath = path.join(os.tmpdir(), (new Date).getTime().toString());
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

  describe('#populate()', () => {
    const serverless = new Serverless();
    it('should populate an entire variable file', () => {
      const SUtils = new Utils();
      const tmpDirPath = path.join(os.tmpdir(), (new Date).getTime().toString());
      const configYml = {
        test: 1,
        test2: 'test2',
        testObj: {
          sub: 2,
          prob: 'prob',
        },
      };

      SUtils.writeFileSync(path.join(tmpDirPath, 'config.yml'),
        YAML.dump(configYml));
      serverless.config.update({ servicePath: tmpDirPath });

      const data = {
        service: 'testService',
        provider: 'testProvider',
        custom: {
          anotherFile: '${file(./config.yml)}',
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
      const populatedService = serviceInstance.populate();
      expect(populatedService.custom.anotherFile).to.deep.equal(configYml);
    });

    it('should populate from another file when variable is of any type', () => {
      const SUtils = new Utils();
      const tmpDirPath = path.join(os.tmpdir(), (new Date).getTime().toString());
      const configYml = {
        test: 1,
        test2: 'test2',
        testObj: {
          sub: 2,
          prob: 'prob',
        },
      };

      SUtils.writeFileSync(path.join(tmpDirPath, 'config.yml'),
        YAML.dump(configYml));
      serverless.config.update({ servicePath: tmpDirPath });

      const data = {
        service: 'testService',
        provider: 'testProvider',
        custom: {
          anotherFile: '${file(./config.yml).testObj.sub}',
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
      const populatedService = serviceInstance.populate();
      expect(populatedService.custom.anotherFile).to.equal(2);
    });

    it('should populate from another file as substring when variable is of a string', () => {
      const SUtils = new Utils();
      const tmpDirPath = path.join(os.tmpdir(), (new Date).getTime().toString());
      const configYml = {
        test: 1,
        test2: 'test2',
        testObj: {
          sub: 2,
          prob: 'prob',
        },
      };

      SUtils.writeFileSync(path.join(tmpDirPath, 'config.yml'),
        YAML.dump(configYml));
      serverless.config.update({ servicePath: tmpDirPath });

      const data = {
        service: 'testService',
        provider: 'testProvider',
        custom: {
          anotherFile: '${file(./config.yml).testObj.prob}--${file(./config.yml).test2}',
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
      const populatedService = serviceInstance.populate();
      expect(populatedService.custom.anotherFile).to.equal('prob--test2');
    });

    it('should populate from environment variables', () => {
      const data = {
        service: 'testService',
        provider: 'testProvider',
        custom: {
          customProp: 'value',
          envVarRef: '${env.TEST_VAR}',
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
      process.env.TEST_VAR = 'someValue';
      const populatedService = serviceInstance.populate();
      expect(populatedService.custom.envVarRef).to.equal('someValue');
      delete process.env.TEST_VAR;
    });

    it('should populate from options', () => {
      const data = {
        service: 'testService',
        provider: 'testProvider',
        custom: {
          customProp: 'value',
          optVarRef: '${opt.stage}',
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
      const options = {
        stage: 'prod',
      };

      const serviceInstance = new Service(serverless, data);
      const populatedService = serviceInstance.populate(options);
      expect(populatedService.custom.optVarRef).to.equal('prod');
    });

    it('should populate entire options object', () => {
      const data = {
        service: 'testService',
        provider: 'testProvider',
        custom: {
          customProp: 'value',
          optVarRef: '${opt}',
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
      const options = {
        stage: 'prod',
        region: 'us-east-1',
      };

      const serviceInstance = new Service(serverless, data);
      const populatedService = serviceInstance.populate(options);
      expect(populatedService.custom.optVarRef).to.deep.equal(options);
    });

    it('should populate complex nested variable references', () => {
      const data = {
        service: 'testService',
        provider: 'testProvider',
        custom: {
          test: '${env.${opt.${self.custom.selfVarRef}}_arn} xxx ${env.${opt.${opt.test}}_arn}',
          selfVarRef: 'stageA',
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
      const options = {
        stageA: 'dev',
        stageB: 'prod',
        test: 'stageB',
      };
      process.env.dev_arn = 'devArn';
      process.env.prod_arn = 'prodArn';
      const populatedService = serviceInstance.populate(options);
      expect(populatedService.custom.test)
        .to.equal('devArn xxx prodArn');
      delete process.env.dev_arn;
      delete process.env.prod_arn;
    });

    it('should populate from deep any type properties in self service', () => {
      const data = {
        service: 'testService',
        provider: 'testProvider',
        custom: {
          customObj: {
            prop1: 1,
            prop2: {
              subProp1: 'subProp1',
            },
          },
          selfVarRef: '${self.custom.customObj.prop1}',
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
      const populatedService = serviceInstance.populate();
      expect(populatedService.custom.selfVarRef)
        .to.equal(data.custom.customObj.prop1);
      expect(typeof populatedService.custom.selfVarRef)
        .to.equal('number');
    });

    it('should populate all when the referenced variable contains a variable', () => {
      const data = {
        service: 'testService',
        provider: 'testProvider',
        custom: {
          selfVarRef: '${self.custom.customObj.prop2.subProp1}',
          customObj: {
            prop1: 'world',
            prop2: {
              subProp1: 'hello ${self.custom.customObj.prop1}',
            },
          },
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
      const populatedService = serviceInstance.populate();
      expect(populatedService.custom.selfVarRef)
        .to.equal('hello world');
    });

    it('should throw error when referencing sub properties with invalid syntax', () => {
      const SUtils = new Utils();
      const tmpDirPath = path.join(os.tmpdir(), (new Date).getTime().toString());
      const configYml = {
        test: 1,
        test2: 'test2',
        testObj: {
          sub: 2,
          prob: 'prob',
        },
      };

      SUtils.writeFileSync(path.join(tmpDirPath, 'config.yml'),
        YAML.dump(configYml));
      serverless.config.update({ servicePath: tmpDirPath });

      const data = {
        service: 'testService',
        provider: 'testProvider',
        custom: {
          anotherFile: '${file(./config.yml)testObj.prob}',
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
      expect(() => serviceInstance.populate()).to.throw(Error);
    });

    it('should throw error when referencing non-existing sub properties of a file', () => {
      const SUtils = new Utils();
      const tmpDirPath = path.join(os.tmpdir(), (new Date).getTime().toString());
      const configYml = {
        test: 1,
        test2: 'test2',
        testObj: {
          sub: 2,
          prob: 'prob',
        },
      };

      SUtils.writeFileSync(path.join(tmpDirPath, 'config.yml'),
        YAML.dump(configYml));
      serverless.config.update({ servicePath: tmpDirPath });

      const data = {
        service: 'testService',
        provider: 'testProvider',
        custom: {
          anotherFile: '${file(./config.yml).testObj.probDoesNotExist}',
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
      expect(() => serviceInstance.populate()).to.throw(Error);
    });

    it('should throw error on non string variables from a file as a substring', () => {
      const SUtils = new Utils();
      const tmpDirPath = path.join(os.tmpdir(), (new Date).getTime().toString());
      const configYml = {
        test: 1,
        test2: 'test2',
        testObj: {
          sub: 2,
          prob: 'prob',
        },
      };

      SUtils.writeFileSync(path.join(tmpDirPath, 'config.yml'),
        YAML.dump(configYml));
      serverless.config.update({ servicePath: tmpDirPath });

      const data = {
        service: 'testService',
        provider: 'testProvider',
        custom: {
          anotherFile: '${file(./config.yml).testObj.prob}--${file(./config.yml).test}',
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
      expect(() => serviceInstance.populate()).to.throw(Error);
    });

    it('should throw error when populating non string as substring from self service', () => {
      const data = {
        service: 'testService',
        provider: 'testProvider',
        custom: {
          customObj: {
            prop1: 1,
            prop2: {
              subProp1: 'subProp1',
            },
          },
          selfVarRef: 'this is a string: ${self.custom.customObj.prop1}',
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
      expect(() => serviceInstance.populate())
        .to.throw(Error);
    });

    it('should throw error when populating from self service with invalid property', () => {
      const data = {
        service: 'testService',
        provider: 'testProvider',
        custom: {
          customObj: {
            prop1: 1,
            prop2: {
              subProp1: 'subProp1',
            },
          },
          selfVarRef: '${self.custom.invalidCustomObj.prop3}',
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
      expect(() => serviceInstance.populate())
        .to.throw(Error);
    });

    it('should throw error when referencing the entire serverless.yml file', () => {
      const data = {
        service: 'testService',
        provider: 'testProvider',
        custom: {
          customObj: {
            prop1: 1,
            prop2: {
              subProp1: 'subProp1',
            },
          },
          varRef: '${self}',
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
      expect(() => serviceInstance.populate())
        .to.throw(Error);
    });

    it('should throw error when populating env vars strings as objects', () => {
      const data = {
        service: 'testService',
        provider: 'testProvider',
        custom: {
          customObj: {
            prop1: 1,
            prop2: {
              subProp1: 'subProp1',
            },
          },
          envVarRef: '${env.var.subProp}',
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
      expect(() => serviceInstance.populate())
        .to.throw(Error);
    });

    it('should throw error when populating undefined env vars', () => {
      const data = {
        service: 'testService',
        provider: 'testProvider',
        custom: {
          customObj: {
            prop1: 1,
            prop2: {
              subProp1: 'subProp1',
            },
          },
          envVarRef: '${env.undefinedVar}',
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
      expect(() => serviceInstance.populate())
        .to.throw(Error);
    });

    it('should throw error when populating option strings as objects', () => {
      const data = {
        service: 'testService',
        provider: 'testProvider',
        custom: {
          customObj: {
            prop1: 1,
            prop2: {
              subProp1: 'subProp1',
            },
          },
          optVarRef: '${opt.stage.subProp}',
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
      const options = {
        stage: 'prod',
        region: 'us-east-1',
      };
      const serviceInstance = new Service(serverless, data);
      expect(() => serviceInstance.populate(options))
        .to.throw(Error);
    });

    it('should throw error when populating option obj as sub string', () => {
      const data = {
        service: 'testService',
        provider: 'testProvider',
        custom: {
          customObj: {
            prop1: 1,
            prop2: {
              subProp1: 'subProp1',
            },
          },
          optVarRef: 'this is a string: ${opt}',
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
      const options = {
        stage: 'prod',
        region: 'us-east-1',
      };
      const serviceInstance = new Service(serverless, data);
      expect(() => serviceInstance.populate(options))
        .to.throw(Error);
    });

    it('should throw error when populating an option that was not passed', () => {
      const data = {
        service: 'testService',
        provider: 'testProvider',
        custom: {
          customObj: {
            prop1: 1,
            prop2: {
              subProp1: 'subProp1',
            },
          },
          optVarRef: 'this is a string: ${opt.unPassedOption}',
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
      const options = {
        stage: 'prod',
        region: 'us-east-1',
      };
      const serviceInstance = new Service(serverless, data);
      expect(() => serviceInstance.populate(options))
        .to.throw(Error);
    });

    it('should throw error when referencing invalid source', () => {
      const data = {
        service: 'testService',
        provider: 'testProvider',
        custom: {
          customObj: {
            prop1: 1,
            prop2: {
              subProp1: 'subProp1',
            },
          },
          varRef: '${src.var}',
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
      expect(() => serviceInstance.populate())
        .to.throw(Error);
    });


    it('should throw an error if there is an issue in a complex nested variable references', () => {
      const data = {
        service: 'testService',
        provider: {
          name: 'aws',
        },
        custom: {
          test: '${env.${opt.${self.provider}}_arn} xxx ${env.${opt.${opt.test}}_arn}',
          selfVarRef: 'stageA',
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
      const options = {
        stageA: 'dev',
        stageB: 'prod',
        test: 'stageB',
      };
      process.env.dev_arn = 'devArn';
      process.env.prod_arn = 'prodArn';
      expect(() => serviceInstance.populate(options))
        .to.throw(Error);
      delete process.env.dev_arn;
      delete process.env.prod_arn;
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
        variableSyntax: '\\${([a-zA-Z0-9._\\-\\/\\(\\)]+?)}',
      });
      expect(serviceInstance.custom).to.deep.equal({});
      expect(serviceInstance.plugins).to.deep.equal([]);
      expect(serviceInstance.functions).to.deep.equal({});
      expect(serviceInstance.environment).to.deep.equal({});
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
      expect(serviceInstance.environment).to.deep.equal({});
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

    it('should resolve if no servicePath is found', (done) => {
      const serverless = new Serverless();
      const noService = new Service(serverless);

      return noService.load().then(() => done());
    });

    it('should load from filesystem', () => {
      const SUtils = new Utils();
      const tmpDirPath = path.join(os.tmpdir(), (new Date).getTime().toString());
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
        expect(serviceInstance.provider).to.deep.equal({ name: 'aws' });
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
      const tmpDirPath = path.join(os.tmpdir(), (new Date).getTime().toString());
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
        expect(serviceInstance.provider).to.deep.equal({ name: 'aws' });
        expect(serviceInstance.functions).to.deep.equal(expectedFunc);
      });
    });

    it('should support Serverless file with a .yml extension', () => {
      const SUtils = new Utils();
      const tmpDirPath = path.join(os.tmpdir(), (new Date).getTime().toString());
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
        expect(serviceInstance.provider).to.deep.equal({ name: 'aws' });
        expect(serviceInstance.functions).to.deep.equal(expectedFunc);
      });
    });

    it('should throw error if service property is missing', () => {
      const SUtils = new Utils();
      const tmpDirPath = path.join(os.tmpdir(), (new Date).getTime().toString());
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
      const tmpDirPath = path.join(os.tmpdir(), (new Date).getTime().toString());
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
      const tmpDirPath = path.join(os.tmpdir(), (new Date).getTime().toString());
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
      const tmpDirPath = path.join(os.tmpdir(), (new Date).getTime().toString());
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

  describe('#populate()', () => {
    const serverless = new Serverless();
    it('should populate an entire variable file', () => {
      const SUtils = new Utils();
      const tmpDirPath = path.join(os.tmpdir(), (new Date).getTime().toString());
      const configYml = {
        test: 1,
        test2: 'test2',
        testObj: {
          sub: 2,
          prob: 'prob',
        },
      };

      SUtils.writeFileSync(path.join(tmpDirPath, 'config.yml'),
        YAML.dump(configYml));
      serverless.config.update({ servicePath: tmpDirPath });

      const data = {
        service: 'testService',
        provider: 'testProvider',
        custom: {
          anotherFile: '${file(./config.yml)}',
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
      const populatedService = serviceInstance.populate();
      expect(populatedService.custom.anotherFile).to.deep.equal(configYml);
    });

    it('should populate from another file when variable is of any type', () => {
      const SUtils = new Utils();
      const tmpDirPath = path.join(os.tmpdir(), (new Date).getTime().toString());
      const configYml = {
        test: 1,
        test2: 'test2',
        testObj: {
          sub: 2,
          prob: 'prob',
        },
      };

      SUtils.writeFileSync(path.join(tmpDirPath, 'config.yml'),
        YAML.dump(configYml));
      serverless.config.update({ servicePath: tmpDirPath });

      const data = {
        service: 'testService',
        provider: 'testProvider',
        custom: {
          anotherFile: '${file(./config.yml).testObj.sub}',
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
      const populatedService = serviceInstance.populate();
      expect(populatedService.custom.anotherFile).to.equal(2);
    });

    it('should populate from another file as substring when variable is of a string', () => {
      const SUtils = new Utils();
      const tmpDirPath = path.join(os.tmpdir(), (new Date).getTime().toString());
      const configYml = {
        test: 1,
        test2: 'test2',
        testObj: {
          sub: 2,
          prob: 'prob',
        },
      };

      SUtils.writeFileSync(path.join(tmpDirPath, 'config.yml'),
        YAML.dump(configYml));
      serverless.config.update({ servicePath: tmpDirPath });

      const data = {
        service: 'testService',
        provider: 'testProvider',
        custom: {
          anotherFile: '${file(./config.yml).testObj.prob}--${file(./config.yml).test2}',
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
      const populatedService = serviceInstance.populate();
      expect(populatedService.custom.anotherFile).to.equal('prob--test2');
    });

    it('should populate from environment variables', () => {
      const data = {
        service: 'testService',
        provider: 'testProvider',
        custom: {
          customProp: 'value',
          envVarRef: '${env.TEST_VAR}',
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
      process.env.TEST_VAR = 'someValue';
      const populatedService = serviceInstance.populate();
      expect(populatedService.custom.envVarRef).to.equal('someValue');
      delete process.env.TEST_VAR;
    });

    it('should populate from options', () => {
      const data = {
        service: 'testService',
        provider: 'testProvider',
        custom: {
          customProp: 'value',
          optVarRef: '${opt.stage}',
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
      const options = {
        stage: 'prod',
      };

      const serviceInstance = new Service(serverless, data);
      const populatedService = serviceInstance.populate(options);
      expect(populatedService.custom.optVarRef).to.equal('prod');
    });

    it('should populate entire options object', () => {
      const data = {
        service: 'testService',
        provider: 'testProvider',
        custom: {
          customProp: 'value',
          optVarRef: '${opt}',
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
      const options = {
        stage: 'prod',
        region: 'us-east-1',
      };

      const serviceInstance = new Service(serverless, data);
      const populatedService = serviceInstance.populate(options);
      expect(populatedService.custom.optVarRef).to.deep.equal(options);
    });

    it('should populate complex nested variable references', () => {
      const data = {
        service: 'testService',
        provider: 'testProvider',
        custom: {
          test: '${env.${opt.${self.custom.selfVarRef}}_arn} xxx ${env.${opt.${opt.test}}_arn}',
          selfVarRef: 'stageA',
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
      const options = {
        stageA: 'dev',
        stageB: 'prod',
        test: 'stageB',
      };
      process.env.dev_arn = 'devArn';
      process.env.prod_arn = 'prodArn';
      const populatedService = serviceInstance.populate(options);
      expect(populatedService.custom.test)
        .to.equal('devArn xxx prodArn');
      delete process.env.dev_arn;
      delete process.env.prod_arn;
    });

    it('should populate from deep any type properties in self service', () => {
      const data = {
        service: 'testService',
        provider: 'testProvider',
        custom: {
          customObj: {
            prop1: 1,
            prop2: {
              subProp1: 'subProp1',
            },
          },
          selfVarRef: '${self.custom.customObj.prop1}',
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
      const populatedService = serviceInstance.populate();
      expect(populatedService.custom.selfVarRef)
        .to.equal(data.custom.customObj.prop1);
      expect(typeof populatedService.custom.selfVarRef)
        .to.equal('number');
    });

    it('should populate all when the referenced variable contains a variable', () => {
      const data = {
        service: 'testService',
        provider: 'testProvider',
        custom: {
          selfVarRef: '${self.custom.customObj.prop2.subProp1}',
          customObj: {
            prop1: 'world',
            prop2: {
              subProp1: 'hello ${self.custom.customObj.prop1}',
            },
          },
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
      const populatedService = serviceInstance.populate();
      expect(populatedService.custom.selfVarRef)
        .to.equal('hello world');
    });

    it('should throw error when referencing sub properties with invalid syntax', () => {
      const SUtils = new Utils();
      const tmpDirPath = path.join(os.tmpdir(), (new Date).getTime().toString());
      const configYml = {
        test: 1,
        test2: 'test2',
        testObj: {
          sub: 2,
          prob: 'prob',
        },
      };

      SUtils.writeFileSync(path.join(tmpDirPath, 'config.yml'),
        YAML.dump(configYml));
      serverless.config.update({ servicePath: tmpDirPath });

      const data = {
        service: 'testService',
        provider: 'testProvider',
        custom: {
          anotherFile: '${file(./config.yml)testObj.prob}',
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
      expect(() => serviceInstance.populate()).to.throw(Error);
    });

    it('should throw error when referencing non-existing sub properties of a file', () => {
      const SUtils = new Utils();
      const tmpDirPath = path.join(os.tmpdir(), (new Date).getTime().toString());
      const configYml = {
        test: 1,
        test2: 'test2',
        testObj: {
          sub: 2,
          prob: 'prob',
        },
      };

      SUtils.writeFileSync(path.join(tmpDirPath, 'config.yml'),
        YAML.dump(configYml));
      serverless.config.update({ servicePath: tmpDirPath });

      const data = {
        service: 'testService',
        provider: 'testProvider',
        custom: {
          anotherFile: '${file(./config.yml).testObj.probDoesNotExist}',
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
      expect(() => serviceInstance.populate()).to.throw(Error);
    });

    it('should throw error on non string variables from a file as a substring', () => {
      const SUtils = new Utils();
      const tmpDirPath = path.join(os.tmpdir(), (new Date).getTime().toString());
      const configYml = {
        test: 1,
        test2: 'test2',
        testObj: {
          sub: 2,
          prob: 'prob',
        },
      };

      SUtils.writeFileSync(path.join(tmpDirPath, 'config.yml'),
        YAML.dump(configYml));
      serverless.config.update({ servicePath: tmpDirPath });

      const data = {
        service: 'testService',
        provider: 'testProvider',
        custom: {
          anotherFile: '${file(./config.yml).testObj.prob}--${file(./config.yml).test}',
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
      expect(() => serviceInstance.populate()).to.throw(Error);
    });

    it('should throw error when populating non string as substring from self service', () => {
      const data = {
        service: 'testService',
        provider: 'testProvider',
        custom: {
          customObj: {
            prop1: 1,
            prop2: {
              subProp1: 'subProp1',
            },
          },
          selfVarRef: 'this is a string: ${self.custom.customObj.prop1}',
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
      expect(() => serviceInstance.populate())
        .to.throw(Error);
    });

    it('should throw error when populating from self service with invalid property', () => {
      const data = {
        service: 'testService',
        provider: 'testProvider',
        custom: {
          customObj: {
            prop1: 1,
            prop2: {
              subProp1: 'subProp1',
            },
          },
          selfVarRef: '${self.custom.invalidCustomObj.prop3}',
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
      expect(() => serviceInstance.populate())
        .to.throw(Error);
    });

    it('should throw error when referencing the entire serverless.yml file', () => {
      const data = {
        service: 'testService',
        provider: 'testProvider',
        custom: {
          customObj: {
            prop1: 1,
            prop2: {
              subProp1: 'subProp1',
            },
          },
          varRef: '${self}',
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
      expect(() => serviceInstance.populate())
        .to.throw(Error);
    });

    it('should throw error when populating env vars strings as objects', () => {
      const data = {
        service: 'testService',
        provider: 'testProvider',
        custom: {
          customObj: {
            prop1: 1,
            prop2: {
              subProp1: 'subProp1',
            },
          },
          envVarRef: '${env.var.subProp}',
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
      expect(() => serviceInstance.populate())
        .to.throw(Error);
    });

    it('should throw error when populating undefined env vars', () => {
      const data = {
        service: 'testService',
        provider: 'testProvider',
        custom: {
          customObj: {
            prop1: 1,
            prop2: {
              subProp1: 'subProp1',
            },
          },
          envVarRef: '${env.undefinedVar}',
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
      expect(() => serviceInstance.populate())
        .to.throw(Error);
    });

    it('should throw error when populating option strings as objects', () => {
      const data = {
        service: 'testService',
        provider: 'testProvider',
        custom: {
          customObj: {
            prop1: 1,
            prop2: {
              subProp1: 'subProp1',
            },
          },
          optVarRef: '${opt.stage.subProp}',
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
      const options = {
        stage: 'prod',
        region: 'us-east-1',
      };
      const serviceInstance = new Service(serverless, data);
      expect(() => serviceInstance.populate(options))
        .to.throw(Error);
    });

    it('should throw error when populating option obj as sub string', () => {
      const data = {
        service: 'testService',
        provider: 'testProvider',
        custom: {
          customObj: {
            prop1: 1,
            prop2: {
              subProp1: 'subProp1',
            },
          },
          optVarRef: 'this is a string: ${opt}',
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
      const options = {
        stage: 'prod',
        region: 'us-east-1',
      };
      const serviceInstance = new Service(serverless, data);
      expect(() => serviceInstance.populate(options))
        .to.throw(Error);
    });

    it('should throw error when populating an option that was not passed', () => {
      const data = {
        service: 'testService',
        provider: 'testProvider',
        custom: {
          customObj: {
            prop1: 1,
            prop2: {
              subProp1: 'subProp1',
            },
          },
          optVarRef: 'this is a string: ${opt.unPassedOption}',
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
      const options = {
        stage: 'prod',
        region: 'us-east-1',
      };
      const serviceInstance = new Service(serverless, data);
      expect(() => serviceInstance.populate(options))
        .to.throw(Error);
    });

    it('should throw error when referencing invalid source', () => {
      const data = {
        service: 'testService',
        provider: 'testProvider',
        custom: {
          customObj: {
            prop1: 1,
            prop2: {
              subProp1: 'subProp1',
            },
          },
          varRef: '${src.var}',
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
      expect(() => serviceInstance.populate())
        .to.throw(Error);
    });


    it('should throw an error if there is an issue in a complex nested variable references', () => {
      const data = {
        service: 'testService',
        provider: {
          name: 'aws',
        },
        custom: {
          test: '${env.${opt.${self.provider}}_arn} xxx ${env.${opt.${opt.test}}_arn}',
          selfVarRef: 'stageA',
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
      const options = {
        stageA: 'dev',
        stageB: 'prod',
        test: 'stageB',
      };
      process.env.dev_arn = 'devArn';
      process.env.prod_arn = 'prodArn';
      expect(() => serviceInstance.populate(options))
        .to.throw(Error);
      delete process.env.dev_arn;
      delete process.env.prod_arn;
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
