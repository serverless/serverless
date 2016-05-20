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
    const S = new Serverless();

    it('should attach serverless instance', () => {
      const serviceInstance = new Service(S);
      expect(typeof serviceInstance.S.version).to.be.equal('string');
    });

    it('should construct with defaults', () => {
      const serviceInstance = new Service(S);

      expect(serviceInstance.service).to.be.equal(null);
      expect(serviceInstance.custom).to.deep.equal({});
      expect(serviceInstance.plugins).to.deep.equal([]);
      expect(serviceInstance.functions).to.deep.equal({});
      expect(serviceInstance.environment).to.deep.equal({});
      expect(serviceInstance.resources).to.deep.equal({});
    });

    it('should construct with data', () => {
      const data = {
        service: 'testService',
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
      };

      const serviceInstance = new Service(S, data);

      expect(serviceInstance.service).to.be.equal('testService');
      expect(serviceInstance.custom).to.deep.equal({ customProp: 'value' });
      expect(serviceInstance.plugins).to.deep.equal(['testPlugin']);
      expect(serviceInstance.functions).to.deep.equal({ functionA: {} });
      expect(serviceInstance.environment).to.deep.equal({});
      expect(serviceInstance.resources.aws).to.deep.equal({ resourcesProp: 'value' });
      expect(serviceInstance.resources.azure).to.deep.equal({});
      expect(serviceInstance.resources.google).to.deep.equal({});
    });
  });

  describe('#load()', () => {
    let serviceInstance;
    before(() => {
      const SUtils = new Utils();
      const tmpDirPath = path.join(os.tmpdir(), (new Date).getTime().toString());
      const serverlessYaml = {
        service: '${testVar}',
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
      };
      const serverlessEnvYaml = {
        vars: {
          testVar: 'commonVar',
          testDigit: 10,
          testSubstring: 'World',
        },
        stages: {
          dev: {
            vars: {
              testVar: 'stageVar',
            },
            regions: {
              aws_useast1: {
                vars: {
                  testVar: 'regionVar',
                },
              },
            },
          },
        },
      };

      SUtils.writeFileSync(path.join(tmpDirPath, 'serverless.yaml'),
        YAML.dump(serverlessYaml));
      SUtils.writeFileSync(path.join(tmpDirPath, 'serverless.env.yaml'),
        YAML.dump(serverlessEnvYaml));

      const S = new Serverless({ servicePath: tmpDirPath });
      serviceInstance = new Service(S);
    });

    it('should throw error if servicePath not configured', () => {
      const S = new Serverless();
      const invalidService = new Service(S);
      expect(() => invalidService.load()).to.throw(Error);
    });

    /*
     * Even though I wanna split this into multiple test cases
     * that would mean loading from the filesystem on each test case (slow!!)
     * and because the load() method returns a promise
     * I can't put it in a before() block
     */
    it('should load and populate from filesystem', () => {
      const commonVars = {
        testVar: 'commonVar',
        testDigit: 10,
        testSubstring: 'World',
      };
      return serviceInstance.load().then((loadedService) => {
        expect(loadedService.service).to.be.equal('commonVar');
        expect(loadedService.plugins).to.deep.equal(['testPlugin']);
        expect(loadedService.environment.vars).to.deep.equal(commonVars);
        expect(serviceInstance.environment.stages.dev.regions.aws_useast1.vars.testVar)
          .to.be.equal('regionVar');
        expect(loadedService.resources.aws).to.deep.equal({ resourcesProp: 'value' });
        expect(loadedService.resources.azure).to.deep.equal({});
        expect(loadedService.resources.google).to.deep.equal({});
      });
    });

    it('should load and populate stage vars', () => {
      const options = {
        stage: 'dev',
      };
      return serviceInstance.load(options).then((loadedService) => {
        expect(loadedService.service).to.be.equal('stageVar');
      });
    });

    it('should load and populate region vars', () => {
      const options = {
        stage: 'dev',
        region: 'aws_useast1',
      };
      return serviceInstance.load(options).then((loadedService) => {
        expect(loadedService.service).to.be.equal('regionVar');
      });
    });

    it('should load and populate non string variables', () => {
      return serviceInstance.load().then((loadedService) => {
        expect(loadedService.custom.digit).to.be.equal(10);
      });
    });

    it('should load and populate substring variables', () => {
      return serviceInstance.load().then((loadedService) => {
        expect(loadedService.custom.substring).to.be.equal('Hello World');
      });
    });

    it('should load and populate with custom variable syntax', () => {
      serviceInstance.service = '${{testVar}}';
      serviceInstance.variableSyntax = '\\${{([\\s\\S]+?)}}';
      return serviceInstance.load().then((loadedService) => {
        expect(loadedService.service).to.be.equal('commonVar');
        delete serviceInstance.variableSyntax;
      });
    });
  });

  describe('#update()', () => {
    it('should update service instance data', () => {
      const S = new Serverless();
      const serviceInstance = new Service(S);
      const newData = { service: 'newName' };
      const updatedInstance = serviceInstance.update(newData);
      expect(updatedInstance.service).to.be.equal('newName');
    });
  });

  describe('#getFunction()', () => {
    let serviceInstance;
    before(() => {
      const S = new Serverless();
      serviceInstance = new Service(S);
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
      expect(() => { serviceInstance.getFunction('random'); }).to.throw(Error);
    });
  });

  describe('#getAllFunctions()', () => {
    it('should return an array of function names in Service', () => {
      const S = new Serverless();
      const serviceInstance = new Service(S);
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
      const S = new Serverless();
      serviceInstance = new Service(S);
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
      expect(() => { serviceInstance.getEventInFunction(null, 'list'); }).to.throw(Error);
    });

    it('should throw error if event doesnt exist in function', () => {
      expect(() => { serviceInstance.getEventInFunction('randomEvent', 'create'); })
        .to.throw(Error);
    });
  });

  describe('#getAllEventsInFunction()', () => {
    it('should return an array of events in a specified function', () => {
      const S = new Serverless();
      const serviceInstance = new Service(S);
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
      const S = new Serverless();
      serviceInstance = new Service(S);
      serviceInstance.environment = {
        vars: {},
        stages: {
          dev: {
            vars: {},
            regions: {
              aws_useast1: {
                vars: {},
              },
            },
          },
        },
      };
    });

    it('should return stage object', () => {
      const expectedStageObj = {
        vars: {},
        regions: {
          aws_useast1: {
            vars: {},
          },
        },
      };
      expect(serviceInstance.getStage('dev')).to.deep.equal(expectedStageObj);
    });

    it('should throw error if stage does not exist', () => {
      expect(() => { serviceInstance.getStage('prod'); }).to.throw(Error);
    });
  });

  describe('#getAllStages()', () => {
    it('should return an array of stage names in Service', () => {
      const S = new Serverless();
      const serviceInstance = new Service(S);
      serviceInstance.environment = {
        vars: {},
        stages: {
          dev: {
            vars: {},
            regions: {
              aws_useast1: {
                vars: {},
              },
            },
          },
        },
      };

      expect(serviceInstance.getAllStages()).to.deep.equal(['dev']);
    });
  });


  describe('#getRegionInStage()', () => {
    let serviceInstance;
    before(() => {
      const S = new Serverless();
      serviceInstance = new Service(S);
      serviceInstance.environment = {
        vars: {},
        stages: {
          dev: {
            vars: {},
            regions: {
              aws_useast1: {
                vars: {
                  regionVar: 'regionValue',
                },
              },
            },
          },
        },
      };
    });

    it('should return a region object based on provided stage', () => {
      expect(serviceInstance.getRegionInStage('dev', 'aws_useast1')
        .vars.regionVar).to.be.equal('regionValue');
    });

    it('should throw error if stage does not exist in service', () => {
      expect(() => { serviceInstance.getRegionInStage('prod'); }).to.throw(Error);
    });

    it('should throw error if region doesnt exist in stage', () => {
      expect(() => { serviceInstance.getRegionInStage('dev', 'aws_uswest2'); }).to.throw(Error);
    });
  });

  describe('#getAllRegionsInStage()', () => {
    it('should return an array of regions in a specified stage', () => {
      const S = new Serverless();
      const serviceInstance = new Service(S);
      serviceInstance.environment = {
        vars: {},
        stages: {
          dev: {
            vars: {},
            regions: {
              aws_useast1: {
                vars: {
                  regionVar: 'regionValue',
                },
              },
              aws_uswest2: {
                vars: {
                  regionVar: 'regionValue2',
                },
              },
            },
          },
        },
      };

      expect(serviceInstance.getAllRegionsInStage('dev'))
        .to.deep.equal(['aws_useast1', 'aws_uswest2']);
    });
  });

  describe('#getVariables()', () => {
    let serviceInstance;
    before(() => {
      const S = new Serverless();
      serviceInstance = new Service(S);
      serviceInstance.environment = {
        vars: {
          commonVar: 'commonValue',
        },
        stages: {
          dev: {
            vars: {
              stageVar: 'stageValue',
            },
            regions: {
              aws_useast1: {
                vars: {
                  regionVar: 'regionValue',
                },
              },
            },
          },
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
      expect(serviceInstance.getVariables('dev', 'aws_useast1').regionVar)
        .to.be.equal('regionValue');
    });
  });
});

