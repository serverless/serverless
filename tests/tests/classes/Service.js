'use strict';

/**
 * Test: Service Class
 */

const path = require('path');
const os = require('os');
const YAML = require('js-yaml');
const expect = require('chai').expect;
const Service = require('../../../lib/classes/Service');
const Utils = require('../../../lib/classes/Utils');
const Serverless = require('../../../lib/Serverless');



describe('Service', () => {

  after((done) => {
    done();
  });

  describe('#constructor()', () => {
    const S = new Serverless();

    it('should attach serverless instance', () => {
      const serviceInstance = new Service(S);
      expect(typeof serviceInstance.S._version).to.be.equal('string');
    });

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

  describe('#toObject()', () => {
    it('should convert service instance to object', () => {
      const S = new Serverless();
      const serviceInstance = new Service(S);
      const serviceObj = serviceInstance.toObject();

      expect(typeof serviceObj._class).to.be.equal('undefined');
    });

  });

  describe('toObjectPopulated()', () => {

    let serviceInstance;
    beforeEach(() => {
      const S = new Serverless();
      serviceInstance = new Service(S);

      serviceInstance.service = '${testVar}';
      serviceInstance.environment = {
        vars: {
          testVar: 'commonVar'
        },
        stages: {
          dev: {
            vars: {
              testVar: 'stageVar'
            },
            regions: {
              aws_useast1: {
                vars: {
                  testVar: 'regionVar'
                }
              }
            }
          }
        }
      };
    });

    it('should populate common variables', () => {
      const populatedObj = serviceInstance.toObjectPopulated();
      expect(populatedObj.service).to.be.equal('commonVar');
    });

    it('should populate stage variables', () => {
      const options = {
        stage: 'dev'
      };
      const populatedObj = serviceInstance.toObjectPopulated(options);
      expect(populatedObj.service).to.be.equal('stageVar');
    });

    it('should populate region variables', () => {
      const options = {
        stage: 'dev',
        region: 'aws_useast1'
      };
      const populatedObj = serviceInstance.toObjectPopulated(options);
      expect(populatedObj.service).to.be.equal('regionVar');
    });
  });

  describe('#fromObject()', () => {
    it('should merge an object to the instance', () => {
      const S = new Serverless();
      const serviceInstance = new Service(S);
      const newData = { service: 'newName' };
      const newInstance = serviceInstance.fromObject(newData);
      expect(newInstance.service).to.be.equal('newName');
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
                vars: {}
              }
            }
          }
        }
      };
    });

    it('should return stage object', () => {
      const expectedStageObj = {
        vars: {},
        regions: {
          aws_useast1: {
            vars: {}
          }
        }
      };
      expect(serviceInstance.getStage('dev')).to.deep.equal(expectedStageObj);
    });

    it('should throw error if stage does not exist', () => {
      expect(serviceInstance.getStage).to.throw(Error);
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
                vars: {}
              }
            }
          }
        }
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
                  regionVar: 'regionValue'
                }
              }
            }
          }
        }
      };
    });

    it('should return a region object based on provided stage', () => {
      expect(serviceInstance.getRegionInStage('dev', 'aws_useast1').vars.regionVar).to.be.equal('regionValue');
    });

    it('should throw error if stage does not exist in service', () => {
      expect(() => {serviceInstance.getRegionInStage('prod')}).to.throw(Error);
    });

    it('should throw error if region doesnt exist in stage', () => {
      expect(() => {serviceInstance.getRegionInStage('dev', 'aws_uswest2')}).to.throw(Error);
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
                  regionVar: 'regionValue'
                }
              },
              aws_uswest2: {
                vars: {
                  regionVar: 'regionValue2'
                }
              }
            }
          }
        }
      };

      expect(serviceInstance.getAllRegionsInStage('dev')).to.deep.equal(['aws_useast1', 'aws_uswest2']);
    });
  });

  describe('#getVariables()', () => {
    let serviceInstance;
    before(() => {
      const S = new Serverless();
      serviceInstance = new Service(S);
      serviceInstance.environment = {
        vars: {
          commonVar: 'commonValue'
        },
        stages: {
          dev: {
            vars: {
              stageVar: 'stageValue'
            },
            regions: {
              aws_useast1: {
                vars: {
                  regionVar: 'regionValue'
                }
              }
            }
          }
        }
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

