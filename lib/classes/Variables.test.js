'use strict';

/* eslint-disable no-unused-expressions */

const BbPromise = require('bluebird');
const chai = require('chai');
const jc = require('json-cycle');
const os = require('os');
const path = require('path');
const proxyquire = require('proxyquire');
const sinon = require('sinon');
const YAML = require('js-yaml');

const AwsProvider = require('../plugins/aws/provider/awsProvider');
const fse = require('../utils/fs/fse');
const Serverless = require('../../lib/Serverless');
const slsError = require('./Error');
const testUtils = require('../../tests/utils');
const Utils = require('../../lib/classes/Utils');
const Variables = require('../../lib/classes/Variables');

BbPromise.longStackTraces(true);

chai.use(require('chai-as-promised'));
chai.use(require('sinon-chai'));

chai.should();

const expect = chai.expect;


describe('Variables', () => {
  let serverless;
  beforeEach(() => {
    serverless = new Serverless();
  });
  describe('#constructor()', () => {
    it('should attach serverless instance', () => {
      const variablesInstance = new Variables(serverless);
      expect(variablesInstance.serverless).to.equal(serverless);
    });
    it('should not set variableSyntax in constructor', () => {
      const variablesInstance = new Variables(serverless);
      expect(variablesInstance.variableSyntax).to.be.undefined;
    });
  });

  describe('#loadVariableSyntax()', () => {
    it('should set variableSyntax', () => {
      // eslint-disable-next-line no-template-curly-in-string
      serverless.service.provider.variableSyntax = '\\${{([ ~:a-zA-Z0-9._\'",\\-\\/\\(\\)]+?)}}';
      serverless.variables.loadVariableSyntax();
      expect(serverless.variables.variableSyntax).to.be.a('RegExp');
    });
  });

  describe('#populateService()', () => {
    it('should remove problematic attributes bofore calling populateObjectImpl with the service',
      () => {
        const prepopulateServiceStub = sinon.stub(serverless.variables, 'prepopulateService')
          .returns(BbPromise.resolve());
        const populateObjectStub = sinon.stub(serverless.variables, 'populateObjectImpl', (val) => {
          expect(val).to.equal(serverless.service);
          expect(val.provider.variableSyntax).to.be.undefined;
          expect(val.serverless).to.be.undefined;
          return BbPromise.resolve();
        });
        return serverless.variables.populateService().should.be.fulfilled
          .then().finally(() => {
            prepopulateServiceStub.restore();
            populateObjectStub.restore();
          });
      });
    it('should clear caches and remaining state *before* [pre]populating service',
      () => {
        const prepopulateServiceStub = sinon.stub(serverless.variables, 'prepopulateService',
          (val) => {
            expect(serverless.variables.deep).to.eql([]);
            expect(serverless.variables.tracker.getAll()).to.eql([]);
            return BbPromise.resolve(val);
          });
        const populateObjectStub = sinon.stub(serverless.variables, 'populateObjectImpl',
          (val) => {
            expect(serverless.variables.deep).to.eql([]);
            expect(serverless.variables.tracker.getAll()).to.eql([]);
            return BbPromise.resolve(val);
          });
        serverless.variables.deep.push('${foo:}');
        const prms = BbPromise.resolve('foo');
        serverless.variables.tracker.add('foo:', prms, '${foo:}');
        prms.state = 'resolved';
        return serverless.variables.populateService().should.be.fulfilled
          .then().finally(() => {
            prepopulateServiceStub.restore();
            populateObjectStub.restore();
          });
      });
    it('should clear caches and remaining *after* [pre]populating service',
      () => {
        const prepopulateServiceStub = sinon.stub(serverless.variables, 'prepopulateService',
          (val) => {
            serverless.variables.deep.push('${foo:}');
            const promise = BbPromise.resolve(val);
            serverless.variables.tracker.add('foo:', promise, '${foo:}');
            promise.state = 'resolved';
            return BbPromise.resolve();
          });
        const populateObjectStub = sinon.stub(serverless.variables, 'populateObjectImpl',
          (val) => {
            serverless.variables.deep.push('${bar:}');
            const promise = BbPromise.resolve(val);
            serverless.variables.tracker.add('bar:', promise, '${bar:}');
            promise.state = 'resolved';
            return BbPromise.resolve();
          });
        return serverless.variables.populateService().should.be.fulfilled
          .then(() => {
            expect(serverless.variables.deep).to.eql([]);
            expect(serverless.variables.tracker.getAll()).to.eql([]);
          })
          .finally(() => {
            prepopulateServiceStub.restore();
            populateObjectStub.restore();
          });
      });
  });
  describe('#prepopulateService', () => {
    // TL;DR: call populateService to test prepopulateService (note addition of 'pre')
    //
    // The prepopulateService method basically assumes invocation of of populateService (i.e. that
    // variable syntax is loaded, and that the service object is cleaned up.  Just use
    // populateService to do that work.
    let awsProvider;
    let populateObjectImplStub;
    let requestStub; // just in case... don't want to actually call...
    beforeEach(() => {
      awsProvider = new AwsProvider(serverless, {});
      populateObjectImplStub = sinon.stub(serverless.variables, 'populateObjectImpl');
      populateObjectImplStub.withArgs(serverless.variables.service).returns(BbPromise.resolve());
      requestStub = sinon.stub(awsProvider, 'request', () =>
        BbPromise.reject(new Error('unexpected')));
    });
    afterEach(() => {
      populateObjectImplStub.restore();
      requestStub.restore();
    });
    const prepopulatedProperties = [
      { name: 'region', getter: (provider) => provider.getRegion() },
      { name: 'stage', getter: (provider) => provider.getStage() },
    ];
    describe('basic population tests', () => {
      prepopulatedProperties.forEach((property) => {
        it(`should populate variables in ${property.name} values`, () => {
          awsProvider.options[property.name] = '${self:foobar, "default"}';
          return serverless.variables.populateService().should.be.fulfilled
            .then(() => expect(property.getter(awsProvider)).to.be.eql('default'));
        });
      });
    });
    //
    describe('dependent service rejections', () => {
      const dependentConfigs = [
        { value: '${cf:stack.value}', name: 'CloudFormation' },
        { value: '${s3:bucket/key}', name: 'S3' },
        { value: '${ssm:/path/param}', name: 'SSM' },
      ];
      prepopulatedProperties.forEach(property => {
        dependentConfigs.forEach(config => {
          it(`should reject ${config.name} variables in ${property.name} values`, () => {
            awsProvider.options[property.name] = config.value;
            return serverless.variables.populateService()
              .should.be.rejectedWith('Variable dependency failure');
          });
          it(`should reject recursively dependent ${config.name} service dependencies`, () => {
            serverless.variables.service.custom = {
              settings: config.value,
            };
            awsProvider.options.region = '${self:custom.settings.region}';
            return serverless.variables.populateService()
              .should.be.rejectedWith('Variable dependency failure');
          });
        });
      });
    });
    describe('dependent service non-interference', () => {
      const stateCombinations = [
        { region: 'foo', state: 'bar' },
        { region: 'foo', state: '${self:bar, "bar"}' },
        { region: '${self:foo, "foo"}', state: 'bar' },
        { region: '${self:foo, "foo"}', state: '${self:bar, "bar"}' },
      ];
      stateCombinations.forEach((combination) => {
        it('must leave the dependent services in their original state', () => {
          const dependentMethods = [
            { name: 'getValueFromCf', original: serverless.variables.getValueFromCf },
            { name: 'getValueFromS3', original: serverless.variables.getValueFromS3 },
            { name: 'getValueFromSsm', original: serverless.variables.getValueFromSsm },
          ];
          awsProvider.options.region = combination.region;
          awsProvider.options.state = combination.state;
          return serverless.variables.populateService().should.be.fulfilled
            .then(() => {
              dependentMethods.forEach((method) => {
                expect(serverless.variables[method.name]).to.equal(method.original);
              });
            });
        });
      });
    });
  });

  describe('#getProperties', () => {
    it('extracts all terminal properties of an object', () => {
      const date = new Date();
      const regex = /^.*$/g;
      const func = () => {};
      const obj = {
        foo: {
          bar: 'baz',
          biz: 'buz',
        },
        b: [
          { c: 'd' },
          { e: 'f' },
        ],
        g: date,
        h: regex,
        i: func,
      };
      const expected = [
        { path: ['foo', 'bar'], value: 'baz' },
        { path: ['foo', 'biz'], value: 'buz' },
        { path: ['b', 0, 'c'], value: 'd' },
        { path: ['b', 1, 'e'], value: 'f' },
        { path: ['g'], value: date },
        { path: ['h'], value: regex },
        { path: ['i'], value: func },
      ];
      const result = serverless.variables.getProperties(obj, true, obj);
      expect(result).to.eql(expected);
    });
    it('ignores self references', () => {
      const obj = {};
      obj.self = obj;
      const expected = [];
      const result = serverless.variables.getProperties(obj, true, obj);
      expect(result).to.eql(expected);
    });
  });

  describe('#populateObject()', () => {
    beforeEach(() => {
      serverless.variables.loadVariableSyntax();
    });
    it('should populate object and return it', () => {
      const object = {
        stage: '${opt:stage}', // eslint-disable-line no-template-curly-in-string
      };
      const expectedPopulatedObject = {
        stage: 'prod',
      };

      sinon.stub(serverless.variables, 'populateValue').resolves('prod');

      return serverless.variables.populateObject(object).then((populatedObject) => {
        expect(populatedObject).to.deep.equal(expectedPopulatedObject);
      })
        .finally(() => serverless.variables.populateValue.restore());
    });

    it('should persist keys with dot notation', () => {
      const object = {
        stage: '${opt:stage}', // eslint-disable-line no-template-curly-in-string
      };
      object['some.nested.key'] = 'hello';
      const expectedPopulatedObject = {
        stage: 'prod',
      };
      expectedPopulatedObject['some.nested.key'] = 'hello';
      const populateValueStub = sinon.stub(serverless.variables, 'populateValue',
        // eslint-disable-next-line no-template-curly-in-string
        val => (val === '${opt:stage}' ? BbPromise.resolve('prod') : BbPromise.resolve(val)));
      return serverless.variables.populateObject(object)
        .should.become(expectedPopulatedObject)
        .then().finally(() => populateValueStub.restore());
    });
    describe('significant variable usage corner cases', () => {
      let service;
      const makeDefault = () => ({
        service: 'my-service',
        provider: {
          name: 'aws',
        },
      });
      beforeEach(() => {
        service = makeDefault();
        // eslint-disable-next-line no-template-curly-in-string
        service.provider.variableSyntax = '\\${([ ~:a-zA-Z0-9._\'",\\-\\/\\(\\)]+?)}'; // default
        serverless.variables.service = service;
        serverless.variables.loadVariableSyntax();
        delete service.provider.variableSyntax;
      });
      it('should properly replace self-references', () => {
        service.custom = {
          me: '${self:}', // eslint-disable-line no-template-curly-in-string
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
          val1: '0', // eslint-disable-next-line no-template-curly-in-string
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
          val0: 'my value', // eslint-disable-next-line no-template-curly-in-string
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
          val0: 'my value', // eslint-disable-next-line no-template-curly-in-string
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
          val0: 'my value', // eslint-disable-next-line no-template-curly-in-string
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
          val0: 'my value', // eslint-disable-next-line no-template-curly-in-string
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
          val1: 0, // eslint-disable-next-line no-template-curly-in-string
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
          val1: 0, // eslint-disable-next-line no-template-curly-in-string
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
          val1: 0, // eslint-disable-next-line no-template-curly-in-string
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
          val1: '${self:custom.val0}', // eslint-disable-line no-template-curly-in-string
          val2: '${self:custom.val0}', // eslint-disable-line no-template-curly-in-string
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
          val1: '${self:custom.depVal}', // eslint-disable-line no-template-curly-in-string
          depVal: '${self:custom.val0}', // eslint-disable-line no-template-curly-in-string
          val0: 'my value',
          val2: '${self:custom.depVal}', // eslint-disable-line no-template-curly-in-string
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
      // see https://github.com/serverless/serverless/pull/4713#issuecomment-366975172
      it('should handle deep references into deep variables', () => {
        service.provider.stage = 'dev';
        service.custom = {
          stage: '${env:stage, self:provider.stage}',
          secrets: '${self:custom.${self:custom.stage}}',
          dev: {
            SECRET: 'secret',
          },
          environment: {
            SECRET: '${self:custom.secrets.SECRET}',
          },
        };
        const expected = {
          stage: 'dev',
          secrets: {
            SECRET: 'secret',
          },
          dev: {
            SECRET: 'secret',
          },
          environment: {
            SECRET: 'secret',
          },
        };
        return serverless.variables.populateObject(service.custom)
          .should.become(expected);
      });
      it('should handle deep variables that reference overrides', () => {
        service.custom = {
          val1: '${self:not.a.value, "bar"}',
          val2: '${self:custom.val1}',
        };
        const expected = {
          val1: 'bar',
          val2: 'bar',
        };
        return serverless.variables.populateObject(service.custom)
          .should.become(expected);
      });
      it('should handle deep references into deep variables', () => {
        service.custom = {
          val0: {
            foo: 'bar',
          },
          val1: '${self:custom.val0}',
          val2: '${self:custom.val1.foo}',
        };
        const expected = {
          val0: {
            foo: 'bar',
          },
          val1: {
            foo: 'bar',
          },
          val2: 'bar',
        };
        return serverless.variables.populateObject(service.custom)
          .should.become(expected);
      });
      it('should handle deep variables that reference overrides', () => {
        service.custom = {
          val1: '${self:not.a.value, "bar"}',
          val2: 'foo${self:custom.val1}',
        };
        const expected = {
          val1: 'bar',
          val2: 'foobar',
        };
        return serverless.variables.populateObject(service.custom)
          .should.become(expected);
      });
      it('should handle referenced deep variables that reference overrides', () => {
        service.custom = {
          val1: '${self:not.a.value, "bar"}',
          val2: '${self:custom.val1}',
          val3: '${self:custom.val2}',
        };
        const expected = {
          val1: 'bar',
          val2: 'bar',
          val3: 'bar',
        };
        return serverless.variables.populateObject(service.custom)
          .should.become(expected);
      });
      it('should handle partial referenced deep variables that reference overrides', () => {
        service.custom = {
          val1: '${self:not.a.value, "bar"}',
          val2: '${self:custom.val1}',
          val3: 'foo${self:custom.val2}',
        };
        const expected = {
          val1: 'bar',
          val2: 'bar',
          val3: 'foobar',
        };
        return serverless.variables.populateObject(service.custom)
          .should.become(expected);
      });
      it('should handle referenced contained deep variables that reference overrides', () => {
        service.custom = {
          val1: '${self:not.a.value, "bar"}',
          val2: 'foo${self:custom.val1}',
          val3: '${self:custom.val2}',
        };
        const expected = {
          val1: 'bar',
          val2: 'foobar',
          val3: 'foobar',
        };
        return serverless.variables.populateObject(service.custom)
          .should.become(expected);
      });
      it('should handle multiple referenced contained deep variables referencing overrides', () => {
        service.custom = {
          val0: '${self:not.a.value, "foo"}',
          val1: '${self:not.a.value, "bar"}',
          val2: '${self:custom.val0}:${self:custom.val1}',
          val3: '${self:custom.val2}',
        };
        const expected = {
          val0: 'foo',
          val1: 'bar',
          val2: 'foo:bar',
          val3: 'foo:bar',
        };
        return serverless.variables.populateObject(service.custom)
          .should.become(expected);
      });
      it('should handle deep variables regardless of custom variableSyntax', () => {
        service.provider.variableSyntax = '\\${{([ ~:a-zA-Z0-9._\\\'",\\-\\/\\(\\)]+?)}}';
        serverless.variables.loadVariableSyntax();
        delete service.provider.variableSyntax;
        service.custom = {
          my0thStage: 'DEV',
          my1stStage: '${{self:custom.my0thStage}}',
          my2ndStage: '${{self:custom.my1stStage}}',
        };
        const expected = {
          my0thStage: 'DEV',
          my1stStage: 'DEV',
          my2ndStage: 'DEV',
        };
        return serverless.variables.populateObject(service.custom)
          .should.become(expected);
      });
      it('should handle deep variables regardless of recursion into custom variableSyntax', () => {
        service.provider.variableSyntax = '\\${{([ ~:a-zA-Z0-9._\\\'",\\-\\/\\(\\)]+?)}}';
        serverless.variables.loadVariableSyntax();
        delete service.provider.variableSyntax;
        service.custom = {
          my0thIndex: '0th',
          my1stIndex: '1st',
          my0thStage: 'DEV',
          my1stStage: '${{self:custom.my${{self:custom.my0thIndex}}Stage}}',
          my2ndStage: '${{self:custom.my${{self:custom.my1stIndex}}Stage}}',
        };
        const expected = {
          my0thIndex: '0th',
          my1stIndex: '1st',
          my0thStage: 'DEV',
          my1stStage: 'DEV',
          my2ndStage: 'DEV',
        };
        return serverless.variables.populateObject(service.custom)
          .should.become(expected);
      });
      it('should handle deep variables in complex recursions of custom variableSyntax', () => {
        service.provider.variableSyntax = '\\${{([ ~:a-zA-Z0-9._\\\'",\\-\\/\\(\\)]+?)}}';
        serverless.variables.loadVariableSyntax();
        delete service.provider.variableSyntax;
        service.custom = {
          i0: '0',
          s0: 'DEV',
          s1: '${{self:custom.s0}}! ${{self:custom.s0}}',
          s2: 'I am a ${{self:custom.s0}}! A ${{self:custom.s${{self:custom.i0}}}}!',
          s3: '${{self:custom.s0}}!, I am a ${{self:custom.s1}}!, ${{self:custom.s2}}',
        };
        const expected = {
          i0: '0',
          s0: 'DEV',
          s1: 'DEV! DEV',
          s2: 'I am a DEV! A DEV!',
          s3: 'DEV!, I am a DEV! DEV!, I am a DEV! A DEV!',
        };
        return serverless.variables.populateObject(service.custom)
          .should.become(expected);
      });
      describe('file reading cases', () => {
        let tmpDirPath;
        beforeEach(() => {
          tmpDirPath = testUtils.getTmpDirPath();
          fse.mkdirsSync(tmpDirPath);
          serverless.config.update({ servicePath: tmpDirPath });
        });
        afterEach(() => {
          fse.removeSync(tmpDirPath);
        });
        const makeTempFile = (fileName, fileContent) => {
          fse.writeFileSync(path.join(tmpDirPath, fileName), fileContent);
        };
        const asyncFileName = 'async.load.js';
        const asyncContent = `'use strict';
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
        it('should populate any given variable only once', () => {
          makeTempFile(asyncFileName, asyncContent);
          service.custom = {
            val1: '${self:custom.val0}', // eslint-disable-line no-template-curly-in-string
            val2: '${self:custom.val1}', // eslint-disable-line no-template-curly-in-string
            val0: `\${file(${asyncFileName}):str}`,
          };
          const expected = {
            val1: 'my-async-value-1',
            val2: 'my-async-value-1',
            val0: 'my-async-value-1',
          };
          return serverless.variables.populateObject(service.custom)
            .should.become(expected);
        });
        it('should populate any given variable only once regardless of ordering or reference count',
          () => {
            makeTempFile(asyncFileName, asyncContent);
            service.custom = {
              val9: '${self:custom.val7}', // eslint-disable-line no-template-curly-in-string
              val7: '${self:custom.val5}', // eslint-disable-line no-template-curly-in-string
              val5: '${self:custom.val3}', // eslint-disable-line no-template-curly-in-string
              val3: '${self:custom.val1}', // eslint-disable-line no-template-curly-in-string
              val1: '${self:custom.val0}', // eslint-disable-line no-template-curly-in-string
              val2: '${self:custom.val1}', // eslint-disable-line no-template-curly-in-string
              val4: '${self:custom.val3}', // eslint-disable-line no-template-curly-in-string
              val6: '${self:custom.val5}', // eslint-disable-line no-template-curly-in-string
              val8: '${self:custom.val7}', // eslint-disable-line no-template-curly-in-string
              val0: `\${file(${asyncFileName}):str}`,
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
            return serverless.variables.populateObject(service.custom)
              .should.become(expected);
          });
        it('should populate async objects with contained variables',
          () => {
            makeTempFile(asyncFileName, asyncContent);
            serverless.variables.options = {
              stage: 'dev',
            };
            service.custom = {
              obj: `\${file(${asyncFileName}):obj}`,
            };
            const expected = {
              obj: {
                val0: 'my-async-value-1',
                val1: 'dev',
              },
            };
            return serverless.variables.populateObject(service.custom)
              .should.become(expected);
          });
        const selfFileName = 'self.yml';
        const selfContent = `foo: baz
bar: \${self:custom.self.foo}
`;
        it('should populate a "cyclic" reference across an unresolved dependency (issue #4687)',
          () => {
            makeTempFile(selfFileName, selfContent);
            service.custom = {
              self: `\${file(${selfFileName})}`,
            };
            const expected = {
              self: {
                foo: 'baz',
                bar: 'baz',
              },
            };
            return serverless.variables.populateObject(service.custom)
              .should.become(expected);
          });
        const emptyFileName = 'empty.js';
        const emptyContent = `'use strict';
module.exports = {
  func: () => ({ value: 'a value' }),
}
`;
        it('should reject population of an attribute not exported from a file',
          () => {
            makeTempFile(emptyFileName, emptyContent);
            service.custom = {
              val: `\${file(${emptyFileName}):func.notAValue}`,
            };
            return serverless.variables.populateObject(service.custom)
              .should.be.rejectedWith(serverless.classes.Error,
                'Invalid variable syntax when referencing file');
          });
      });
    });
  });

  describe('#populateProperty()', () => {
    beforeEach(() => {
      serverless.variables.loadVariableSyntax();
    });

    it('should call overwrite if overwrite syntax provided', () => {
      // eslint-disable-next-line no-template-curly-in-string
      const property = 'my stage is ${opt:stage, self:provider.stage}';
      serverless.variables.options = { stage: 'dev' };
      serverless.service.provider.stage = 'prod';
      return serverless.variables.populateProperty(property)
        .should.eventually.eql('my stage is dev');
    });

    it('should allow a single-quoted string if overwrite syntax provided', () => {
      // eslint-disable-next-line no-template-curly-in-string
      const property = "my stage is ${opt:stage, 'prod'}";
      serverless.variables.options = {};
      return serverless.variables.populateProperty(property)
        .should.eventually.eql('my stage is prod');
    });

    it('should allow a double-quoted string if overwrite syntax provided', () => {
      // eslint-disable-next-line no-template-curly-in-string
      const property = 'my stage is ${opt:stage, "prod"}';
      serverless.variables.options = {};
      return serverless.variables.populateProperty(property)
        .should.eventually.eql('my stage is prod');
    });

    it('should call getValueFromSource if no overwrite syntax provided', () => {
      // eslint-disable-next-line no-template-curly-in-string
      const property = 'my stage is ${opt:stage}';
      serverless.variables.options = { stage: 'prod' };
      return serverless.variables.populateProperty(property)
        .should.eventually.eql('my stage is prod');
    });

    it('should warn if an SSM parameter does not exist', () => {
      const options = {
        stage: 'prod',
        region: 'us-east-1',
      };
      serverless.variables.options = options;
      const awsProvider = new AwsProvider(serverless, options);
      const param = '/some/path/to/invalidparam';
      const property = `\${ssm:${param}}`;
      const error = new Error(`Parameter ${param} not found.`, 123);
      const requestStub = sinon.stub(awsProvider, 'request', () => BbPromise.reject(error));
      const warnIfNotFoundSpy = sinon.spy(serverless.variables, 'warnIfNotFound');
      return serverless.variables.populateProperty(property)
        .should.become(undefined)
        .then(() => {
          expect(requestStub.callCount).to.equal(1);
          expect(warnIfNotFoundSpy.callCount).to.equal(1);
        })
        .finally(() => {
          requestStub.restore();
          warnIfNotFoundSpy.restore();
        });
    });

    it('should throw an Error if the SSM request fails', () => {
      const options = {
        stage: 'prod',
        region: 'us-east-1',
      };
      serverless.variables.options = options;
      const awsProvider = new AwsProvider(serverless, options);
      const param = '/some/path/to/invalidparam';
      const property = `\${ssm:${param}}`;
      const error = new serverless.classes.Error('Some random failure.', 123);
      const requestStub = sinon.stub(awsProvider, 'request', () => BbPromise.reject(error));
      return serverless.variables.populateProperty(property)
        .should.be.rejectedWith(serverless.classes.Error)
        .then(() => expect(requestStub.callCount).to.equal(1))
        .finally(() => requestStub.restore());
    });

    it('should run recursively if nested variables provided', () => {
      // eslint-disable-next-line no-template-curly-in-string
      const property = 'my stage is ${env:${opt:name}}';
      process.env.TEST_VAR = 'dev';
      serverless.variables.options = { name: 'TEST_VAR' };
      return serverless.variables.populateProperty(property)
        .should.eventually.eql('my stage is dev')
        .then().finally(() => { delete process.env.TEST_VAR; });
    });
    it('should run recursively through many nested variables', () => {
      // eslint-disable-next-line no-template-curly-in-string
      const property = 'my stage is ${env:${opt:name}}';
      process.env.TEST_VAR = 'dev';
      serverless.variables.options = {
        name: 'T${opt:lvl0}',
        lvl0: 'E${opt:lvl1}',
        lvl1: 'S${opt:lvl2}',
        lvl2: 'T${opt:lvl3}',
        lvl3: '_${opt:lvl4}',
        lvl4: 'V${opt:lvl5}',
        lvl5: 'A${opt:lvl6}',
        lvl6: 'R',
      };
      return serverless.variables.populateProperty(property)
        .should.eventually.eql('my stage is dev')
        .then().finally(() => { delete process.env.TEST_VAR; });
    });
  });

  describe('#populateVariable()', () => {
    it('should populate string variables as sub string', () => {
      const valueToPopulate = 'dev';
      const matchedString = '${opt:stage}'; // eslint-disable-line no-template-curly-in-string
      // eslint-disable-next-line no-template-curly-in-string
      const property = 'my stage is ${opt:stage}';
      serverless.variables.populateVariable(property, matchedString, valueToPopulate)
        .should.eql('my stage is dev');
    });

    it('should populate number variables as sub string', () => {
      const valueToPopulate = 5;
      const matchedString = '${opt:number}'; // eslint-disable-line no-template-curly-in-string
      // eslint-disable-next-line no-template-curly-in-string
      const property = 'your account number is ${opt:number}';
      serverless.variables.populateVariable(property, matchedString, valueToPopulate)
        .should.eql('your account number is 5');
    });

    it('should populate non string variables', () => {
      const valueToPopulate = 5;
      const matchedString = '${opt:number}'; // eslint-disable-line no-template-curly-in-string
      const property = '${opt:number}'; // eslint-disable-line no-template-curly-in-string
      return serverless.variables.populateVariable(property, matchedString, valueToPopulate)
        .should.equal(5);
    });

    it('should throw error if populating non string or non number variable as sub string', () => {
      const valueToPopulate = {};
      const matchedString = '${opt:object}'; // eslint-disable-line no-template-curly-in-string
      // eslint-disable-next-line no-template-curly-in-string
      const property = 'your account number is ${opt:object}';
      return expect(() =>
        serverless.variables.populateVariable(property, matchedString, valueToPopulate))
        .to.throw(serverless.classes.Error);
    });
  });

  describe('#splitByComma', () => {
    it('should return a given empty string', () => {
      const input = '';
      const expected = [input];
      expect(serverless.variables.splitByComma(input)).to.eql(expected);
    });
    it('should return a undelimited string', () => {
      const input = 'foo:bar';
      const expected = [input];
      expect(serverless.variables.splitByComma(input)).to.eql(expected);
    });
    it('should split basic comma delimited strings', () => {
      const input = 'my,values,to,split';
      const expected = ['my', 'values', 'to', 'split'];
      expect(serverless.variables.splitByComma(input)).to.eql(expected);
    });
    it('should remove leading and following white space', () => {
      const input = ' \t\nfoobar\n\t ';
      const expected = ['foobar'];
      expect(serverless.variables.splitByComma(input)).to.eql(expected);
    });
    it('should remove white space surrounding commas', () => {
      const input = 'a,b ,c , d, e  ,  f\t,g\n,h,\ti,\nj,\t\n , \n\tk';
      const expected = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k'];
      expect(serverless.variables.splitByComma(input)).to.eql(expected);
    });
    it('should ignore quoted commas', () => {
      const input = '",", \',\', ",\', \',\'", "\',\', \',\'", \',", ","\', \'",", ","\'';
      const expected = [
        '","',
        '\',\'',
        '",\', \',\'"',
        '"\',\', \',\'"',
        '\',", ","\'',
        '\'",", ","\'',
      ];
      expect(serverless.variables.splitByComma(input)).to.eql(expected);
    });
    it('should deal with a combination of these cases', () => {
      const input = ' \t\n\'a\'\t\n , \n\t"foo,bar", opt:foo, ",", \',\', "\',\', \',\'", foo\n\t ';
      const expected = ['\'a\'', '"foo,bar"', 'opt:foo', '","', '\',\'', '"\',\', \',\'"', 'foo'];
      expect(serverless.variables.splitByComma(input)).to.eql(expected);
    });
  });

  describe('#overwrite()', () => {
    it('should overwrite undefined and null values', () => {
      const getValueFromSourceStub = sinon.stub(serverless.variables, 'getValueFromSource');
      getValueFromSourceStub.onCall(0).resolves(undefined);
      getValueFromSourceStub.onCall(1).resolves(null);
      getValueFromSourceStub.onCall(2).resolves('variableValue');
      return serverless.variables.overwrite(['opt:stage', 'env:stage', 'self:provider.stage'])
        .should.be.fulfilled
        .then((valueToPopulate) => {
          expect(valueToPopulate).to.equal('variableValue');
          expect(getValueFromSourceStub).to.have.been.calledThrice;
        })
        .finally(() => getValueFromSourceStub.restore());
    });

    it('should overwrite empty object values', () => {
      const getValueFromSourceStub = sinon.stub(serverless.variables, 'getValueFromSource');
      getValueFromSourceStub.onCall(0).resolves({});
      getValueFromSourceStub.onCall(1).resolves('variableValue');
      return serverless.variables.overwrite(['opt:stage', 'env:stage']).should.be.fulfilled
        .then((valueToPopulate) => {
          expect(valueToPopulate).to.equal('variableValue');
          expect(getValueFromSourceStub).to.have.been.calledTwice;
        })
        .finally(() => getValueFromSourceStub.restore());
    });

    it('should not overwrite 0 values', () => {
      const getValueFromSourceStub = sinon.stub(serverless.variables, 'getValueFromSource');
      getValueFromSourceStub.onCall(0).resolves(0);
      getValueFromSourceStub.onCall(1).resolves('variableValue');
      return serverless.variables.overwrite(['opt:stage', 'env:stage']).should.become(0)
        .then().finally(() => getValueFromSourceStub.restore());
    });

    it('should not overwrite false values', () => {
      const getValueFromSourceStub = sinon.stub(serverless.variables, 'getValueFromSource');
      getValueFromSourceStub.onCall(0).resolves(false);
      getValueFromSourceStub.onCall(1).resolves('variableValue');
      return serverless.variables.overwrite(['opt:stage', 'env:stage']).should.become(false)
        .then().finally(() => getValueFromSourceStub.restore());
    });

    it('should skip getting values once a value has been found', () => {
      const getValueFromSourceStub = sinon.stub(serverless.variables, 'getValueFromSource');
      getValueFromSourceStub.onCall(0).resolves(undefined);
      getValueFromSourceStub.onCall(1).resolves('variableValue');
      getValueFromSourceStub.onCall(2).resolves('variableValue2');
      return serverless.variables.overwrite(['opt:stage', 'env:stage', 'self:provider.stage'])
        .should.be.fulfilled
        .then(valueToPopulate => expect(valueToPopulate).to.equal('variableValue'))
        .finally(() => getValueFromSourceStub.restore());
    });
    it('should properly handle string values containing commas', () => {
      const str = '"foo,bar"';
      const getValueFromSourceStub = sinon.stub(serverless.variables, 'getValueFromSource')
        .resolves(undefined);
      return serverless.variables.overwrite(['opt:stage', str])
        .should.be.fulfilled
        .then(() => expect(getValueFromSourceStub.getCall(1).args[0]).to.eql(str))
        .finally(() => getValueFromSourceStub.restore());
    });
  });

  describe('#getValueFromSource()', () => {
    it('should call getValueFromEnv if referencing env var', () => {
      const getValueFromEnvStub = sinon.stub(serverless.variables, 'getValueFromEnv')
        .resolves('variableValue');
      return serverless.variables.getValueFromSource('env:TEST_VAR').should.be.fulfilled
        .then((valueToPopulate) => {
          expect(valueToPopulate).to.equal('variableValue');
          expect(getValueFromEnvStub).to.have.been.called;
          expect(getValueFromEnvStub).to.have.been.calledWith('env:TEST_VAR');
        })
        .finally(() => getValueFromEnvStub.restore());
    });

    it('should call getValueFromOptions if referencing an option', () => {
      const getValueFromOptionsStub = sinon
        .stub(serverless.variables, 'getValueFromOptions')
        .resolves('variableValue');
      return serverless.variables.getValueFromSource('opt:stage').should.be.fulfilled
        .then((valueToPopulate) => {
          expect(valueToPopulate).to.equal('variableValue');
          expect(getValueFromOptionsStub).to.have.been.called;
          expect(getValueFromOptionsStub).to.have.been.calledWith('opt:stage');
        })
        .finally(() => getValueFromOptionsStub.restore());
    });

    it('should call getValueFromSelf if referencing from self', () => {
      const getValueFromSelfStub = sinon.stub(serverless.variables, 'getValueFromSelf')
        .resolves('variableValue');
      return serverless.variables.getValueFromSource('self:provider').should.be.fulfilled
        .then((valueToPopulate) => {
          expect(valueToPopulate).to.equal('variableValue');
          expect(getValueFromSelfStub).to.have.been.called;
          expect(getValueFromSelfStub).to.have.been.calledWith('self:provider');
        })
        .finally(() => getValueFromSelfStub.restore());
    });

    it('should call getValueFromFile if referencing from another file', () => {
      const getValueFromFileStub = sinon.stub(serverless.variables, 'getValueFromFile')
        .resolves('variableValue');
      return serverless.variables.getValueFromSource('file(./config.yml)').should.be.fulfilled
        .then((valueToPopulate) => {
          expect(valueToPopulate).to.equal('variableValue');
          expect(getValueFromFileStub).to.have.been.called;
          expect(getValueFromFileStub).to.have.been.calledWith('file(./config.yml)');
        })
        .finally(() => getValueFromFileStub.restore());
    });

    it('should call getValueFromCf if referencing CloudFormation Outputs', () => {
      const getValueFromCfStub = sinon.stub(serverless.variables, 'getValueFromCf')
        .resolves('variableValue');
      return serverless.variables.getValueFromSource('cf:test-stack.testOutput').should.be.fulfilled
        .then((valueToPopulate) => {
          expect(valueToPopulate).to.equal('variableValue');
          expect(getValueFromCfStub).to.have.been.called;
          expect(getValueFromCfStub).to.have.been.calledWith('cf:test-stack.testOutput');
        })
        .finally(() => getValueFromCfStub.restore());
    });

    it('should call getValueFromS3 if referencing variable in S3', () => {
      const getValueFromS3Stub = sinon.stub(serverless.variables, 'getValueFromS3')
        .resolves('variableValue');
      return serverless.variables.getValueFromSource('s3:test-bucket/path/to/key')
        .should.be.fulfilled
        .then((valueToPopulate) => {
          expect(valueToPopulate).to.equal('variableValue');
          expect(getValueFromS3Stub).to.have.been.called;
          expect(getValueFromS3Stub).to.have.been.calledWith('s3:test-bucket/path/to/key');
        })
        .finally(() => getValueFromS3Stub.restore());
    });

    it('should call getValueFromSsm if referencing variable in SSM', () => {
      const getValueFromSsmStub = sinon.stub(serverless.variables, 'getValueFromSsm')
        .resolves('variableValue');
      return serverless.variables.getValueFromSource('ssm:/test/path/to/param')
        .should.be.fulfilled
        .then((valueToPopulate) => {
          expect(valueToPopulate).to.equal('variableValue');
          expect(getValueFromSsmStub).to.have.been.called;
          expect(getValueFromSsmStub).to.have.been.calledWith('ssm:/test/path/to/param');
        })
        .finally(() => getValueFromSsmStub.restore());
    });
    it('should reject invalid sources', () =>
      serverless.variables.getValueFromSource('weird:source')
        .should.be.rejectedWith(serverless.classes.Error));
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
          const value = 'variableValue';
          const getValueFunctionStub = sinon.stub(serverless.variables, source.function)
            .resolves(value);
          return BbPromise.all([
            serverless.variables.getValueFromSource(source.variableString).should.become(value),
            BbPromise.delay(100).then(() =>
              serverless.variables.getValueFromSource(source.variableString).should.become(value)),
          ]).then(() => {
            expect(getValueFunctionStub).to.have.been.calledOnce;
            expect(getValueFunctionStub).to.have.been.calledWith(source.variableString);
          }).finally(() =>
            getValueFunctionStub.restore());
        });
      });
    });
  });

  describe('#getValueFromEnv()', () => {
    it('should get variable from environment variables', () => {
      process.env.TEST_VAR = 'someValue';
      return serverless.variables.getValueFromEnv('env:TEST_VAR')
        .finally(() => { delete process.env.TEST_VAR; })
        .should.become('someValue');
    });

    it('should allow top-level references to the environment variables hive', () => {
      process.env.TEST_VAR = 'someValue';
      return serverless.variables.getValueFromEnv('env:').then((valueToPopulate) => {
        expect(valueToPopulate.TEST_VAR).to.be.equal('someValue');
      })
        .finally(() => { delete process.env.TEST_VAR; });
    });
  });

  describe('#getValueFromOptions()', () => {
    it('should get variable from options', () => {
      serverless.variables.options = { stage: 'prod' };
      return serverless.variables.getValueFromOptions('opt:stage').should.become('prod');
    });

    it('should allow top-level references to the options hive', () => {
      serverless.variables.options = { stage: 'prod' };
      return serverless.variables.getValueFromOptions('opt:')
        .should.become(serverless.variables.options);
    });
  });

  describe('#getValueFromSelf()', () => {
    beforeEach(() => {
      serverless.service.provider.variableSyntax = '\\${{([ ~:a-zA-Z0-9._\'",\\-\\/\\(\\)]+?)}}';
      serverless.variables.loadVariableSyntax();
      delete serverless.service.provider.variableSyntax;
    });
    it('should get variable from self serverless.yml file', () => {
      serverless.variables.service = {
        service: 'testService',
        provider: serverless.service.provider,
      };
      return serverless.variables.getValueFromSelf('self:service').should.become('testService');
    });
    it('should redirect ${self:service.name} to ${self:service}', () => {
      serverless.variables.service = {
        service: 'testService',
        provider: serverless.service.provider,
      };
      return serverless.variables.getValueFromSelf('self:service.name')
        .should.become('testService');
    });
    it('should redirect ${self:provider} to ${self:provider.name}', () => {
      serverless.variables.service = {
        service: 'testService',
        provider: { name: 'aws' },
      };
      return serverless.variables.getValueFromSelf('self:provider').should.become('aws');
    });
    it('should redirect ${self:service.awsKmsKeyArn} to ${self:serviceObject.awsKmsKeyArn}', () => {
      const keyArn = 'arn:aws:kms:us-east-1:xxxxxxxxxxxx:key/xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx';
      serverless.variables.service = {
        service: 'testService',
        serviceObject: {
          name: 'testService',
          awsKmsKeyArn: keyArn,
        },
      };
      return serverless.variables.getValueFromSelf('self:service.awsKmsKeyArn')
        .should.become(keyArn);
    });
    it('should handle self-references to the root of the serverless.yml file', () => {
      serverless.variables.service = {
        service: 'testService',
        provider: 'testProvider',
        defaults: serverless.service.defaults,
      };
      return serverless.variables.getValueFromSelf('self:')
        .should.eventually.equal(serverless.variables.service);
    });
  });

  describe('#getValueFromFile()', () => {
    it('should work for absolute paths with ~ ', () => {
      const expectedFileName = `${os.homedir()}/somedir/config.yml`;
      const configYml = {
        test: 1,
        test2: 'test2',
        testObj: {
          sub: 2,
          prob: 'prob',
        },
      };
      const fileExistsStub = sinon.stub(serverless.utils, 'fileExistsSync').returns(true);
      const realpathSync = sinon.stub(fse, 'realpathSync').returns(expectedFileName);
      const readFileSyncStub = sinon.stub(serverless.utils, 'readFileSync').returns(configYml);
      return serverless.variables.getValueFromFile('file(~/somedir/config.yml)').should.be.fulfilled
        .then((valueToPopulate) => {
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
      SUtils.writeFileSync(path.join(tmpDirPath, 'config.yml'), YAML.dump(configYml));
      serverless.config.update({ servicePath: tmpDirPath });
      return serverless.variables.getValueFromFile('file(./config.yml)')
        .should.eventually.eql(configYml);
    });

    it('should get undefined if non existing file and the second argument is true', () => {
      const tmpDirPath = testUtils.getTmpDirPath();
      serverless.config.update({ servicePath: tmpDirPath });
      const realpathSync = sinon.spy(fse, 'realpathSync');
      const existsSync = sinon.spy(fse, 'existsSync');
      return serverless.variables.getValueFromFile('file(./non-existing.yml)').should.be.fulfilled
        .then((valueToPopulate) => {
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
      const SUtils = new Utils();
      const tmpDirPath = testUtils.getTmpDirPath();
      SUtils.writeFileSync(path.join(tmpDirPath, 'someFile'), 'hello world');
      serverless.config.update({ servicePath: tmpDirPath });
      return serverless.variables.getValueFromFile('file(./someFile)')
        .should.become('hello world');
    });

    it('should populate symlinks', () => {
      const SUtils = new Utils();
      const tmpDirPath = testUtils.getTmpDirPath();
      const realFilePath = path.join(tmpDirPath, 'someFile');
      const symlinkPath = path.join(tmpDirPath, 'refSomeFile');
      SUtils.writeFileSync(realFilePath, 'hello world');
      fse.ensureSymlinkSync(realFilePath, symlinkPath);
      serverless.config.update({ servicePath: tmpDirPath });
      return serverless.variables.getValueFromFile('file(./refSomeFile)')
        .should.become('hello world')
        .then().finally(() => {
          fse.removeSync(realFilePath);
          fse.removeSync(symlinkPath);
        });
    });

    it('should trim trailing whitespace and new line character', () => {
      const SUtils = new Utils();
      const tmpDirPath = testUtils.getTmpDirPath();
      SUtils.writeFileSync(path.join(tmpDirPath, 'someFile'), 'hello world \n');
      serverless.config.update({ servicePath: tmpDirPath });
      return serverless.variables.getValueFromFile('file(./someFile)')
        .should.become('hello world');
    });

    it('should populate from another file when variable is of any type', () => {
      const SUtils = new Utils();
      const tmpDirPath = testUtils.getTmpDirPath();
      const configYml = {
        test0: 0,
        test1: 'test1',
        test2: {
          sub: 2,
          prob: 'prob',
        },
      };
      SUtils.writeFileSync(path.join(tmpDirPath, 'config.yml'), YAML.dump(configYml));
      serverless.config.update({ servicePath: tmpDirPath });
      return serverless.variables.getValueFromFile('file(./config.yml):test2.sub')
        .should.become(configYml.test2.sub);
    });

    it('should populate from a javascript file', () => {
      const SUtils = new Utils();
      const tmpDirPath = testUtils.getTmpDirPath();
      const jsData = 'module.exports.hello=function(){return "hello world";};';
      SUtils.writeFileSync(path.join(tmpDirPath, 'hello.js'), jsData);
      serverless.config.update({ servicePath: tmpDirPath });
      return serverless.variables.getValueFromFile('file(./hello.js):hello')
        .should.become('hello world');
    });

    it('should populate an entire variable exported by a javascript file', () => {
      const SUtils = new Utils();
      const tmpDirPath = testUtils.getTmpDirPath();
      const jsData = 'module.exports=function(){return { hello: "hello world" };};';
      SUtils.writeFileSync(path.join(tmpDirPath, 'hello.js'), jsData);
      serverless.config.update({ servicePath: tmpDirPath });
      return serverless.variables.getValueFromFile('file(./hello.js)')
        .should.become({ hello: 'hello world' });
    });

    it('should throw if property exported by a javascript file is not a function', () => {
      const SUtils = new Utils();
      const tmpDirPath = testUtils.getTmpDirPath();
      const jsData = 'module.exports={ hello: "hello world" };';
      SUtils.writeFileSync(path.join(tmpDirPath, 'hello.js'), jsData);
      serverless.config.update({ servicePath: tmpDirPath });
      return serverless.variables.getValueFromFile('file(./hello.js)')
        .should.be.rejectedWith(serverless.classes.Error);
    });

    it('should populate deep object from a javascript file', () => {
      const SUtils = new Utils();
      const tmpDirPath = testUtils.getTmpDirPath();
      const jsData = `module.exports.hello=function(){
        return {one:{two:{three: 'hello world'}}}
      };`;
      SUtils.writeFileSync(path.join(tmpDirPath, 'hello.js'), jsData);
      serverless.config.update({ servicePath: tmpDirPath });
      serverless.variables.loadVariableSyntax();
      return serverless.variables.getValueFromFile('file(./hello.js):hello.one.two.three')
        .should.become('hello world');
    });

    it('should preserve the exported function context when executing', () => {
      const SUtils = new Utils();
      const tmpDirPath = testUtils.getTmpDirPath();
      const jsData = `
      module.exports.one = {two: {three: 'hello world'}}
      module.exports.hello=function(){ return this; };`;
      SUtils.writeFileSync(path.join(tmpDirPath, 'hello.js'), jsData);
      serverless.config.update({ servicePath: tmpDirPath });
      serverless.variables.loadVariableSyntax();
      return serverless.variables.getValueFromFile('file(./hello.js):hello.one.two.three')
        .should.become('hello world');
    });

    it('should file variable not using ":" syntax', () => {
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
      SUtils.writeFileSync(path.join(tmpDirPath, 'config.yml'), YAML.dump(configYml));
      serverless.config.update({ servicePath: tmpDirPath });
      return serverless.variables.getValueFromFile('file(./config.yml).testObj.sub')
        .should.be.rejectedWith(serverless.classes.Error);
    });
  });

  describe('#getValueFromCf()', () => {
    it('should get variable from CloudFormation', () => {
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
      const cfStub = sinon.stub(serverless.getProvider('aws'), 'request',
        () => BbPromise.resolve(awsResponseMock));
      return serverless.variables.getValueFromCf('cf:some-stack.MockExport')
        .should.become('MockValue')
        .then(() => {
          expect(cfStub).to.have.been.calledOnce;
          expect(cfStub).to.have.been.calledWithExactly(
            'CloudFormation',
            'describeStacks',
            { StackName: 'some-stack' },
            { useCache: true });
        })
        .finally(() => cfStub.restore());
    });

    it('should reject CloudFormation variables that do not exist', () => {
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
      const cfStub = sinon.stub(serverless.getProvider('aws'), 'request',
        () => BbPromise.resolve(awsResponseMock));
      return serverless.variables.getValueFromCf('cf:some-stack.DoestNotExist')
        .should.be.rejectedWith(serverless.classes.Error,
          /to request a non exported variable from CloudFormation/)
        .then(() => {
          expect(cfStub).to.have.been.calledOnce;
          expect(cfStub).to.have.been.calledWithExactly(
            'CloudFormation',
            'describeStacks',
            { StackName: 'some-stack' },
            { useCache: true });
        })
        .finally(() => cfStub.restore());
    });
  });

  describe('#getValueFromS3()', () => {
    let awsProvider;
    beforeEach(() => {
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
      const s3Stub = sinon.stub(awsProvider, 'request', () => BbPromise.resolve(awsResponseMock));
      return serverless.variables.getValueFromS3('s3:some.bucket/path/to/key')
        .should.become('MockValue')
        .then(() => {
          expect(s3Stub).to.have.been.calledOnce;
          expect(s3Stub).to.have.been.calledWithExactly(
            'S3',
            'getObject',
            {
              Bucket: 'some.bucket',
              Key: 'path/to/key',
            },
            { useCache: true });
        })
        .finally(() => s3Stub.restore());
    });

    it('should throw error if error getting value from S3', () => {
      const error = new Error('The specified bucket is not valid');
      const requestStub = sinon.stub(awsProvider, 'request', () => BbPromise.reject(error));
      return expect(serverless.variables.getValueFromS3('s3:some.bucket/path/to/key'))
        .to.be.rejectedWith(
          serverless.classes.Error,
          'Error getting value for s3:some.bucket/path/to/key. The specified bucket is not valid')
        .then().finally(() => requestStub.restore());
    });
  });

  describe('#getValueFromSsm()', () => {
    const param = 'Param-01_valid.chars';
    const value = 'MockValue';
    const awsResponseMock = {
      Parameter: {
        Value: value,
      },
    };
    let awsProvider;
    beforeEach(() => {
      const options = {
        stage: 'prod',
        region: 'us-west-2',
      };
      awsProvider = new AwsProvider(serverless, options);
      serverless.setProvider('aws', awsProvider);
      serverless.variables.options = options;
    });
    it('should get variable from Ssm using regular-style param', () => {
      const ssmStub = sinon.stub(awsProvider, 'request', () => BbPromise.resolve(awsResponseMock));
      return serverless.variables.getValueFromSsm(`ssm:${param}`)
        .should.become(value)
        .then(() => {
          expect(ssmStub).to.have.been.calledOnce;
          expect(ssmStub).to.have.been.calledWithExactly(
            'SSM',
            'getParameter',
            {
              Name: param,
              WithDecryption: false,
            },
            { useCache: true });
        })
        .finally(() => ssmStub.restore());
    });
    it('should get variable from Ssm using path-style param', () => {
      const ssmStub = sinon.stub(awsProvider, 'request', () => BbPromise.resolve(awsResponseMock));
      return serverless.variables.getValueFromSsm(`ssm:${param}`)
        .should.become(value)
        .then(() => {
          expect(ssmStub).to.have.been.calledOnce;
          expect(ssmStub).to.have.been.calledWithExactly(
            'SSM',
            'getParameter',
            {
              Name: param,
              WithDecryption: false,
            },
            { useCache: true });
        })
        .finally(() => ssmStub.restore());
    });
    it('should get encrypted variable from Ssm using extended syntax', () => {
      const ssmStub = sinon.stub(awsProvider, 'request', () => BbPromise.resolve(awsResponseMock));
      return serverless.variables.getValueFromSsm(`ssm:${param}~true`)
        .should.become(value)
        .then(() => {
          expect(ssmStub).to.have.been.calledOnce;
          expect(ssmStub).to.have.been.calledWithExactly(
            'SSM',
            'getParameter',
            {
              Name: param,
              WithDecryption: true,
            },
            { useCache: true });
        })
        .finally(() => ssmStub.restore());
    });
    it('should get unencrypted variable from Ssm using extended syntax', () => {
      const ssmStub = sinon.stub(awsProvider, 'request', () => BbPromise.resolve(awsResponseMock));
      return serverless.variables.getValueFromSsm(`ssm:${param}~false`)
        .should.become(value)
        .then(() => {
          expect(ssmStub).to.have.been.calledOnce;
          expect(ssmStub).to.have.been.calledWithExactly(
            'SSM',
            'getParameter',
            {
              Name: param,
              WithDecryption: false,
            },
            { useCache: true });
        })
        .finally(() => ssmStub.restore());
    });
    it('should ignore bad values for extended syntax', () => {
      const ssmStub = sinon.stub(awsProvider, 'request', () => BbPromise.resolve(awsResponseMock));
      return serverless.variables.getValueFromSsm(`ssm:${param}~badvalue`)
        .should.become(value)
        .then(() => {
          expect(ssmStub).to.have.been.calledOnce;
          expect(ssmStub).to.have.been.calledWithExactly(
            'SSM',
            'getParameter',
            {
              Name: param,
              WithDecryption: false,
            },
            { useCache: true });
        })
        .finally(() => ssmStub.restore());
    });

    it('should return undefined if SSM parameter does not exist', () => {
      const error = new Error(`Parameter ${param} not found.`);
      const requestStub = sinon.stub(awsProvider, 'request', () => BbPromise.reject(error));
      return serverless.variables.getValueFromSsm(`ssm:${param}`)
        .should.become(undefined)
        .then().finally(() => requestStub.restore());
    });

    it('should reject if SSM request returns unexpected error', () => {
      const error = new Error(
        'User: <arn> is not authorized to perform: ssm:GetParameter on resource: <arn>');
      const requestStub = sinon.stub(awsProvider, 'request', () => BbPromise.reject(error));
      return serverless.variables.getValueFromSsm(`ssm:${param}`)
        .should.be.rejected
        .then().finally(() => requestStub.restore());
    });
  });

  describe('#getDeeperValue()', () => {
    it('should get deep values', () => {
      const valueToPopulateMock = {
        service: 'testService',
        custom: {
          subProperty: {
            deep: 'deepValue',
          },
        },
      };
      serverless.variables.loadVariableSyntax();
      return serverless.variables.getDeeperValue(['custom', 'subProperty', 'deep'],
        valueToPopulateMock).should.become('deepValue');
    });
    it('should not throw error if referencing invalid properties', () => {
      const valueToPopulateMock = {
        service: 'testService',
        custom: {
          subProperty: 'hello',
        },
      };
      serverless.variables.loadVariableSyntax();
      return serverless.variables.getDeeperValue(['custom', 'subProperty', 'deep', 'deeper'],
        valueToPopulateMock).should.eventually.deep.equal({});
    });
    it('should return a simple deep variable when final deep value is variable', () => {
      serverless.variables.service = {
        service: 'testService',
        custom: {
          subProperty: {
            // eslint-disable-next-line no-template-curly-in-string
            deep: '${self:custom.anotherVar.veryDeep}',
          },
        },
        provider: serverless.service.provider,
      };
      serverless.variables.loadVariableSyntax();
      return serverless.variables.getDeeperValue(
        ['custom', 'subProperty', 'deep'],
        serverless.variables.service
      ).should.become('${deep:0}');
    });
    it('should return a deep continuation when middle deep value is variable', () => {
      serverless.variables.service = {
        service: 'testService',
        custom: {
          anotherVar: '${self:custom.var}', // eslint-disable-line no-template-curly-in-string
        },
        provider: serverless.service.provider,
      };
      serverless.variables.loadVariableSyntax();
      return serverless.variables.getDeeperValue(
        ['custom', 'anotherVar', 'veryDeep'],
        serverless.variables.service)
        .should.become('${deep:0.veryDeep}');
    });
  });
  describe('#warnIfNotFound()', () => {
    let logWarningSpy;
    let consoleLogStub;
    let varProxy;
    beforeEach(() => {
      logWarningSpy = sinon.spy(slsError, 'logWarning');
      consoleLogStub = sinon.stub(console, 'log').returns();
      const ProxyQuiredVariables = proxyquire('./Variables.js', { './Error': logWarningSpy });
      varProxy = new ProxyQuiredVariables(serverless);
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
