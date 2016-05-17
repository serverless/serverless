'use strict';

/**
 * Test: Service Class
 */

const path = require('path');
const os = require('os');
const YAML = require('js-yaml');
const expect = require('chai').expect;
const Service = require('../../../lib/classes/Service');
const SError = require('../../../lib/classes/Error');
const Utils = require('../../../lib/classes/Utils');
const Serverless = require('../../../lib/Serverless');



describe('Service', () => {

  after((done) => {
    done();
  });

  describe('#constructor()', () => {
    const S = new Serverless();


    it('should construct with defaults', () => {
      const serviceInstance = new Service(S);

      expect(serviceInstance.service).to.be.equal(null);
      expect(serviceInstance.custom).to.deep.equal({});
      expect(serviceInstance.plugins).to.deep.equal([]);
      expect(serviceInstance.functions).to.deep.equal({});
      expect(serviceInstance.environment).to.deep.equal({});
      expect(serviceInstance.resources.aws).to.deep.equal({});
      expect(serviceInstance.resources.azure).to.deep.equal({});
      expect(serviceInstance.resources.google).to.deep.equal({});

    });

    it('should construct with data', () => {
      const data = {
        service: 'testService',
        custom: {
          customProp: 'value'
        },
        plugins: ['testPlugin'],
        functions: {
          functionA: {}
        },
        resources: {
          aws: {
            resourcesProp: 'value'
          },
          azure: {},
          google: {}
        }
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
        service: 'testService',
        custom: {
          customProp: 'value'
        },
        plugins: ['testPlugin'],
        functions: {
          functionA: {}
        },
        resources: {
          aws: {
            resourcesProp: 'value'
          },
          azure: {},
          google: {}
        }
      };
      const serverlessEnvYaml = {
        vars: {
          varA: 'varA'
        },
        stages: {
          dev: {
            vars: {
              varB: 'varB'
            },
            regions: {
              aws_useast1: {
                vars: {
                  varC: 'varC'
                }
              }
            }
          }
        }
      };
      SUtils.writeFileSync(path.join(tmpDirPath, 'serverless.yaml'), YAML.dump(serverlessYaml));
      SUtils.writeFileSync(path.join(tmpDirPath, 'serverless.env.yaml'), YAML.dump(serverlessEnvYaml));

      const S = new Serverless({ servicePath: tmpDirPath })
      serviceInstance = new Service(S);
    });

    /*
     * I wanna split this into seperate tests, but that would mean reading
     * from the file system on every test, because the load() method returns a promise
     * so we can't keep it in the before() block
     */
    it('should load from filesystem', () => {

      return serviceInstance.load().then((serviceInstance) => {
        expect(serviceInstance.service).to.be.equal('testService');
        expect(serviceInstance.custom).to.deep.equal({ customProp: 'value' });
        expect(serviceInstance.plugins).to.deep.equal(['testPlugin']);
        expect(serviceInstance.environment.vars).to.deep.equal({ varA: 'varA' });
        expect(serviceInstance.environment.stages.dev.regions.aws_useast1.vars.varC).to.be.equal('varC');
        expect(serviceInstance.resources.aws).to.deep.equal({ resourcesProp: 'value' });
        expect(serviceInstance.resources.azure).to.deep.equal({});
        expect(serviceInstance.resources.google).to.deep.equal({});
      });

    });

    it('should throw error if servicePath not configured', () => {
      const S = new Serverless();
      serviceInstance = new Service(S);

      expect(serviceInstance.load).to.throw(Error);

    });

  });

  describe('#save()', () => {

    it('should save data', () => {

    });

  });

  describe('#toObject()', () => {

    it('should convert service instance to object', () => {
      const S = new Serverless();
      const serviceInstance = new Service(S);
      const serviceObj = serviceInstance.toObject();

      expect(typeof serviceObj._class).to.be.equal('undefined');
    });

  });

  describe('toObjectPopulated()', () => {

    const S = new Serverless();
    const serviceInstance = new Service(S);
    serviceInstance.

    expect(typeof serviceObj._class).to.be.equal('undefined');

    it('should populate common variables', () => {

    });

    it('should populate stage variables', () => {

    });

    it('should populate region variables', () => {

    });

    it('should populate region variables before stage and common variables', () => {

    });
  });

  describe('#fromObject()', () => {
    it('should merge an object to the instance', () => {

    });
  });

  describe('#getResources()', () => {
    it('should throw an error if provider is not supported', () => {

    });

    it('should return resources based on provider', () => {

    });
  });

  describe('#getStage()', () => {
    it('should return stage object', () => {

    });

    it('should throw error if stage does not exist', () => {

    });
  });

  describe('#getAllStages()', () => {
    it('should return an array of stages in Service', () => {

    });
  });

  describe('#getRegionInStage()', () => {
    it('should return a region object based on provided stage', () => {

    });

    it('should throw error if stage does not exist in service', () => {

    });

    it('should throw error if region doesnt exist in stage', () => {

    });
  });

  describe('#getAllRegionsInStage()', () => {
    it('should return an array of regions in a specified stage', () => {

    });
  });

  describe('#getVariables()', () => {
    it('should return common variables if no stage/region provided', () => {

    });

    it('should return stage variables if no region provided', () => {

    });

    it('should return region variables if both stage and region provided', () => {

    });
  });

});
