'use strict';

/* eslint-disable no-unused-expressions */

const jc = require('json-cycle');
const path = require('path');
const proxyquire = require('proxyquire');
const YAML = require('js-yaml');
const chai = require('chai');
const Variables = require('../../lib/classes/Variables');
const Utils = require('../../lib/classes/Utils');
const fse = require('../utils/fs/fse');
const Serverless = require('../../lib/Serverless');
const sinon = require('sinon');
const testUtils = require('../../tests/utils');
const slsError = require('./Error');
const AwsProvider = require('../plugins/aws/provider/awsProvider');
const BbPromise = require('bluebird');
const os = require('os');

chai.use(require('chai-as-promised'));
chai.use(require('sinon-chai'));

const expect = chai.expect;

describe('Variables', () => {
  describe('#constructor()', () => {
    const serverless = new Serverless();

    it('should attach serverless instance', () => {
      const variablesInstance = new Variables(serverless);
      expect(typeof variablesInstance.serverless.version).to.be.equal('string');
    });

    it('should not set variableSyntax in constructor', () => {
      const variablesInstance = new Variables(serverless);
      expect(variablesInstance.variableSyntax).to.be.undefined;
    });
  });

  describe('#loadVariableSyntax()', () => {
    it('should set variableSyntax', () => {
      const serverless = new Serverless();

      serverless.service.provider.variableSyntax = '\\${{([ ~:a-zA-Z0-9._\'",\\-\\/\\(\\)]+?)}}';

      serverless.variables.loadVariableSyntax();
      expect(serverless.variables.variableSyntax).to.be.a('RegExp');
    });
  });

  describe('#populateService()', () => {
    it('should call populateProperty method', () => {
      const serverless = new Serverless();

      const populatePropertyStub = sinon
        .stub(serverless.variables, 'populateObject').resolves();

      return expect(serverless.variables.populateService()).to.be.fulfilled
      .then(() => {
        expect(populatePropertyStub.called).to.be.true;
      })
      .finally(() => serverless.variables.populateObject.restore());
    });

    it('should use variableSyntax', () => {
      const serverless = new Serverless();

      const variableSyntax = '\\${{([ ~:a-zA-Z0-9._\'",\\-\\/\\(\\)]+?)}}';
      const fooValue = '${clientId()}';
      const barValue = 'test';

      serverless.service.provider.variableSyntax = variableSyntax;

      serverless.service.custom = {
        var: barValue,
      };

      serverless.service.resources = {
        foo: fooValue,
        bar: '${{self:custom.var}}',
      };

      return serverless.variables.populateService().then(() => {
        expect(serverless.service.provider.variableSyntax).to.equal(variableSyntax);
        expect(serverless.service.resources.foo).to.equal(fooValue);
        expect(serverless.service.resources.bar).to.equal(barValue);
      });
    });
  });

  describe('#populateObject()', () => {
    it('should call populateProperty method', () => {
      const serverless = new Serverless();
      const object = {
        stage: '${opt:stage}',
      };

      const populatePropertyStub = sinon
        .stub(serverless.variables, 'populateProperty').resolves('prod');

      return serverless.variables.populateObject(object).then(() => {
        expect(populatePropertyStub.called).to.be.true;
      })
      .finally(() => serverless.variables.populateProperty.restore());
    });

    it('should populate object and return it', () => {
      const serverless = new Serverless();
      const object = {
        stage: '${opt:stage}',
      };
      const expectedPopulatedObject = {
        stage: 'prod',
      };

      sinon.stub(serverless.variables, 'populateProperty').resolves('prod');

      return serverless.variables.populateObject(object).then(populatedObject => {
        expect(populatedObject).to.deep.equal(expectedPopulatedObject);
      })
      .finally(() => serverless.variables.populateProperty.restore());
    });

    it('should persist keys with dot notation', () => {
      const serverless = new Serverless();
      const object = {
        stage: '${opt:stage}',
      };
      object['some.nested.key'] = 'hello';
      const expectedPopulatedObject = {
        stage: 'prod',
      };
      expectedPopulatedObject['some.nested.key'] = 'hello';

      const populatePropertyStub = sinon.stub(serverless.variables, 'populateProperty');
      populatePropertyStub.onCall(0).resolves('prod');
      populatePropertyStub.onCall(1).resolves('hello');

      return serverless.variables.populateObject(object).then(populatedObject => {
        expect(populatedObject).to.deep.equal(expectedPopulatedObject);
      })
      .finally(() => serverless.variables.populateProperty.restore());
    });
    describe('significant variable usage corner cases', () => {
      let serverless;
      let service;
      const makeDefault = () => ({
        service: 'my-service',
        provider: {
          name: 'aws',
        },
      });
      beforeEach(() => {
        serverless = new Serverless();
        service = makeDefault();
        service.provider.variableSyntax = '\\${([ ~:a-zA-Z0-9._\'",\\-\\/\\(\\)]+?)}'; // default
        serverless.variables.service = service;
        serverless.variables.loadVariableSyntax();
        delete service.provider.variableSyntax;
      });
      it('should properly replace self-references', () => {
        service.custom = {
          me: '${self:}',
        };
        const expected = makeDefault();
        expected.custom = {
          me: expected,
        };
        return expect(serverless.variables.populateObject(service).then((result) => {
          expect(jc.stringify(result)).to.eql(jc.stringify(expected));
        })).to.be.fulfilled;
      });
      it('should properly populate embedded variables', () => {
        service.custom = {
          val0: 'my value 0',
          val1: '0',
          val2: '${self:custom.val${self:custom.val1}}',
        };
        const expected = {
          val0: 'my value 0',
          val1: '0',
          val2: 'my value 0',
        };
        return expect(serverless.variables.populateObject(service.custom).then((result) => {
          expect(result).to.eql(expected);
        })).to.be.fulfilled;
      });
      it('should properly populate an overwrite with a default value that is a string', () => {
        service.custom = {
          val0: 'my value',
          val1: '${self:custom.NOT_A_VAL1, self:custom.NOT_A_VAL2, "string"}',
        };
        const expected = {
          val0: 'my value',
          val1: 'string',
        };
        return expect(serverless.variables.populateObject(service.custom).then((result) => {
          expect(result).to.eql(expected);
        })).to.be.fulfilled;
      });
      it('should properly populate overwrites where the first value is valid', () => {
        service.custom = {
          val0: 'my value',
          val1: '${self:custom.val0, self:custom.NOT_A_VAL1, self:custom.NOT_A_VAL2}',
        };
        const expected = {
          val0: 'my value',
          val1: 'my value',
        };
        return expect(serverless.variables.populateObject(service.custom).then((result) => {
          expect(result).to.eql(expected);
        })).to.be.fulfilled;
      });
      it('should properly populate overwrites where the middle value is valid', () => {
        service.custom = {
          val0: 'my value',
          val1: '${self:custom.NOT_A_VAL1, self:custom.val0, self:custom.NOT_A_VAL2}',
        };
        const expected = {
          val0: 'my value',
          val1: 'my value',
        };
        return expect(serverless.variables.populateObject(service.custom).then((result) => {
          expect(result).to.eql(expected);
        })).to.be.fulfilled;
      });
      it('should properly populate overwrites where the last value is valid', () => {
        service.custom = {
          val0: 'my value',
          val1: '${self:custom.NOT_A_VAL1, self:custom.NOT_A_VAL2, self:custom.val0}',
        };
        const expected = {
          val0: 'my value',
          val1: 'my value',
        };
        return expect(serverless.variables.populateObject(service.custom).then((result) => {
          expect(result).to.eql(expected);
        })).to.be.fulfilled;
      });
      it('should properly populate overwrites with nested variables in the first value', () => {
        service.custom = {
          val0: 'my value',
          val1: 0,
          val2: '${self:custom.val${self:custom.val1}, self:custom.NO_1, self:custom.NO_2}',
        };
        const expected = {
          val0: 'my value',
          val1: 0,
          val2: 'my value',
        };
        return expect(serverless.variables.populateObject(service.custom).then((result) => {
          expect(result).to.eql(expected);
        })).to.be.fulfilled;
      });
      it('should properly populate overwrites with nested variables in the middle value', () => {
        service.custom = {
          val0: 'my value',
          val1: 0,
          val2: '${self:custom.NO_1, self:custom.val${self:custom.val1}, self:custom.NO_2}',
        };
        const expected = {
          val0: 'my value',
          val1: 0,
          val2: 'my value',
        };
        return expect(serverless.variables.populateObject(service.custom).then((result) => {
          expect(result).to.eql(expected);
        })).to.be.fulfilled;
      });
      it('should properly populate overwrites with nested variables in the last value', () => {
        service.custom = {
          val0: 'my value',
          val1: 0,
          val2: '${self:custom.NO_1, self:custom.NO_2, self:custom.val${self:custom.val1}}',
        };
        const expected = {
          val0: 'my value',
          val1: 0,
          val2: 'my value',
        };
        return expect(serverless.variables.populateObject(service.custom).then((result) => {
          expect(result).to.eql(expected);
        })).to.be.fulfilled;
      });
      it('should properly replace duplicate variable declarations', () => {
        service.custom = {
          val0: 'my value',
          val1: '${self:custom.val0}',
          val2: '${self:custom.val0}',
        };
        const expected = {
          val0: 'my value',
          val1: 'my value',
          val2: 'my value',
        };
        return expect(serverless.variables.populateObject(service.custom).then((result) => {
          expect(result).to.eql(expected);
        })).to.be.fulfilled;
      });
      it('should recursively populate, regardless of order and duplication', () => {
        service.custom = {
          val1: '${self:custom.depVal}',
          depVal: '${self:custom.val0}',
          val0: 'my value',
          val2: '${self:custom.depVal}',
        };
        const expected = {
          val1: 'my value',
          depVal: 'my value',
          val0: 'my value',
          val2: 'my value',
        };
        return expect(serverless.variables.populateObject(service.custom).then((result) => {
          expect(result).to.eql(expected);
        })).to.be.fulfilled;
      });
      const pathAsyncLoadJs = 'async.load.js';
      const makeAsyncLoadJs = () => {
        const SUtils = new Utils();
        const tmpDirPath = testUtils.getTmpDirPath();
        const fileContent = `'use strict';
let i = 0
const str = () => new Promise((resolve) => {
  setTimeout(() => {
    i += 1 // side effect
    resolve(\`my-async-value-\${i}\`)
  }, 200);
});
const obj = () => new Promise((resolve) => {
  setTimeout(() => {
    i += 1 // side effect
    resolve({
      val0: \`my-async-value-\${i}\`,
      val1: '\${opt:stage}',
    });
  }, 200);
});
module.exports = {
  str,
  obj,
};
`;
        SUtils.writeFileSync(path.join(tmpDirPath, pathAsyncLoadJs), fileContent);
        serverless.config.update({ servicePath: tmpDirPath });
      };
      it('should populate any given variable only once', () => {
        makeAsyncLoadJs();
        service.custom = {
          val1: '${self:custom.val0}',
          val2: '${self:custom.val1}',
          val0: `\${file(${pathAsyncLoadJs}):str}`,
        };
        const expected = {
          val1: 'my-async-value-1',
          val2: 'my-async-value-1',
          val0: 'my-async-value-1',
        };
        return expect(serverless.variables.populateObject(service.custom).then((result) => {
          expect(result).to.eql(expected);
        })).to.be.fulfilled;
      });
      it('should populate any given variable only once regardless of ordering or reference count',
        () => {
          makeAsyncLoadJs();
          service.custom = {
            val9: '${self:custom.val7}',
            val7: '${self:custom.val5}',
            val5: '${self:custom.val3}',
            val3: '${self:custom.val1}',
            val1: '${self:custom.val0}',
            val2: '${self:custom.val1}',
            val4: '${self:custom.val3}',
            val6: '${self:custom.val5}',
            val8: '${self:custom.val7}',
            val0: `\${file(${pathAsyncLoadJs}):str}`,
          };
          const expected = {
            val9: 'my-async-value-1',
            val7: 'my-async-value-1',
            val5: 'my-async-value-1',
            val3: 'my-async-value-1',
            val1: 'my-async-value-1',
            val2: 'my-async-value-1',
            val4: 'my-async-value-1',
            val6: 'my-async-value-1',
            val8: 'my-async-value-1',
            val0: 'my-async-value-1',
          };
          return expect(serverless.variables.populateObject(service.custom).then((result) => {
            expect(result).to.eql(expected);
          })).to.be.fulfilled;
        }
      );
      it('should populate async objects with contained variables',
        () => {
          makeAsyncLoadJs();
          serverless.variables.options = {
            stage: 'dev',
          };
          service.custom = {
            obj: `\${file(${pathAsyncLoadJs}):obj}`,
          };
          const expected = {
            obj: {
              val0: 'my-async-value-1',
              val1: 'dev',
            },
          };
          return expect(serverless.variables.populateObject(service.custom).then((result) => {
            expect(result).to.eql(expected);
          })).to.be.fulfilled;
        }
      );
      const pathEmptyJs = 'empty.js';
      const makeEmptyJs = () => {
        const SUtils = new Utils();
        const tmpDirPath = testUtils.getTmpDirPath();
        const fileContent = `'use strict';
module.exports = {
  func: () => ({ value: 'a value' }),
}
`;
        SUtils.writeFileSync(path.join(tmpDirPath, pathEmptyJs), fileContent);
        serverless.config.update({ servicePath: tmpDirPath });
      };
      it('should reject population of an attribute not exported from a file',
        () => {
          makeEmptyJs();
          service.custom = {
            val: `\${file(${pathEmptyJs}):func.notAValue}`,
          };
          return expect(serverless.variables.populateObject(service.custom))
            .to.eventually.be.rejected;
        }
      );
    });
  });

  describe('#populateProperty()', () => {
    let serverless;
    let overwriteStub;
    let populateObjectStub;
    let getValueFromSourceStub;
    let populateVariableStub;

    beforeEach(() => {
      serverless = new Serverless();
      overwriteStub = sinon.stub(serverless.variables, 'overwrite');
      populateObjectStub = sinon.stub(serverless.variables, 'populateObject');
      getValueFromSourceStub = sinon.stub(serverless.variables, 'getValueFromSource');
      populateVariableStub = sinon.stub(serverless.variables, 'populateVariable');
    });

    afterEach(() => {
      serverless.variables.overwrite.restore();
      serverless.variables.populateObject.restore();
      serverless.variables.getValueFromSource.restore();
      serverless.variables.populateVariable.restore();
    });

    it('should call overwrite if overwrite syntax provided', () => {
      const property = 'my stage is ${opt:stage, self:provider.stage}';

      serverless.variables.loadVariableSyntax();

      overwriteStub.resolves('dev');
      populateVariableStub.resolves('my stage is dev');

      return serverless.variables.populateProperty(property).then(newProperty => {
        expect(overwriteStub.called).to.equal(true);
        expect(populateVariableStub.called).to.equal(true);
        expect(newProperty).to.equal('my stage is dev');

        return BbPromise.resolve();
      });
    });

    it('should allow a single-quoted string if overwrite syntax provided', () => {
      const property = "my stage is ${opt:stage, 'prod'}";

      serverless.variables.loadVariableSyntax();

      overwriteStub.resolves('\'prod\'');
      populateVariableStub.resolves('my stage is prod');

      return expect(serverless.variables.populateProperty(property)).to.be.fulfilled
        .then(newProperty => expect(newProperty).to.equal('my stage is prod'));
    });

    it('should allow a double-quoted string if overwrite syntax provided', () => {
      const property = 'my stage is ${opt:stage, "prod"}';

      serverless.variables.loadVariableSyntax();

      overwriteStub.resolves('\'prod\'');
      populateVariableStub.resolves('my stage is prod');

      return expect(serverless.variables.populateProperty(property)).to.be.fulfilled
        .then(newProperty => expect(newProperty).to.equal('my stage is prod'));
    });

    it('should call getValueFromSource if no overwrite syntax provided', () => {
      const property = 'my stage is ${opt:stage}';

      serverless.variables.loadVariableSyntax();

      getValueFromSourceStub.resolves('prod');
      populateVariableStub.resolves('my stage is prod');

      return serverless.variables.populateProperty(property).then(newProperty => {
        expect(getValueFromSourceStub.called).to.be.true;
        expect(populateVariableStub.called).to.be.true;
        expect(newProperty).to.equal('my stage is prod');

        return BbPromise.resolve();
      });
    });

    it('should NOT call populateObject if variable value is a circular object', () => {
      serverless.variables.options = {
        stage: 'prod',
      };
      const property = '${opt:stage}';
      const variableValue = {
        stage: '${opt:stage}',
      };
      const variableValuePopulated = {
        stage: 'prod',
      };

      serverless.variables.cache['opt:stage'] = variableValuePopulated;

      serverless.variables.loadVariableSyntax();

      populateObjectStub.resolves(variableValuePopulated);
      getValueFromSourceStub.resolves(variableValue);
      populateVariableStub.resolves(variableValuePopulated);

      return serverless.variables.populateProperty(property).then(newProperty => {
        expect(populateObjectStub.called).to.equal(false);
        expect(getValueFromSourceStub.called).to.equal(true);
        expect(populateVariableStub.called).to.equal(true);
        expect(newProperty).to.deep.equal(variableValuePopulated);

        return BbPromise.resolve();
      });
    });

    it('should warn if an SSM parameter does not exist', () => {
      const awsProvider = new AwsProvider(serverless, { stage: 'prod', region: 'us-west-2' });
      const param = '/some/path/to/invalidparam';
      const property = `\${ssm:${param}}`;
      const error = new Error(`Parameter ${param} not found.`);

      serverless.variables.options = {
        stage: 'prod',
        region: 'us-east-1',
      };
      serverless.variables.loadVariableSyntax();

      serverless.variables.getValueFromSource.restore();
      serverless.variables.populateVariable.restore();
      const requestStub = sinon.stub(awsProvider, 'request', () => BbPromise.reject(error));
      const warnIfNotFoundSpy = sinon.spy(serverless.variables, 'warnIfNotFound');

      return expect(serverless.variables.populateProperty(property)
        .then(newProperty => {
          expect(requestStub.callCount).to.equal(1);
          expect(warnIfNotFoundSpy.callCount).to.equal(1);
          expect(newProperty).to.be.undefined;
        })
        .finally(() => {
          getValueFromSourceStub = sinon.stub(serverless.variables, 'getValueFromSource');
          populateVariableStub = sinon.stub(serverless.variables, 'populateVariable');
        })).to.be.fulfilled;
    });

    it('should throw an Error if the SSM request fails', () => {
      const awsProvider = new AwsProvider(serverless, { stage: 'prod', region: 'us-west-2' });
      const param = '/some/path/to/invalidparam';
      const property = `\${ssm:${param}}`;
      const error = new Error('Some random failure.');

      serverless.variables.options = {
        stage: 'prod',
        region: 'us-east-1',
      };
      serverless.variables.loadVariableSyntax();

      serverless.variables.getValueFromSource.restore();
      const requestStub = sinon.stub(awsProvider, 'request', () => BbPromise.reject(error));

      return expect(serverless.variables.populateProperty(property)
        .finally(() => {
          getValueFromSourceStub = sinon.stub(serverless.variables, 'getValueFromSource');
          expect(requestStub.callCount).to.equal(1);
        })).to.be.rejectedWith(serverless.classes.Error);
    });

    it('should run recursively if nested variables provided', () => {
      const property = 'my stage is ${env:${opt.name}}';

      serverless.variables.loadVariableSyntax();

      getValueFromSourceStub.onCall(0).resolves('stage');
      getValueFromSourceStub.onCall(1).resolves('dev');
      populateVariableStub.onCall(0).resolves('my stage is ${env:stage}');
      populateVariableStub.onCall(1).resolves('my stage is dev');

      return serverless.variables.populateProperty(property).then(newProperty => {
        expect(getValueFromSourceStub.callCount).to.equal(2);
        expect(populateVariableStub.callCount).to.equal(2);
        expect(newProperty).to.equal('my stage is dev');
      });
    });
  });

  describe('#populateVariable()', () => {
    it('should populate string variables as sub string', () => {
      const serverless = new Serverless();
      const valueToPopulate = 'dev';
      const matchedString = '${opt:stage}';
      const property = 'my stage is ${opt:stage}';

      return serverless.variables.populateVariable(property, matchedString, valueToPopulate)
        .then(newProperty => {
          expect(newProperty).to.equal('my stage is dev');
        });
    });

    it('should populate number variables as sub string', () => {
      const serverless = new Serverless();
      const valueToPopulate = 5;
      const matchedString = '${opt:number}';
      const property = 'your account number is ${opt:number}';

      return serverless.variables.populateVariable(property, matchedString, valueToPopulate)
        .then(newProperty => {
          expect(newProperty).to.equal('your account number is 5');
        });
    });

    it('should populate non string variables', () => {
      const serverless = new Serverless();
      const valueToPopulate = 5;
      const matchedString = '${opt:number}';
      const property = '${opt:number}';

      return serverless.variables.populateVariable(property, matchedString, valueToPopulate)
        .then(newProperty => {
          expect(newProperty).to.equal(5);
        });
    });

    it('should throw error if populating non string or non number variable as sub string', () => {
      const serverless = new Serverless();
      const valueToPopulate = {};
      const matchedString = '${opt:object}';
      const property = 'your account number is ${opt:object}';
      expect(() => serverless.variables
        .populateVariable(property, matchedString, valueToPopulate))
        .to.throw(Error);
    });
  });

  describe('#overwrite()', () => {
    it('should overwrite undefined and null values', () => {
      const serverless = new Serverless();
      const getValueFromSourceStub = sinon
        .stub(serverless.variables, 'getValueFromSource');

      getValueFromSourceStub.onCall(0).resolves(undefined);
      getValueFromSourceStub.onCall(1).resolves(null);
      getValueFromSourceStub.onCall(2).resolves('variableValue');

      return serverless.variables.overwrite('opt:stage,env:stage,self:provider.stage')
        .then(valueToPopulate => {
          expect(valueToPopulate).to.equal('variableValue');
          expect(getValueFromSourceStub).to.have.been.calledThrice;
        })
        .finally(() => serverless.variables.getValueFromSource.restore());
    });

    it('should overwrite empty object values', () => {
      const serverless = new Serverless();
      const getValueFromSourceStub = sinon
        .stub(serverless.variables, 'getValueFromSource');

      getValueFromSourceStub.onCall(0).resolves({});
      getValueFromSourceStub.onCall(1).resolves('variableValue');

      return serverless.variables.overwrite('opt:stage,env:stage').then(valueToPopulate => {
        expect(valueToPopulate).to.equal('variableValue');
        expect(getValueFromSourceStub).to.have.been.calledTwice;
      })
      .finally(() => serverless.variables.getValueFromSource.restore());
    });

    it('should not overwrite 0 values', () => {
      const serverless = new Serverless();
      const getValueFromSourceStub = sinon
        .stub(serverless.variables, 'getValueFromSource');

      getValueFromSourceStub.onCall(0).resolves(0);
      getValueFromSourceStub.onCall(1).resolves('variableValue');
      getValueFromSourceStub.onCall(2).resolves('variableValue2');
      return serverless.variables.overwrite('opt:stage,env:stage,self:provider.stage')
        .then(valueToPopulate => {
          expect(valueToPopulate).to.equal(0);
        })
        .finally(() => serverless.variables.getValueFromSource.restore());
    });

    it('should not overwrite false values', () => {
      const serverless = new Serverless();
      const getValueFromSourceStub = sinon
        .stub(serverless.variables, 'getValueFromSource');

      getValueFromSourceStub.onCall(0).resolves(false);
      getValueFromSourceStub.onCall(1).resolves('variableValue');
      getValueFromSourceStub.onCall(2).resolves('variableValue2');

      return serverless.variables.overwrite('opt:stage,env:stage,self:provider.stage')
        .then(valueToPopulate => {
          expect(valueToPopulate).to.be.false;
        })
        .finally(() => serverless.variables.getValueFromSource.restore());
    });

    it('should skip getting values once a value has been found', () => {
      const serverless = new Serverless();
      const getValueFromSourceStub = sinon
        .stub(serverless.variables, 'getValueFromSource');

      getValueFromSourceStub.onCall(0).resolves(undefined);
      getValueFromSourceStub.onCall(1).resolves('variableValue');
      getValueFromSourceStub.onCall(2).resolves('variableValue2');

      return serverless.variables.overwrite('opt:stage,env:stage,self:provider.stage')
        .then(valueToPopulate => {
          expect(valueToPopulate).to.equal('variableValue');
        })
        .finally(() => serverless.variables.getValueFromSource.restore());
    });
  });

  describe('#getValueFromSource()', () => {
    it('should call getValueFromEnv if referencing env var', () => {
      const serverless = new Serverless();
      const getValueFromEnvStub = sinon
        .stub(serverless.variables, 'getValueFromEnv').resolves('variableValue');
      return serverless.variables.getValueFromSource('env:TEST_VAR')
        .then(valueToPopulate => {
          expect(valueToPopulate).to.equal('variableValue');
          expect(getValueFromEnvStub).to.have.been.called;
          expect(getValueFromEnvStub.calledWith('env:TEST_VAR')).to.equal(true);
        })
        .finally(() => serverless.variables.getValueFromEnv.restore());
    });

    it('should call getValueFromOptions if referencing an option', () => {
      const serverless = new Serverless();
      const getValueFromOptionsStub = sinon
        .stub(serverless.variables, 'getValueFromOptions')
        .resolves('variableValue');

      return serverless.variables.getValueFromSource('opt:stage')
        .then(valueToPopulate => {
          expect(valueToPopulate).to.equal('variableValue');
          expect(getValueFromOptionsStub).to.have.been.called;
          expect(getValueFromOptionsStub.calledWith('opt:stage')).to.equal(true);
        })
        .finally(() => serverless.variables.getValueFromOptions.restore());
    });

    it('should call getValueFromSelf if referencing from self', () => {
      const serverless = new Serverless();
      const getValueFromSelfStub = sinon
        .stub(serverless.variables, 'getValueFromSelf').resolves('variableValue');

      return serverless.variables.getValueFromSource('self:provider')
        .then(valueToPopulate => {
          expect(valueToPopulate).to.equal('variableValue');
          expect(getValueFromSelfStub).to.have.been.called;
          expect(getValueFromSelfStub.calledWith('self:provider')).to.equal(true);
        })
        .finally(() => serverless.variables.getValueFromSelf.restore());
    });

    it('should call getValueFromFile if referencing from another file', () => {
      const serverless = new Serverless();
      const getValueFromFileStub = sinon
        .stub(serverless.variables, 'getValueFromFile').resolves('variableValue');

      return serverless.variables.getValueFromSource('file(./config.yml)')
        .then(valueToPopulate => {
          expect(valueToPopulate).to.equal('variableValue');
          expect(getValueFromFileStub).to.have.been.called;
          expect(getValueFromFileStub).to.have.been.calledWith('file(./config.yml)');
        })
        .finally(() => serverless.variables.getValueFromFile.restore());
    });

    it('should call getValueFromCf if referencing CloudFormation Outputs', () => {
      const serverless = new Serverless();
      const getValueFromCfStub = sinon
        .stub(serverless.variables, 'getValueFromCf').resolves('variableValue');
      return serverless.variables.getValueFromSource('cf:test-stack.testOutput')
        .then(valueToPopulate => {
          expect(valueToPopulate).to.equal('variableValue');
          expect(getValueFromCfStub).to.have.been.called;
          expect(getValueFromCfStub).to.have.been.calledWith('cf:test-stack.testOutput');
        })
        .finally(() => serverless.variables.getValueFromCf.restore());
    });

    it('should call getValueFromS3 if referencing variable in S3', () => {
      const serverless = new Serverless();
      const getValueFromS3Stub = sinon
      .stub(serverless.variables, 'getValueFromS3').resolves('variableValue');
      return serverless.variables.getValueFromSource('s3:test-bucket/path/to/key')
      .then(valueToPopulate => {
        expect(valueToPopulate).to.equal('variableValue');
        expect(getValueFromS3Stub).to.have.been.called;
        expect(getValueFromS3Stub).to.have.been.calledWith('s3:test-bucket/path/to/key');
      })
      .finally(() => serverless.variables.getValueFromS3.restore());
    });

    it('should call getValueFromSsm if referencing variable in SSM', () => {
      const serverless = new Serverless();
      const getValueFromSsmStub = sinon
      .stub(serverless.variables, 'getValueFromSsm').resolves('variableValue');
      return serverless.variables.getValueFromSource('ssm:/test/path/to/param')
      .then(valueToPopulate => {
        expect(valueToPopulate).to.equal('variableValue');
        expect(getValueFromSsmStub).to.have.been.called;
        expect(getValueFromSsmStub).to.have.been.calledWith('ssm:/test/path/to/param');
      })
      .finally(() => serverless.variables.getValueFromSsm.restore());
    });

    describe('caching', () => {
      const sources = [
        { function: 'getValueFromEnv', variableString: 'env:NODE_ENV' },
        { function: 'getValueFromOptions', variableString: 'opt:stage' },
        { function: 'getValueFromSelf', variableString: 'self:provider' },
        { function: 'getValueFromFile', variableString: 'file(./config.yml)' },
        { function: 'getValueFromCf', variableString: 'cf:test-stack.testOutput' },
        { function: 'getValueFromS3', variableString: 's3:test-bucket/path/to/ke' },
        { function: 'getValueFromSsm', variableString: 'ssm:/test/path/to/param' },
      ];
      sources.forEach((source) => {
        it(`should only call ${source.function} once, returning the cached value otherwise`, () => {
          const serverless = new Serverless();
          const getValueFunctionStub = sinon
          .stub(serverless.variables, source.function).resolves('variableValue');
          const firstCall = serverless.variables.getValueFromSource(source.variableString);
          const secondCall = BbPromise.delay(100)
          .then(() => serverless.variables.getValueFromSource(source.variableString));
          return BbPromise.all([firstCall, secondCall])
          .then(valueToPopulate => {
            expect(valueToPopulate).to.deep.equal(['variableValue', 'variableValue']);
            expect(getValueFunctionStub).to.have.been.calledOnce;
            expect(getValueFunctionStub).to.have.been.calledWith(source.variableString);
          })
          .finally(() => serverless.variables[source.function].restore());
        });
      });
    });

    it('should call populateObject if variable value is an object', () => {
      const serverless = new Serverless();
      serverless.variables.options = {
        stage: 'prod',
      };
      const property = 'self:stage';
      const variableValue = {
        stage: '${opt:stage}',
      };
      const variableValuePopulated = {
        stage: 'prod',
      };

      serverless.variables.loadVariableSyntax();

      const populateObjectStub = sinon
        .stub(serverless.variables, 'populateObject')
        .resolves(variableValuePopulated);
      const getValueFromSelfStub = sinon
        .stub(serverless.variables, 'getValueFromSelf')
        .resolves(variableValue);

      return serverless.variables.getValueFromSource(property)
        .then(newProperty => {
          expect(populateObjectStub.called).to.equal(true);
          expect(getValueFromSelfStub.called).to.equal(true);
          expect(newProperty).to.deep.equal(variableValuePopulated);

          return BbPromise.resolve();
        })
        .finally(() => {
          serverless.variables.populateObject.restore();
          serverless.variables.getValueFromSelf.restore();
        });
    });

    it('should NOT call populateObject if variable value is already cached', () => {
      const serverless = new Serverless();
      serverless.variables.options = {
        stage: 'prod',
      };
      const property = 'opt:stage';
      const variableValue = {
        stage: '${opt:stage}',
      };
      const variableValuePopulated = {
        stage: 'prod',
      };

      serverless.variables.cache['opt:stage'] = BbPromise.resolve(variableValuePopulated);

      serverless.variables.loadVariableSyntax();

      const populateObjectStub = sinon
        .stub(serverless.variables, 'populateObject')
        .resolves(variableValuePopulated);
      const getValueFromOptionsStub = sinon
        .stub(serverless.variables, 'getValueFromOptions')
        .resolves(variableValue);

      return serverless.variables.getValueFromSource(property)
        .then(newProperty => {
          expect(populateObjectStub.called).to.equal(false);
          expect(getValueFromOptionsStub.called).to.equal(false);
          expect(newProperty).to.deep.equal(variableValuePopulated);

          return BbPromise.resolve();
        })
        .finally(() => {
          serverless.variables.populateObject.restore();
          serverless.variables.getValueFromOptions.restore();
        });
    });

    it('should throw error if referencing an invalid source', () => {
      const serverless = new Serverless();
      expect(() => serverless.variables.getValueFromSource('weird:source'))
        .to.throw(Error);
    });
  });

  describe('#getValueFromEnv()', () => {
    it('should get variable from environment variables', () => {
      const serverless = new Serverless();
      process.env.TEST_VAR = 'someValue';
      return serverless.variables.getValueFromEnv('env:TEST_VAR').then(valueToPopulate => {
        expect(valueToPopulate).to.be.equal('someValue');
      })
      .finally(() => {
        delete process.env.TEST_VAR;
      });
    });

    it('should allow top-level references to the environment variables hive', () => {
      const serverless = new Serverless();
      process.env.TEST_VAR = 'someValue';
      return serverless.variables.getValueFromEnv('env:').then(valueToPopulate => {
        expect(valueToPopulate.TEST_VAR).to.be.equal('someValue');
      })
      .finally(() => {
        delete process.env.TEST_VAR;
      });
    });
  });

  describe('#getValueFromOptions()', () => {
    it('should get variable from options', () => {
      const serverless = new Serverless();
      serverless.variables.options = {
        stage: 'prod',
      };
      return serverless.variables.getValueFromOptions('opt:stage').then(valueToPopulate => {
        expect(valueToPopulate).to.be.equal('prod');
      });
    });

    it('should allow top-level references to the options hive', () => {
      const serverless = new Serverless();
      serverless.variables.options = {
        stage: 'prod',
      };
      return serverless.variables.getValueFromOptions('opt:').then(valueToPopulate => {
        expect(valueToPopulate.stage).to.be.equal('prod');
      });
    });
  });

  describe('#getValueFromSelf()', () => {
    it('should get variable from self serverless.yml file', () => {
      const serverless = new Serverless();
      serverless.variables.service = {
        service: 'testService',
        provider: serverless.service.provider,
      };
      serverless.variables.loadVariableSyntax();
      return serverless.variables.getValueFromSelf('self:service').then(valueToPopulate => {
        expect(valueToPopulate).to.be.equal('testService');
      });
    });

    it('should handle self-references to the root of the serverless.yml file', () => {
      const serverless = new Serverless();
      serverless.variables.service = {
        service: 'testService',
        provider: 'testProvider',
        defaults: serverless.service.defaults,
      };

      serverless.variables.loadVariableSyntax();

      return serverless.variables.getValueFromSelf('self:').then(valueToPopulate => {
        expect(valueToPopulate.provider).to.be.equal('testProvider');
      });
    });
  });

  describe('#getValueFromFile()', () => {
    it('should work for absolute paths with ~ ', () => {
      const serverless = new Serverless();
      const expectedFileName = `${os.homedir()}/somedir/config.yml`;
      const configYml = {
        test: 1,
        test2: 'test2',
        testObj: {
          sub: 2,
          prob: 'prob',
        },
      };
      const fileExistsStub = sinon
        .stub(serverless.utils, 'fileExistsSync').returns(true);

      const realpathSync = sinon
        .stub(fse, 'realpathSync').returns(expectedFileName);

      const readFileSyncStub = sinon
        .stub(serverless.utils, 'readFileSync').returns(configYml);

      return serverless.variables.getValueFromFile('file(~/somedir/config.yml)')
        .then(valueToPopulate => {
          expect(realpathSync).to.not.have.been.called;
          expect(fileExistsStub).to.have.been.calledWithMatch(expectedFileName);
          expect(readFileSyncStub).to.have.been.calledWithMatch(expectedFileName);
          expect(valueToPopulate).to.deep.equal(configYml);
        })
        .finally(() => {
          realpathSync.restore();
          readFileSyncStub.restore();
          fileExistsStub.restore();
        });
    });

    it('should populate an entire variable file', () => {
      const serverless = new Serverless();
      const SUtils = new Utils();
      const tmpDirPath = testUtils.getTmpDirPath();
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

      return serverless.variables.getValueFromFile('file(./config.yml)').then(valueToPopulate => {
        expect(valueToPopulate).to.deep.equal(configYml);
      });
    });

    it('should get undefined if non existing file and the second argument is true', () => {
      const serverless = new Serverless();
      const tmpDirPath = testUtils.getTmpDirPath();

      serverless.config.update({ servicePath: tmpDirPath });

      const realpathSync = sinon.spy(fse, 'realpathSync');
      const existsSync = sinon.spy(fse, 'existsSync');

      return serverless.variables.getValueFromFile('file(./non-existing.yml)')
        .then(valueToPopulate => {
          expect(realpathSync).to.not.have.been.called;
          expect(existsSync).to.have.been.calledOnce;
          expect(valueToPopulate).to.be.undefined;
        })
        .finally(() => {
          realpathSync.restore();
          existsSync.restore();
        });
    });

    it('should populate non json/yml files', () => {
      const serverless = new Serverless();
      const SUtils = new Utils();
      const tmpDirPath = testUtils.getTmpDirPath();

      SUtils.writeFileSync(path.join(tmpDirPath, 'someFile'),
        'hello world');

      serverless.config.update({ servicePath: tmpDirPath });

      return serverless.variables.getValueFromFile('file(./someFile)').then(valueToPopulate => {
        expect(valueToPopulate).to.equal('hello world');
      });
    });

    it('should populate symlinks', () => {
      const serverless = new Serverless();
      const SUtils = new Utils();
      const tmpDirPath = testUtils.getTmpDirPath();
      const realFilePath = path.join(tmpDirPath, 'someFile');
      const symlinkPath = path.join(tmpDirPath, 'refSomeFile');
      SUtils.writeFileSync(realFilePath, 'hello world');
      fse.ensureSymlinkSync(realFilePath, symlinkPath);

      serverless.config.update({ servicePath: tmpDirPath });

      return expect(serverless.variables.getValueFromFile('file(./refSomeFile)')).to.be.fulfilled
      .then(valueToPopulate => {
        expect(valueToPopulate).to.equal('hello world');
      })
      .finally(() => {
        fse.removeSync(realFilePath);
        fse.removeSync(symlinkPath);
      });
    });

    it('should trim trailing whitespace and new line character', () => {
      const serverless = new Serverless();
      const SUtils = new Utils();
      const tmpDirPath = testUtils.getTmpDirPath();

      SUtils.writeFileSync(path.join(tmpDirPath, 'someFile'),
        'hello world \n');

      serverless.config.update({ servicePath: tmpDirPath });

      return serverless.variables.getValueFromFile('file(./someFile)').then(valueToPopulate => {
        expect(valueToPopulate).to.equal('hello world');
      });
    });

    it('should populate from another file when variable is of any type', () => {
      const serverless = new Serverless();
      const SUtils = new Utils();
      const tmpDirPath = testUtils.getTmpDirPath();
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

      return serverless.variables.getValueFromFile('file(./config.yml):testObj.sub')
        .then(valueToPopulate => {
          expect(valueToPopulate).to.equal(2);
        });
    });

    it('should populate from a javascript file', () => {
      const serverless = new Serverless();
      const SUtils = new Utils();
      const tmpDirPath = testUtils.getTmpDirPath();
      const jsData = 'module.exports.hello=function(){return "hello world";};';

      SUtils.writeFileSync(path.join(tmpDirPath, 'hello.js'), jsData);

      serverless.config.update({ servicePath: tmpDirPath });

      return serverless.variables.getValueFromFile('file(./hello.js):hello')
        .then(valueToPopulate => {
          expect(valueToPopulate).to.equal('hello world');
        });
    });

    it('should populate an entire variable exported by a javascript file', () => {
      const serverless = new Serverless();
      const SUtils = new Utils();
      const tmpDirPath = testUtils.getTmpDirPath();
      const jsData = 'module.exports=function(){return { hello: "hello world" };};';

      SUtils.writeFileSync(path.join(tmpDirPath, 'hello.js'), jsData);

      serverless.config.update({ servicePath: tmpDirPath });

      return serverless.variables.getValueFromFile('file(./hello.js)')
        .then(valueToPopulate => {
          expect(valueToPopulate.hello).to.equal('hello world');
        });
    });

    it('should throw if property exported by a javascript file is not a function', () => {
      const serverless = new Serverless();
      const SUtils = new Utils();
      const tmpDirPath = testUtils.getTmpDirPath();
      const jsData = 'module.exports={ hello: "hello world" };';

      SUtils.writeFileSync(path.join(tmpDirPath, 'hello.js'), jsData);

      serverless.config.update({ servicePath: tmpDirPath });

      expect(() => serverless.variables
        .getValueFromFile('file(./hello.js)')).to.throw(Error);
    });

    it('should populate deep object from a javascript file', () => {
      const serverless = new Serverless();
      const SUtils = new Utils();
      const tmpDirPath = testUtils.getTmpDirPath();
      const jsData = `module.exports.hello=function(){
        return {one:{two:{three: 'hello world'}}}
      };`;

      SUtils.writeFileSync(path.join(tmpDirPath, 'hello.js'), jsData);

      serverless.config.update({ servicePath: tmpDirPath });
      serverless.variables.loadVariableSyntax();

      return serverless.variables.getValueFromFile('file(./hello.js):hello.one.two.three')
        .then(valueToPopulate => {
          expect(valueToPopulate).to.equal('hello world');
        });
    });

    it('should preserve the exported function context when executing', () => {
      const serverless = new Serverless();
      const SUtils = new Utils();
      const tmpDirPath = testUtils.getTmpDirPath();
      const jsData = `
      module.exports.one = {two: {three: 'hello world'}}
      module.exports.hello=function(){ return this; };`;

      SUtils.writeFileSync(path.join(tmpDirPath, 'hello.js'), jsData);

      serverless.config.update({ servicePath: tmpDirPath });
      serverless.variables.loadVariableSyntax();

      return serverless.variables.getValueFromFile('file(./hello.js):hello.one.two.three')
        .then(valueToPopulate => {
          expect(valueToPopulate).to.equal('hello world');
        });
    });

    it('should throw error if not using ":" syntax', () => {
      const serverless = new Serverless();
      const SUtils = new Utils();
      const tmpDirPath = testUtils.getTmpDirPath();
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

      expect(() => serverless.variables
        .getValueFromFile('file(./config.yml).testObj.sub')).to.throw(Error);
    });
  });

  describe('#getValueFromCf()', () => {
    it('should get variable from CloudFormation', () => {
      const serverless = new Serverless();
      const options = {
        stage: 'prod',
        region: 'us-west-2',
      };
      const awsProvider = new AwsProvider(serverless, options);
      serverless.setProvider('aws', awsProvider);
      serverless.variables.options = options;
      const awsResponseMock = {
        Stacks: [{
          Outputs: [{
            OutputKey: 'MockExport',
            OutputValue: 'MockValue',
          }],
        }],
      };

      const cfStub = sinon.stub(serverless.getProvider('aws'), 'request')
        .resolves(awsResponseMock);
      return serverless.variables.getValueFromCf('cf:some-stack.MockExport')
        .then(valueToPopulate => {
          expect(valueToPopulate).to.be.equal('MockValue');
          expect(cfStub).to.have.been.calledOnce;
          expect(cfStub).to.have.been.calledWithExactly(
            'CloudFormation',
            'describeStacks',
            {
              StackName: 'some-stack',
            },
            { useCache: true }
          );
        })
        .finally(() => serverless.getProvider('aws').request.restore());
    });

    it('should throw an error when variable from CloudFormation does not exist', () => {
      const serverless = new Serverless();
      const options = {
        stage: 'prod',
        region: 'us-west-2',
      };
      const awsProvider = new AwsProvider(serverless, options);
      serverless.setProvider('aws', awsProvider);
      serverless.variables.options = options;
      const awsResponseMock = {
        Stacks: [{
          Outputs: [{
            OutputKey: 'MockExport',
            OutputValue: 'MockValue',
          }],
        }],
      };

      const cfStub = sinon.stub(serverless.getProvider('aws'), 'request')
        .resolves(awsResponseMock);

      return serverless.variables.getValueFromCf('cf:some-stack.DoestNotExist')
        .then()
        .catch(error => {
          expect(cfStub).to.have.been.calledOnce;
          expect(cfStub).to.have.been.calledWithExactly(
            'CloudFormation',
            'describeStacks',
            {
              StackName: 'some-stack',
            },
            { useCache: true }
          );
          expect(error).to.be.an.instanceof(Error);
          expect(error.message).to.match(/to request a non exported variable from CloudFormation/);
        })
        .finally(() => serverless.getProvider('aws').request.restore());
    });
  });

  describe('#getValueFromS3()', () => {
    let serverless;
    let awsProvider;

    beforeEach(() => {
      serverless = new Serverless();
      const options = {
        stage: 'prod',
        region: 'us-west-2',
      };
      awsProvider = new AwsProvider(serverless, options);
      serverless.setProvider('aws', awsProvider);
      serverless.variables.options = options;
    });

    it('should get variable from S3', () => {
      const awsResponseMock = {
        Body: 'MockValue',
      };
      const s3Stub = sinon.stub(awsProvider, 'request').resolves(awsResponseMock);

      return serverless.variables.getValueFromS3('s3:some.bucket/path/to/key').then(value => {
        expect(value).to.be.equal('MockValue');
        expect(s3Stub).to.have.been.calledOnce;
        expect(s3Stub).to.have.been.calledWithExactly(
          'S3',
          'getObject',
          {
            Bucket: 'some.bucket',
            Key: 'path/to/key',
          },
          { useCache: true }
        );
      })
      .finally(() => serverless.getProvider('aws').request.restore());
    });

    it('should throw error if error getting value from S3', () => {
      const error = new Error('The specified bucket is not valid');
      sinon.stub(awsProvider, 'request').rejects(error);

      return expect(serverless.variables.getValueFromS3('s3:some.bucket/path/to/key'))
        .to.be.rejectedWith('Error getting value for s3:some.bucket/path/to/key. ' +
          'The specified bucket is not valid');
    });
  });

  describe('#getValueFromSsm()', () => {
    let serverless;
    let awsProvider;

    beforeEach(() => {
      serverless = new Serverless();
      const options = {
        stage: 'prod',
        region: 'us-west-2',
      };
      awsProvider = new AwsProvider(serverless, options);
      serverless.setProvider('aws', awsProvider);
      serverless.variables.options = options;
    });

    it('should get variable from Ssm using regular-style param', () => {
      const param = 'Param-01_valid.chars';
      const value = 'MockValue';
      const awsResponseMock = {
        Parameter: {
          Value: value,
        },
      };
      const ssmStub = sinon.stub(awsProvider, 'request').resolves(awsResponseMock);

      return serverless.variables.getValueFromSsm(`ssm:${param}`).then(resolved => {
        expect(resolved).to.be.equal(value);
        expect(ssmStub).to.have.been.calledOnce;
        expect(ssmStub).to.have.been.calledWithExactly(
          'SSM',
          'getParameter',
          {
            Name: param,
            WithDecryption: false,
          },
          { useCache: true }
        );
      });
    });

    it('should get variable from Ssm using path-style param', () => {
      const param = '/path/to/Param-01_valid.chars';
      const value = 'MockValue';
      const awsResponseMock = {
        Parameter: {
          Value: value,
        },
      };
      const ssmStub = sinon.stub(awsProvider, 'request').resolves(awsResponseMock);

      return serverless.variables.getValueFromSsm(`ssm:${param}`).then(resolved => {
        expect(resolved).to.be.equal(value);
        expect(ssmStub).to.have.been.calledOnce;
        expect(ssmStub).to.have.been.calledWithExactly(
          'SSM',
          'getParameter',
          {
            Name: param,
            WithDecryption: false,
          },
          { useCache: true }
        );
      });
    });

    it('should get encrypted variable from Ssm using extended syntax', () => {
      const param = '/path/to/Param-01_valid.chars';
      const value = 'MockValue';
      const awsResponseMock = {
        Parameter: {
          Value: value,
        },
      };
      const ssmStub = sinon.stub(awsProvider, 'request').resolves(awsResponseMock);

      return serverless.variables.getValueFromSsm(`ssm:${param}~true`).then(resolved => {
        expect(resolved).to.be.equal(value);
        expect(ssmStub).to.have.been.calledOnce;
        expect(ssmStub).to.have.been.calledWithExactly(
          'SSM',
          'getParameter',
          {
            Name: param,
            WithDecryption: true,
          },
          { useCache: true }
        );
      });
    });

    it('should get unencrypted variable from Ssm using extended syntax', () => {
      const param = '/path/to/Param-01_valid.chars';
      const value = 'MockValue';
      const awsResponseMock = {
        Parameter: {
          Value: value,
        },
      };
      const ssmStub = sinon.stub(awsProvider, 'request').resolves(awsResponseMock);

      return serverless.variables.getValueFromSsm(`ssm:${param}~false`).then(resolved => {
        expect(resolved).to.be.equal(value);
        expect(ssmStub).to.have.been.calledOnce;
        expect(ssmStub).to.have.been.calledWithExactly(
          'SSM',
          'getParameter',
          {
            Name: param,
            WithDecryption: false,
          },
          { useCache: true }
        );
      });
    });

    it('should ignore bad values for extended syntax', () => {
      const param = '/path/to/Param-01_valid.chars';
      const value = 'MockValue';
      const awsResponseMock = {
        Parameter: {
          Value: value,
        },
      };
      const ssmStub = sinon.stub(awsProvider, 'request').resolves(awsResponseMock);

      return serverless.variables.getValueFromSsm(`ssm:${param}~badvalue`).then(resolved => {
        expect(resolved).to.be.equal(value);
        expect(ssmStub).to.have.been.calledOnce;
        expect(ssmStub).to.have.been.calledWithExactly(
          'SSM',
          'getParameter',
          {
            Name: param,
            WithDecryption: false,
          },
          { useCache: true }
        );
      });
    });

    it('should return undefined if SSM parameter does not exist', () => {
      const param = 'ssm:/some/path/to/invalidparam';
      const error = new Error(`Parameter ${param} not found.`);
      sinon.stub(awsProvider, 'request').rejects(error);

      return expect(() => serverless.variables.getValueFromSsm(param).to.be(undefined));
    });

    it('should throw exception if SSM request returns unexpected error', () => {
      const param = 'ssm:/some/path/to/invalidparam';
      const error = new Error(
        'User: <arn> is not authorized to perform: ssm:GetParameter on resource: <arn>');
      sinon.stub(awsProvider, 'request').rejects(error);

      return expect(() => serverless.variables.getValueFromSsm(param).to.throw(error));
    });
  });

  describe('#getDeepValue()', () => {
    it('should get deep values', () => {
      const serverless = new Serverless();

      const valueToPopulateMock = {
        service: 'testService',
        custom: {
          subProperty: {
            deep: 'deepValue',
          },
        },
      };

      serverless.variables.loadVariableSyntax();

      return serverless.variables.getDeepValue(['custom', 'subProperty', 'deep'],
        valueToPopulateMock).then(valueToPopulate => {
          expect(valueToPopulate).to.be.equal('deepValue');
        });
    });

    it('should not throw error if referencing invalid properties', () => {
      const serverless = new Serverless();

      const valueToPopulateMock = {
        service: 'testService',
        custom: {
          subProperty: 'hello',
        },
      };

      serverless.variables.loadVariableSyntax();

      return serverless.variables.getDeepValue(['custom', 'subProperty', 'deep', 'deeper'],
        valueToPopulateMock).then(valueToPopulate => {
          expect(valueToPopulate).to.deep.equal({});
        });
    });

    it('should get deep values with variable references', () => {
      const serverless = new Serverless();

      serverless.variables.service = {
        service: 'testService',
        custom: {
          anotherVar: '${self:custom.var}',
          subProperty: {
            deep: '${self:custom.anotherVar.veryDeep}',
          },
          var: {
            veryDeep: 'someValue',
          },
        },
        provider: serverless.service.provider,
      };

      serverless.variables.loadVariableSyntax();

      return serverless.variables.getDeepValue(['custom', 'subProperty', 'deep'],
        serverless.variables.service).then(valueToPopulate => {
          expect(valueToPopulate).to.be.equal('someValue');
        });
    });
  });

  describe('#warnIfNotFound()', () => {
    let logWarningSpy;
    let consoleLogStub;
    let varProxy;

    beforeEach(() => {
      logWarningSpy = sinon.spy(slsError, 'logWarning');
      consoleLogStub = sinon.stub(console, 'log').returns();
      const ProxyQuiredVariables = proxyquire('./Variables.js', {
        './Error': logWarningSpy,
      });
      varProxy = new ProxyQuiredVariables(new Serverless());
    });

    afterEach(() => {
      logWarningSpy.restore();
      consoleLogStub.restore();
    });

    it('should do nothing if variable has valid value.', () => {
      varProxy.warnIfNotFound('self:service', 'a-valid-value');
      expect(logWarningSpy).to.not.have.been.calledOnce;
    });

    it('should log if variable has null value.', () => {
      varProxy.warnIfNotFound('self:service', null);
      expect(logWarningSpy).to.have.been.calledOnce;
    });

    it('should log if variable has undefined value.', () => {
      varProxy.warnIfNotFound('self:service', undefined);
      expect(logWarningSpy).to.have.been.calledOnce;
    });

    it('should log if variable has empty object value.', () => {
      varProxy.warnIfNotFound('self:service', {});
      expect(logWarningSpy).to.have.been.calledOnce;
    });

    it('should detect the "environment variable" variable type', () => {
      varProxy.warnIfNotFound('env:service', null);
      expect(logWarningSpy).to.have.been.calledOnce;
      expect(logWarningSpy.args[0][0]).to.contain('environment variable');
    });

    it('should detect the "option" variable type', () => {
      varProxy.warnIfNotFound('opt:service', null);
      expect(logWarningSpy).to.have.been.calledOnce;
      expect(logWarningSpy.args[0][0]).to.contain('option');
    });

    it('should detect the "service attribute" variable type', () => {
      varProxy.warnIfNotFound('self:service', null);
      expect(logWarningSpy).to.have.been.calledOnce;
      expect(logWarningSpy.args[0][0]).to.contain('service attribute');
    });

    it('should detect the "file" variable type', () => {
      varProxy.warnIfNotFound('file(service)', null);
      expect(logWarningSpy).to.have.been.calledOnce;
      expect(logWarningSpy.args[0][0]).to.contain('file');
    });
  });
});
