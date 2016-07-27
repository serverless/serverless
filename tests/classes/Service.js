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
      expect(serviceInstance.variableSyntax).to.be.equal(null);
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

    it('should load and populate from filesystem', () => {
      const SUtils = new Utils();
      const tmpDirPath = path.join(os.tmpdir(), (new Date).getTime().toString());
      const serverlessYaml = {
        service: '${testVar}',
        provider: 'aws',
        defaults: {
          stage: 'dev',
          region: 'us-east-1',
        },
        custom: {
          digit: '${testDigit}',
          substring: 'Hello ${testSubstring}',
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
      const serverlessEnvYaml = {
        vars: {
          testVar: 'commonVar',
          testDigit: 10,
          testSubstring: 'World',
        },
        stages: {
          dev: {
            vars: {},
            regions: {},
          },
        },
      };

      serverlessEnvYaml.stages.dev.regions['us-east-1'] = {
        vars: {},
      };

      SUtils.writeFileSync(path.join(tmpDirPath, 'serverless.yml'),
        YAML.dump(serverlessYaml));
      SUtils.writeFileSync(path.join(tmpDirPath, 'serverless.env.yml'),
        YAML.dump(serverlessEnvYaml));

      const serverless = new Serverless({ servicePath: tmpDirPath });
      serviceInstance = new Service(serverless);

      const commonVars = {
        testVar: 'commonVar',
        testDigit: 10,
        testSubstring: 'World',
      };
      return serviceInstance.load().then((loadedService) => {
        expect(loadedService.service).to.be.equal('commonVar');
        expect(loadedService.provider).to.deep.equal({ name: 'aws' });
        expect(loadedService.plugins).to.deep.equal(['testPlugin']);
        expect(loadedService.environment.vars).to.deep.equal(commonVars);
        expect(serviceInstance.environment.stages.dev.regions['us-east-1'].vars)
          .to.deep.equal({});
        expect(loadedService.resources.aws).to.deep.equal({ resourcesProp: 'value' });
        expect(loadedService.resources.azure).to.deep.equal({});
        expect(loadedService.resources.google).to.deep.equal({});
        expect(loadedService.package.include.length).to.equal(1);
        expect(loadedService.package.include[0]).to.equal('include-me.js');
        expect(loadedService.package.exclude.length).to.equal(1);
        expect(loadedService.package.exclude[0]).to.equal('exclude-me.js');
        expect(loadedService.package.artifact).to.equal('some/path/foo.zip');
      });
    });

    it('should load and populate stage vars', () => {
      const SUtils = new Utils();
      const tmpDirPath = path.join(os.tmpdir(), (new Date).getTime().toString());
      const serverlessYaml = {
        service: '${testVar}',
        provider: 'aws',
        functions: {},
      };
      const serverlessEnvYaml = {
        vars: {
          testVar: 'commonVar',
        },
        stages: {
          dev: {
            vars: {
              testVar: 'stageVar',
            },
            regions: {},
          },
        },
      };

      serverlessEnvYaml.stages.dev.regions['us-east-1'] = {
        vars: {},
      };

      SUtils.writeFileSync(path.join(tmpDirPath, 'serverless.yml'),
        YAML.dump(serverlessYaml));
      SUtils.writeFileSync(path.join(tmpDirPath, 'serverless.env.yml'),
        YAML.dump(serverlessEnvYaml));

      const serverless = new Serverless({ servicePath: tmpDirPath });
      serviceInstance = new Service(serverless);
      return serviceInstance.load().then((loadedService) => {
        expect(loadedService.service).to.be.equal('stageVar');
      });
    });

    it('should load and populate region vars', () => {
      const SUtils = new Utils();
      const tmpDirPath = path.join(os.tmpdir(), (new Date).getTime().toString());
      const serverlessYaml = {
        service: '${testVar}',
        provider: 'aws',
        plugins: ['testPlugin'],
        functions: {},
      };
      const serverlessEnvYaml = {
        vars: {
          testVar: 'commonVar',
        },
        stages: {
          dev: {
            vars: {
              testVar: 'stageVar',
            },
            regions: {},
          },
        },
      };

      serverlessEnvYaml.stages.dev.regions['us-east-1'] = {
        vars: {
          testVar: 'regionVar',
        },
      };

      SUtils.writeFileSync(path.join(tmpDirPath, 'serverless.yml'),
        YAML.dump(serverlessYaml));
      SUtils.writeFileSync(path.join(tmpDirPath, 'serverless.env.yml'),
        YAML.dump(serverlessEnvYaml));

      const serverless = new Serverless({ servicePath: tmpDirPath });
      serviceInstance = new Service(serverless);

      return serviceInstance.load().then((loadedService) => {
        expect(loadedService.service).to.be.equal('regionVar');
      });
    });

    it('should load and populate non string variables', () => {
      const SUtils = new Utils();
      const tmpDirPath = path.join(os.tmpdir(), (new Date).getTime().toString());
      const serverlessYaml = {
        service: 'service-name',
        provider: 'aws',
        custom: {
          digit: '${testDigit}',
        },
        functions: {},
      };
      const serverlessEnvYaml = {
        vars: {
          testDigit: 10,
        },
        stages: {
          dev: {
            vars: {},
            regions: {},
          },
        },
      };

      serverlessEnvYaml.stages.dev.regions['us-east-1'] = {
        vars: {},
      };

      SUtils.writeFileSync(path.join(tmpDirPath, 'serverless.yml'),
        YAML.dump(serverlessYaml));
      SUtils.writeFileSync(path.join(tmpDirPath, 'serverless.env.yml'),
        YAML.dump(serverlessEnvYaml));

      const serverless = new Serverless({ servicePath: tmpDirPath });
      serviceInstance = new Service(serverless);

      return serviceInstance.load()
        .then((loadedService) => {
          expect(loadedService.custom.digit).to.be.equal(10);
        });
    });

    it('should load and populate object variables', () => {
      const SUtils = new Utils();
      const tmpDirPath = path.join(os.tmpdir(), (new Date).getTime().toString());
      const serverlessYaml = {
        service: 'service-name',
        provider: 'aws',
        custom: {
          object: '${testObject}',
        },
        functions: {},
      };
      const serverlessEnvYaml = {
        vars: {
          testObject: {
            subProperty: 'test',
          },
        },
        stages: {
          dev: {
            vars: {},
            regions: {},
          },
        },
      };

      serverlessEnvYaml.stages.dev.regions['us-east-1'] = {
        vars: {},
      };

      SUtils.writeFileSync(path.join(tmpDirPath, 'serverless.yml'),
        YAML.dump(serverlessYaml));
      SUtils.writeFileSync(path.join(tmpDirPath, 'serverless.env.yml'),
        YAML.dump(serverlessEnvYaml));

      const serverless = new Serverless({ servicePath: tmpDirPath });
      serviceInstance = new Service(serverless);

      return serviceInstance.load()
        .then((loadedService) => {
          expect(loadedService.custom.object).to.deep.equal({ subProperty: 'test' });
        });
    });

    it('should load and populate object variables deep sub properties', () => {
      const SUtils = new Utils();
      const tmpDirPath = path.join(os.tmpdir(), (new Date).getTime().toString());
      const serverlessYaml = {
        service: 'service-name',
        provider: 'aws',
        custom: {
          object: '${testObject.subProperty.deepSubProperty}',
        },
        functions: {},
      };
      const serverlessEnvYaml = {
        vars: {
          testObject: {
            subProperty: {
              deepSubProperty: 'test',
            },
          },
        },
        stages: {
          dev: {
            vars: {},
            regions: {},
          },
        },
      };

      serverlessEnvYaml.stages.dev.regions['us-east-1'] = {
        vars: {},
      };

      SUtils.writeFileSync(path.join(tmpDirPath, 'serverless.yml'),
        YAML.dump(serverlessYaml));
      SUtils.writeFileSync(path.join(tmpDirPath, 'serverless.env.yml'),
        YAML.dump(serverlessEnvYaml));

      const serverless = new Serverless({ servicePath: tmpDirPath });
      serviceInstance = new Service(serverless);

      return serviceInstance.load()
        .then((loadedService) => {
          expect(loadedService.custom.object).to.be.equal('test');
        });
    });

    it('should load and populate substring variables', () => {
      const SUtils = new Utils();
      const tmpDirPath = path.join(os.tmpdir(), (new Date).getTime().toString());
      const serverlessYaml = {
        service: 'service-name',
        provider: 'aws',
        custom: {
          substring: 'Hello ${testSubstring.subProperty.deepSubProperty}',
        },
        functions: {},
      };
      const serverlessEnvYaml = {
        vars: {
          testSubstring: {
            subProperty: {
              deepSubProperty: 'World',
            },
          },
        },
        stages: {
          dev: {
            vars: {},
            regions: {},
          },
        },
      };

      serverlessEnvYaml.stages.dev.regions['us-east-1'] = {
        vars: {},
      };

      SUtils.writeFileSync(path.join(tmpDirPath, 'serverless.yml'),
        YAML.dump(serverlessYaml));
      SUtils.writeFileSync(path.join(tmpDirPath, 'serverless.env.yml'),
        YAML.dump(serverlessEnvYaml));

      const serverless = new Serverless({ servicePath: tmpDirPath });
      serviceInstance = new Service(serverless);
      return serviceInstance.load()
        .then((loadedService) => {
          expect(loadedService.custom.substring).to.be.equal('Hello World');
        });
    });

    it('should load and populate with custom variable syntax', () => {
      const SUtils = new Utils();
      const tmpDirPath = path.join(os.tmpdir(), (new Date).getTime().toString());
      const serverlessYaml = {
        service: '${{testVar}}',
        variableSyntax: '\\${{([\\s\\S]+?)}}',
        provider: 'aws',
        functions: {},
      };
      const serverlessEnvYaml = {
        vars: {
          testVar: 'commonVar',
        },
        stages: {
          dev: {
            vars: {},
            regions: {},
          },
        },
      };

      serverlessEnvYaml.stages.dev.regions['us-east-1'] = {
        vars: {},
      };

      SUtils.writeFileSync(path.join(tmpDirPath, 'serverless.yml'),
        YAML.dump(serverlessYaml));
      SUtils.writeFileSync(path.join(tmpDirPath, 'serverless.env.yml'),
        YAML.dump(serverlessEnvYaml));

      const serverless = new Serverless({ servicePath: tmpDirPath });
      serviceInstance = new Service(serverless);

      return serviceInstance.load().then((loadedService) => {
        expect(loadedService.service).to.be.equal('commonVar');
        delete serviceInstance.variableSyntax;
      });
    });

    it('should load and add events property if no events provided', () => {
      const SUtils = new Utils();
      const tmpDirPath = path.join(os.tmpdir(), (new Date).getTime().toString());
      const serverlessYaml = {
        service: 'testService',
        provider: 'aws',
        runtime: 'nodejs4.3',
        functions: {
          functionA: {},
        },
      };
      const serverlessEnvYaml = {
        vars: {},
        stages: {
          dev: {
            vars: {},
            regions: {},
          },
        },
      };

      serverlessEnvYaml.stages.dev.regions['us-east-1'] = {
        vars: {},
      };

      SUtils.writeFileSync(path.join(tmpDirPath, 'serverless.yml'),
        YAML.dump(serverlessYaml));
      SUtils.writeFileSync(path.join(tmpDirPath, 'serverless.env.yml'),
        YAML.dump(serverlessEnvYaml));

      const serverless = new Serverless({ servicePath: tmpDirPath });
      serviceInstance = new Service(serverless);
      return serviceInstance.load().then((loadedService) => {
        expect(loadedService.functions).to.be.deep.equal({ functionA: { events: [] } });
      });
    });

    it('should throw error if service property is missing', () => {
      const SUtils = new Utils();
      const tmpDirPath = path.join(os.tmpdir(), (new Date).getTime().toString());
      const serverlessYaml = {
        provider: 'aws',
        functions: {},
      };
      const serverlessEnvYaml = {
        vars: {},
        stages: {
          dev: {
            vars: {},
            regions: {},
          },
        },
      };

      serverlessEnvYaml.stages.dev.regions['us-east-1'] = {
        vars: {},
      };

      SUtils.writeFileSync(path.join(tmpDirPath, 'serverless.yml'),
        YAML.dump(serverlessYaml));
      SUtils.writeFileSync(path.join(tmpDirPath, 'serverless.env.yml'),
        YAML.dump(serverlessEnvYaml));

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
      const serverlessYaml = {
        service: 'service-name',
        functions: {},
      };
      const serverlessEnvYaml = {
        vars: {},
        stages: {
          dev: {
            vars: {},
            regions: {},
          },
        },
      };

      serverlessEnvYaml.stages.dev.regions['us-east-1'] = {
        vars: {},
      };

      SUtils.writeFileSync(path.join(tmpDirPath, 'serverless.yml'),
        YAML.dump(serverlessYaml));
      SUtils.writeFileSync(path.join(tmpDirPath, 'serverless.env.yml'),
        YAML.dump(serverlessEnvYaml));

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
      const serverlessYaml = {
        service: 'service-name',
        provider: 'invalid',
        functions: {},
      };
      const serverlessEnvYaml = {
        vars: {},
        stages: {
          dev: {
            vars: {},
            regions: {},
          },
        },
      };

      serverlessEnvYaml.stages.dev.regions['us-east-1'] = {
        vars: {},
      };

      SUtils.writeFileSync(path.join(tmpDirPath, 'serverless.yml'),
        YAML.dump(serverlessYaml));
      SUtils.writeFileSync(path.join(tmpDirPath, 'serverless.env.yml'),
        YAML.dump(serverlessEnvYaml));

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
      const serverlessYaml = {
        service: 'service-name',
        provider: 'aws',
      };
      const serverlessEnvYaml = {
        vars: {},
        stages: {
          dev: {
            vars: {},
            regions: {},
          },
        },
      };

      serverlessEnvYaml.stages.dev.regions['us-east-1'] = {
        vars: {},
      };

      SUtils.writeFileSync(path.join(tmpDirPath, 'serverless.yml'),
        YAML.dump(serverlessYaml));
      SUtils.writeFileSync(path.join(tmpDirPath, 'serverless.env.yml'),
        YAML.dump(serverlessEnvYaml));

      const serverless = new Serverless({ servicePath: tmpDirPath });
      serviceInstance = new Service(serverless);

      return serviceInstance.load().then(loadedService => {
        expect(loadedService.functions).to.equal(true);
      }).catch(e => {
        expect(e.name).to.be.equal('ServerlessError');
      });
    });

    it('should throw error if variable does not exist', () => {
      const SUtils = new Utils();
      const tmpDirPath = path.join(os.tmpdir(), (new Date).getTime().toString());
      const serverlessYaml = {
        service: 'service-name',
        provider: 'aws',
        custom: {
          object: '${testVar}',
        },
        functions: {},
      };
      const serverlessEnvYaml = {
        vars: {},
        stages: {
          dev: {
            vars: {},
            regions: {},
          },
        },
      };

      serverlessEnvYaml.stages.dev.regions['us-east-1'] = {
        vars: {},
      };

      SUtils.writeFileSync(path.join(tmpDirPath, 'serverless.yml'),
        YAML.dump(serverlessYaml));
      SUtils.writeFileSync(path.join(tmpDirPath, 'serverless.env.yml'),
        YAML.dump(serverlessEnvYaml));

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

    it('should throw error if we try to access sub property of string variable', () => {
      const SUtils = new Utils();
      const tmpDirPath = path.join(os.tmpdir(), (new Date).getTime().toString());
      const serverlessYaml = {
        service: 'service-name',
        provider: 'aws',
        custom: {
          testVar: '${testVar.subProperty}',
        },
        functions: {},
      };
      const serverlessEnvYaml = {
        vars: {
          testVar: 'test',
        },
        stages: {
          dev: {
            vars: {},
            regions: {},
          },
        },
      };

      serverlessEnvYaml.stages.dev.regions['us-east-1'] = {
        vars: {},
      };

      SUtils.writeFileSync(path.join(tmpDirPath, 'serverless.yml'),
        YAML.dump(serverlessYaml));
      SUtils.writeFileSync(path.join(tmpDirPath, 'serverless.env.yml'),
        YAML.dump(serverlessEnvYaml));

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

    it('should throw error if we try to access sub property of non-object variable', () => {
      const SUtils = new Utils();
      const tmpDirPath = path.join(os.tmpdir(), (new Date).getTime().toString());
      const serverlessYaml = {
        service: 'service-name',
        provider: 'aws',
        custom: {
          testVar: '${testVar.subProperty}',
        },
        functions: {},
      };
      const serverlessEnvYaml = {
        vars: {
          testVar: 10,
        },
        stages: {
          dev: {
            vars: {},
            regions: {},
          },
        },
      };

      serverlessEnvYaml.stages.dev.regions['us-east-1'] = {
        vars: {},
      };

      SUtils.writeFileSync(path.join(tmpDirPath, 'serverless.yml'),
        YAML.dump(serverlessYaml));
      SUtils.writeFileSync(path.join(tmpDirPath, 'serverless.env.yml'),
        YAML.dump(serverlessEnvYaml));

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

    it('should throw error if sub property does not exist in object at any level', () => {
      const SUtils = new Utils();
      const tmpDirPath = path.join(os.tmpdir(), (new Date).getTime().toString());
      const serverlessYaml = {
        service: 'service-name',
        provider: 'aws',
        custom: {
          testObject: '${testObject.subProperty.deepSubProperty}',
        },
        functions: {},
      };
      const serverlessEnvYaml = {
        vars: {
          testObject: {
            subProperty: 'string',
          },
        },
        stages: {
          dev: {
            vars: {},
            regions: {},
          },
        },
      };

      serverlessEnvYaml.stages.dev.regions['us-east-1'] = {
        vars: {},
      };

      SUtils.writeFileSync(path.join(tmpDirPath, 'serverless.yml'),
        YAML.dump(serverlessYaml));
      SUtils.writeFileSync(path.join(tmpDirPath, 'serverless.env.yml'),
        YAML.dump(serverlessEnvYaml));

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

    it('should throw error if trying to populate non string vars into string', () => {
      const SUtils = new Utils();
      const tmpDirPath = path.join(os.tmpdir(), (new Date).getTime().toString());
      const serverlessYaml = {
        service: 'service-name',
        provider: 'aws',
        custom: {
          testVar: '${testVar} String',
        },
        functions: {},
      };
      const serverlessEnvYaml = {
        vars: {
          testVar: 10,
        },
        stages: {
          dev: {
            vars: {},
            regions: {},
          },
        },
      };

      serverlessEnvYaml.stages.dev.regions['us-east-1'] = {
        vars: {},
      };

      SUtils.writeFileSync(path.join(tmpDirPath, 'serverless.yml'),
        YAML.dump(serverlessYaml));
      SUtils.writeFileSync(path.join(tmpDirPath, 'serverless.env.yml'),
        YAML.dump(serverlessEnvYaml));

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

    it('should throw error if trying to populate non string deep vars into string', () => {
      const SUtils = new Utils();
      const tmpDirPath = path.join(os.tmpdir(), (new Date).getTime().toString());
      const serverlessYaml = {
        service: 'service-name',
        provider: 'aws',
        custom: {
          testObject: '${testObject.subProperty} String',
        },
        functions: {},
      };
      const serverlessEnvYaml = {
        vars: {
          testObject: {
            subProperty: {
              deepSubProperty: 'string',
            },
          },
        },
        stages: {
          dev: {
            vars: {},
            regions: {},
          },
        },
      };

      serverlessEnvYaml.stages.dev.regions['us-east-1'] = {
        vars: {},
      };

      SUtils.writeFileSync(path.join(tmpDirPath, 'serverless.yml'),
        YAML.dump(serverlessYaml));
      SUtils.writeFileSync(path.join(tmpDirPath, 'serverless.env.yml'),
        YAML.dump(serverlessEnvYaml));

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

  describe('#getStage()', () => {
    let serviceInstance;
    before(() => {
      const serverless = new Serverless();
      serviceInstance = new Service(serverless);
      serviceInstance.environment = {
        vars: {},
        stages: {
          dev: {
            vars: {},
            regions: {},
          },
        },
      };

      serviceInstance.environment.stages.dev.regions['us-east-1'] = {
        vars: {},
      };
    });

    it('should return stage object', () => {
      const expectedStageObj = {
        vars: {},
        regions: {},
      };
      expectedStageObj.regions['us-east-1'] = {
        vars: {},
      };
      expect(serviceInstance.getStage('dev')).to.deep.equal(expectedStageObj);
    });

    it('should throw error if stage does not exist', () => {
      expect(() => {
        serviceInstance.getStage('prod');
      }).to.throw(Error);
    });
  });

  describe('#getAllStages()', () => {
    it('should return an array of stage names in Service', () => {
      const serverless = new Serverless();
      const serviceInstance = new Service(serverless);
      serviceInstance.environment = {
        vars: {},
        stages: {
          dev: {
            vars: {},
            regions: {},
          },
        },
      };

      serviceInstance.environment.stages.dev.regions['us-east-1'] = {
        vars: {},
      };

      expect(serviceInstance.getAllStages()).to.deep.equal(['dev']);
    });
  });


  describe('#getRegionInStage()', () => {
    let serviceInstance;
    before(() => {
      const serverless = new Serverless();
      serviceInstance = new Service(serverless);
      serviceInstance.environment = {
        vars: {},
        stages: {
          dev: {
            vars: {},
            regions: {},
          },
        },
      };

      serviceInstance.environment.stages.dev.regions['us-east-1'] = {
        vars: {
          regionVar: 'regionValue',
        },
      };
    });

    it('should return a region object based on provided stage', () => {
      expect(serviceInstance.getRegionInStage('dev', 'us-east-1')
        .vars.regionVar).to.be.equal('regionValue');
    });

    it('should throw error if stage does not exist in service', () => {
      expect(() => {
        serviceInstance.getRegionInStage('prod');
      }).to.throw(Error);
    });

    it('should throw error if region doesnt exist in stage', () => {
      expect(() => {
        serviceInstance.getRegionInStage('dev', 'us-west-2');
      }).to.throw(Error);
    });
  });

  describe('#getAllRegionsInStage()', () => {
    it('should return an array of regions in a specified stage', () => {
      const serverless = new Serverless();
      const serviceInstance = new Service(serverless);
      serviceInstance.environment = {
        vars: {},
        stages: {
          dev: {
            vars: {},
            regions: {},
          },
        },
      };

      serviceInstance.environment.stages.dev.regions['us-east-1'] = {
        vars: {
          regionVar: 'regionValue',
        },
      };

      serviceInstance.environment.stages.dev.regions['us-west-2'] = {
        vars: {
          regionVar: 'regionValue',
        },
      };

      expect(serviceInstance.getAllRegionsInStage('dev'))
        .to.deep.equal(['us-east-1', 'us-west-2']);
    });
  });

  describe('#getVariables()', () => {
    let serviceInstance;
    before(() => {
      const serverless = new Serverless();
      serviceInstance = new Service(serverless);
      serviceInstance.environment = {
        vars: {
          commonVar: 'commonValue',
        },
        stages: {
          dev: {
            vars: {
              stageVar: 'stageValue',
            },
            regions: {},
          },
        },
      };

      serviceInstance.environment.stages.dev.regions['us-east-1'] = {
        vars: {
          regionVar: 'regionValue',
        },
      };
    });

    it('should return common variables if no stage/region provided', () => {
      expect(serviceInstance.getVariables().commonVar).to.be.equal('commonValue');
    });

    it('should return stage variables if no region provided', () => {
      expect(serviceInstance.getVariables('dev').stageVar).to.be.equal('stageValue');
    });

    it('should return region variables if both stage and region provided', () => {
      expect(serviceInstance.getVariables('dev', 'us-east-1').regionVar)
        .to.be.equal('regionValue');
    });
  });
});
