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
const _ = require('lodash');
const overrideEnv = require('process-utils/override-env');

const AwsProvider = require('../plugins/aws/provider/awsProvider');
const fse = require('../utils/fs/fse');
const Serverless = require('../../lib/Serverless');
const slsError = require('./Error');
const Utils = require('../../lib/classes/Utils');
const Variables = require('../../lib/classes/Variables');
const { getTmpDirPath } = require('../../tests/utils/fs');
const skipOnDisabledSymlinksInWindows = require('@serverless/test/skip-on-disabled-symlinks-in-windows');

BbPromise.longStackTraces(true);

chai.use(require('chai-as-promised'));
chai.use(require('sinon-chai'));

chai.should();

const expect = chai.expect;

describe('Variables', () => {
  let serverless;
  let restoreEnv;

  beforeEach(() => {
    ({ restoreEnv } = overrideEnv());
    serverless = new Serverless();
  });

  afterEach(() => restoreEnv());

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
      serverless.service.provider.variableSyntax = '\\${{([ ~:a-zA-Z0-9._@\'",\\-\\/\\(\\)*?]+?)}}';
      serverless.variables.loadVariableSyntax();
      expect(serverless.variables.variableSyntax).to.be.a('RegExp');
    });
  });

  describe('#populateService()', () => {
    it('should remove problematic attributes bofore calling populateObjectImpl with the service', () => {
      const prepopulateServiceStub = sinon
        .stub(serverless.variables, 'prepopulateService')
        .returns(BbPromise.resolve());
      const populateObjectStub = sinon
        .stub(serverless.variables, 'populateObjectImpl')
        .callsFake(val => {
          expect(val).to.equal(serverless.service);
          expect(val.provider.variableSyntax).to.be.undefined;
          expect(val.serverless).to.be.undefined;
          return BbPromise.resolve();
        });
      return serverless.variables
        .populateService()
        .should.be.fulfilled.then()
        .finally(() => {
          prepopulateServiceStub.restore();
          populateObjectStub.restore();
        });
    });
    it('should clear caches and remaining state *before* [pre]populating service', () => {
      const prepopulateServiceStub = sinon
        .stub(serverless.variables, 'prepopulateService')
        .callsFake(val => {
          expect(serverless.variables.deep).to.eql([]);
          expect(serverless.variables.tracker.getAll()).to.eql([]);
          return BbPromise.resolve(val);
        });
      const populateObjectStub = sinon
        .stub(serverless.variables, 'populateObjectImpl')
        .callsFake(val => {
          expect(serverless.variables.deep).to.eql([]);
          expect(serverless.variables.tracker.getAll()).to.eql([]);
          return BbPromise.resolve(val);
        });
      serverless.variables.deep.push('${foo:}');
      const prms = BbPromise.resolve('foo');
      serverless.variables.tracker.add('foo:', prms, '${foo:}');
      prms.state = 'resolved';
      return serverless.variables
        .populateService()
        .should.be.fulfilled.then()
        .finally(() => {
          prepopulateServiceStub.restore();
          populateObjectStub.restore();
        });
    });
    it('should clear caches and remaining *after* [pre]populating service', () => {
      const prepopulateServiceStub = sinon
        .stub(serverless.variables, 'prepopulateService')
        .callsFake(val => {
          serverless.variables.deep.push('${foo:}');
          const promise = BbPromise.resolve(val);
          serverless.variables.tracker.add('foo:', promise, '${foo:}');
          promise.state = 'resolved';
          return BbPromise.resolve();
        });
      const populateObjectStub = sinon
        .stub(serverless.variables, 'populateObjectImpl')
        .callsFake(val => {
          serverless.variables.deep.push('${bar:}');
          const promise = BbPromise.resolve(val);
          serverless.variables.tracker.add('bar:', promise, '${bar:}');
          promise.state = 'resolved';
          return BbPromise.resolve();
        });
      return serverless.variables
        .populateService()
        .should.be.fulfilled.then(() => {
          expect(serverless.variables.deep).to.eql([]);
          expect(serverless.variables.tracker.getAll()).to.eql([]);
        })
        .finally(() => {
          prepopulateServiceStub.restore();
          populateObjectStub.restore();
        });
    });
  });

  describe('fallback', () => {
    it('should fallback if ${self} syntax fail to populate but fallback is provided', () => {
      serverless.variables.service.custom = {
        settings: '${self:nonExistent, "fallback"}',
      };
      return serverless.variables.populateService().should.be.fulfilled.then(result => {
        expect(result.custom).to.be.deep.eql({
          settings: 'fallback',
        });
      });
    });

    it('should fallback if ${opt} syntax fail to populate but fallback is provided', () => {
      serverless.variables.service.custom = {
        settings: '${opt:nonExistent, "fallback"}',
      };
      return serverless.variables.populateService().should.be.fulfilled.then(result => {
        expect(result.custom).to.be.deep.eql({
          settings: 'fallback',
        });
      });
    });

    it('should fallback if ${env} syntax fail to populate but fallback is provided', () => {
      serverless.variables.service.custom = {
        settings: '${env:nonExistent, "fallback"}',
      };
      return serverless.variables.populateService().should.be.fulfilled.then(result => {
        expect(result.custom).to.be.deep.eql({
          settings: 'fallback',
        });
      });
    });

    describe('file syntax', () => {
      it('should fallback if file does not exist but fallback is provided', () => {
        serverless.variables.service.custom = {
          settings: '${file(~/config.yml):xyz, "fallback"}',
        };

        const fileExistsStub = sinon.stub(serverless.utils, 'fileExistsSync').returns(false);
        const realpathSync = sinon.stub(fse, 'realpathSync').returns(`${os.homedir()}/config.yml`);

        return serverless.variables
          .populateService()
          .should.be.fulfilled.then(result => {
            expect(result.custom).to.be.deep.eql({
              settings: 'fallback',
            });
          })
          .finally(() => {
            fileExistsStub.restore();
            realpathSync.restore();
          });
      });

      it('should fallback if file exists but given key not found and fallback is provided', () => {
        serverless.variables.service.custom = {
          settings: '${file(~/config.yml):xyz, "fallback"}',
        };

        const fileExistsStub = sinon.stub(serverless.utils, 'fileExistsSync').returns(true);
        const realpathSync = sinon.stub(fse, 'realpathSync').returns(`${os.homedir()}/config.yml`);
        const readFileSyncStub = sinon.stub(serverless.utils, 'readFileSync').returns({
          test: 1,
          test2: 'test2',
        });

        return serverless.variables
          .populateService()
          .should.be.fulfilled.then(result => {
            expect(result.custom).to.be.deep.eql({
              settings: 'fallback',
            });
          })
          .finally(() => {
            fileExistsStub.restore();
            realpathSync.restore();
            readFileSyncStub.restore();
          });
      });
    });

    describe('aws-specific syntax', () => {
      let awsProvider;
      let requestStub;
      beforeEach(() => {
        awsProvider = new AwsProvider(serverless, {});
        requestStub = sinon
          .stub(awsProvider, 'request')
          .callsFake(() => BbPromise.reject(new serverless.classes.Error('Not found.', 400)));
      });
      afterEach(() => {
        requestStub.restore();
      });
      it('should fallback if ${s3} syntax fail to populate but fallback is provided', () => {
        serverless.variables.service.custom = {
          settings: '${s3:bucket/key, "fallback"}',
        };
        return serverless.variables.populateService().should.be.fulfilled.then(result => {
          expect(result.custom).to.be.deep.eql({
            settings: 'fallback',
          });
        });
      });

      it('should fallback if ${cf} syntax fail to populate but fallback is provided', () => {
        serverless.variables.service.custom = {
          settings: '${cf:stack.value, "fallback"}',
        };
        return serverless.variables.populateService().should.be.fulfilled.then(result => {
          expect(result.custom).to.be.deep.eql({
            settings: 'fallback',
          });
        });
      });

      it('should fallback if ${ssm} syntax fail to populate but fallback is provided', () => {
        serverless.variables.service.custom = {
          settings: '${ssm:/path/param, "fallback"}',
        };
        return serverless.variables.populateService().should.be.fulfilled.then(result => {
          expect(result.custom).to.be.deep.eql({
            settings: 'fallback',
          });
        });
      });

      it('should throw an error if fallback fails too', () => {
        serverless.variables.service.custom = {
          settings: '${s3:bucket/key, ${ssm:/path/param}}',
        };
        return serverless.variables.populateService().should.be.rejected;
      });
    });
  });

  describe('#prepopulateService', () => {
    // TL;DR: call populateService to test prepopulateService (note addition of 'pre')
    //
    // The prepopulateService resolver basically assumes invocation of of populateService (i.e. that
    // variable syntax is loaded, and that the service object is cleaned up.  Just use
    // populateService to do that work.
    let awsProvider;
    let populateObjectImplStub;
    let requestStub; // just in case... don't want to actually call...
    beforeEach(() => {
      awsProvider = new AwsProvider(serverless, {});
      populateObjectImplStub = sinon.stub(serverless.variables, 'populateObjectImpl');
      populateObjectImplStub.withArgs(serverless.variables.service).returns(BbPromise.resolve());
      requestStub = sinon
        .stub(awsProvider, 'request')
        .callsFake(() => BbPromise.reject(new Error('unexpected')));
    });
    afterEach(() => {
      populateObjectImplStub.restore();
      requestStub.restore();
    });
    const prepopulatedProperties = [
      { name: 'region', getter: provider => provider.getRegion() },
      { name: 'stage', getter: provider => provider.getStage() },
      { name: 'profile', getter: provider => provider.getProfile() },
      {
        name: 'credentials',
        getter: provider => provider.serverless.service.provider.credentials,
      },
      {
        name: 'credentials.accessKeyId',
        getter: provider => provider.serverless.service.provider.credentials.accessKeyId,
      },
      {
        name: 'credentials.secretAccessKey',
        getter: provider => provider.serverless.service.provider.credentials.secretAccessKey,
      },
      {
        name: 'credentials.sessionToken',
        getter: provider => provider.serverless.service.provider.credentials.sessionToken,
      },
    ];
    describe('basic population tests', () => {
      prepopulatedProperties.forEach(property => {
        it(`should populate variables in ${property.name} values`, () => {
          _.set(
            awsProvider.serverless.service.provider,
            property.name,
            '${self:foobar, "default"}'
          );
          return serverless.variables
            .populateService()
            .should.be.fulfilled.then(() =>
              expect(property.getter(awsProvider)).to.be.eql('default')
            );
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
            _.set(awsProvider.serverless.service.provider, property.name, config.value);
            return serverless.variables
              .populateService()
              .should.be.rejectedWith('Variable dependency failure');
          });
          it(`should reject recursively dependent ${config.name} service dependencies`, () => {
            serverless.variables.service.custom = {
              settings: config.value,
            };
            awsProvider.serverless.service.provider.region = '${self:custom.settings.region}';
            return serverless.variables
              .populateService()
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
      stateCombinations.forEach(combination => {
        it('must leave the dependent services in their original state', () => {
          const dependentMethods = [
            { name: 'getValueFromCf', original: serverless.variables.getValueFromCf },
            { name: 'getValueFromS3', original: serverless.variables.getValueFromS3 },
            { name: 'getValueFromSsm', original: serverless.variables.getValueFromSsm },
          ];
          awsProvider.serverless.service.provider.region = combination.region;
          awsProvider.serverless.service.provider.state = combination.state;
          return serverless.variables.populateService().should.be.fulfilled.then(() => {
            dependentMethods.forEach(method => {
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
        b: [{ c: 'd' }, { e: 'f' }],
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

      return serverless.variables
        .populateObject(object)
        .then(populatedObject => {
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
      const populateValueStub = sinon.stub(serverless.variables, 'populateValue').callsFake(
        // eslint-disable-next-line no-template-curly-in-string
        val => {
          return val === '${opt:stage}' ? BbPromise.resolve('prod') : BbPromise.resolve(val);
        }
      );
      return serverless.variables
        .populateObject(object)
        .should.become(expectedPopulatedObject)
        .then()
        .finally(() => populateValueStub.restore());
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
        service.provider.variableSyntax = '\\${([ ~:a-zA-Z0-9._@\'",\\-\\/\\(\\)*?]+?)}'; // default
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
        return expect(
          serverless.variables.populateObject(service).then(result => {
            expect(jc.stringify(result)).to.eql(jc.stringify(expected));
          })
        ).to.be.fulfilled;
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
        return expect(
          serverless.variables.populateObject(service.custom).then(result => {
            expect(result).to.eql(expected);
          })
        ).to.be.fulfilled;
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
        return expect(
          serverless.variables.populateObject(service.custom).then(result => {
            expect(result).to.eql(expected);
          })
        ).to.be.fulfilled;
      });
      it('should properly populate an overwrite with a default value that is the string *', () => {
        service.custom = {
          val0: 'my value', // eslint-disable-next-line no-template-curly-in-string
          val1: '${self:custom.NOT_A_VAL1, self:custom.NOT_A_VAL2, "*"}',
        };
        const expected = {
          val0: 'my value',
          val1: '*',
        };
        return expect(
          serverless.variables.populateObject(service.custom).then(result => {
            expect(result).to.eql(expected);
          })
        ).to.be.fulfilled;
      });
      it('should properly populate an overwrite with a default value that is a string w/*', () => {
        service.custom = {
          val0: 'my value', // eslint-disable-next-line no-template-curly-in-string
          val1: '${self:custom.NOT_A_VAL1, self:custom.NOT_A_VAL2, "foo*"}',
        };
        const expected = {
          val0: 'my value',
          val1: 'foo*',
        };
        return expect(
          serverless.variables.populateObject(service.custom).then(result => {
            expect(result).to.eql(expected);
          })
        ).to.be.fulfilled;
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
        return expect(
          serverless.variables.populateObject(service.custom).then(result => {
            expect(result).to.eql(expected);
          })
        ).to.be.fulfilled;
      });
      it('should do nothing useful on * when not wrapped in quotes', () => {
        service.custom = {
          val0: '${self:custom.*}',
        };
        const expected = { val0: undefined };
        return expect(
          serverless.variables.populateObject(service.custom).then(result => {
            expect(result).to.eql(expected);
          })
        ).to.be.fulfilled;
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
        return expect(
          serverless.variables.populateObject(service.custom).then(result => {
            expect(result).to.eql(expected);
          })
        ).to.be.fulfilled;
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
        return expect(
          serverless.variables.populateObject(service.custom).then(result => {
            expect(result).to.eql(expected);
          })
        ).to.be.fulfilled;
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
        return expect(
          serverless.variables.populateObject(service.custom).then(result => {
            expect(result).to.eql(expected);
          })
        ).to.be.fulfilled;
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
        return expect(
          serverless.variables.populateObject(service.custom).then(result => {
            expect(result).to.eql(expected);
          })
        ).to.be.fulfilled;
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
        return expect(
          serverless.variables.populateObject(service.custom).then(result => {
            expect(result).to.eql(expected);
          })
        ).to.be.fulfilled;
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
        return expect(
          serverless.variables.populateObject(service.custom).then(result => {
            expect(result).to.eql(expected);
          })
        ).to.be.fulfilled;
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
        return expect(
          serverless.variables.populateObject(service.custom).then(result => {
            expect(result).to.eql(expected);
          })
        ).to.be.fulfilled;
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
        return serverless.variables.populateObject(service.custom).should.become(expected);
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
        return serverless.variables.populateObject(service.custom).should.become(expected);
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
        return serverless.variables.populateObject(service.custom).should.become(expected);
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
        return serverless.variables.populateObject(service.custom).should.become(expected);
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
        return serverless.variables.populateObject(service.custom).should.become(expected);
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
        return serverless.variables.populateObject(service.custom).should.become(expected);
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
        return serverless.variables.populateObject(service.custom).should.become(expected);
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
        return serverless.variables.populateObject(service.custom).should.become(expected);
      });
      it('should handle overrides that are populated by unresolvable deep variables', () => {
        service.custom = {
          val0: 'foo',
          val1: '${self:custom.val0}',
          val2: '${self:custom.val1.notAnAttribute, "fallback"}',
        };
        const expected = {
          val0: 'foo',
          val1: 'foo',
          val2: 'fallback',
        };
        return serverless.variables.populateObject(service.custom).should.become(expected);
      });
      it('should handle embedded deep variable replacements in overrides', () => {
        service.custom = {
          foo: 'bar',
          val0: 'foo',
          val1: '${self:custom.val0, "fallback 1"}',
          val2: '${self:custom.${self:custom.val0, self:custom.val1}, "fallback 2"}',
        };
        const expected = {
          foo: 'bar',
          val0: 'foo',
          val1: 'foo',
          val2: 'bar',
        };
        return serverless.variables.populateObject(service.custom).should.become(expected);
      });
      it('should deal with overwites that reference embedded deep references', () => {
        service.custom = {
          val0: 'val',
          val1: 'val0',
          val2: '${self:custom.val1}',
          val3: '${self:custom.${self:custom.val2}, "fallback"}',
          val4: '${self:custom.val3, self:custom.val3}',
        };
        const expected = {
          val0: 'val',
          val1: 'val0',
          val2: 'val0',
          val3: 'val',
          val4: 'val',
        };
        return serverless.variables.populateObject(service.custom).should.become(expected);
      });
      it('should preserve whitespace in double-quote literal fallback', () => {
        service.custom = {
          val0: '${self:custom.val, "rate(3 hours)"}',
        };
        const expected = {
          val0: 'rate(3 hours)',
        };
        return serverless.variables.populateObject(service.custom).should.become(expected);
      });
      it('should preserve whitespace in single-quote literal fallback', () => {
        service.custom = {
          val0: "${self:custom.val, 'rate(1 hour)'}",
        };
        const expected = {
          val0: 'rate(1 hour)',
        };
        return serverless.variables.populateObject(service.custom).should.become(expected);
      });
      it('should preserve question mark in single-quote literal fallback', () => {
        service.custom = {
          val0: "${self:custom.val, '?'}",
        };
        const expected = {
          val0: '?',
        };
        return serverless.variables.populateObject(service.custom).should.become(expected);
      });
      it('should preserve question mark in single-quote literal fallback', () => {
        service.custom = {
          val0: "${self:custom.val, 'cron(0 0 * * ? *)'}",
        };
        const expected = {
          val0: 'cron(0 0 * * ? *)',
        };
        return serverless.variables.populateObject(service.custom).should.become(expected);
      });
      it('should accept whitespace in variables', () => {
        service.custom = {
          val0: '${self: custom.val}',
          val: 'foobar',
        };
        const expected = {
          val: 'foobar',
          val0: 'foobar',
        };
        return serverless.variables.populateObject(service.custom).should.become(expected);
      });
      it('should handle deep variables regardless of custom variableSyntax', () => {
        service.provider.variableSyntax = '\\${{([ ~:a-zA-Z0-9._@\\\'",\\-\\/\\(\\)*?]+?)}}';
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
        return serverless.variables.populateObject(service.custom).should.become(expected);
      });
      it('should handle deep variable continuations regardless of custom variableSyntax', () => {
        service.provider.variableSyntax = '\\${{([ ~:a-zA-Z0-9._@\\\'",\\-\\/\\(\\)*?]+?)}}';
        serverless.variables.loadVariableSyntax();
        delete service.provider.variableSyntax;
        service.custom = {
          my0thStage: { we: 'DEV' },
          my1stStage: '${{self:custom.my0thStage}}',
          my2ndStage: '${{self:custom.my1stStage.we}}',
        };
        const expected = {
          my0thStage: { we: 'DEV' },
          my1stStage: { we: 'DEV' },
          my2ndStage: 'DEV',
        };
        return serverless.variables.populateObject(service.custom).should.become(expected);
      });
      it('should handle deep variables regardless of recursion into custom variableSyntax', () => {
        service.provider.variableSyntax = '\\${{([ ~:a-zA-Z0-9._@\\\'",\\-\\/\\(\\)*?]+?)}}';
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
        return serverless.variables.populateObject(service.custom).should.become(expected);
      });
      it('should handle deep variables in complex recursions of custom variableSyntax', () => {
        service.provider.variableSyntax = '\\${{([ ~:a-zA-Z0-9._@\\\'",\\-\\/\\(\\)*?]+?)}}';
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
        return serverless.variables.populateObject(service.custom).should.become(expected);
      });
      describe('file reading cases', () => {
        let tmpDirPath;
        beforeEach(() => {
          tmpDirPath = getTmpDirPath();
          fse.mkdirsSync(tmpDirPath);
          serverless.config.update({ servicePath: tmpDirPath });
        });
        afterEach(() => {
          fse.removeSync(tmpDirPath);
        });
        const makeTempFile = (fileName, fileContent) => {
          fse.outputFileSync(path.join(tmpDirPath, fileName), fileContent);
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
          return serverless.variables.populateObject(service.custom).should.become(expected);
        });
        it('should still work with a default file name in double or single quotes', () => {
          makeTempFile(asyncFileName, asyncContent);
          service.custom = {
            val1: '${self:custom.val0}', // eslint-disable-line no-template-curly-in-string
            val2: '${self:custom.val1}', // eslint-disable-line no-template-curly-in-string
            val3: `\${file(\${self:custom.nonexistent, "${asyncFileName}"}):str}`,
            val0: `\${file(\${self:custom.nonexistent, '${asyncFileName}'}):str}`,
          };
          const expected = {
            val1: 'my-async-value-1',
            val2: 'my-async-value-1',
            val3: 'my-async-value-1',
            val0: 'my-async-value-1',
          };
          return serverless.variables.populateObject(service.custom).should.become(expected);
        });
        it('should populate any given variable only once regardless of ordering or reference count', () => {
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
          return serverless.variables.populateObject(service.custom).should.become(expected);
        });
        it('should populate async objects with contained variables', () => {
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
          return serverless.variables.populateObject(service.custom).should.become(expected);
        });
        it("should populate variables from filesnames including '@',  e.g scoped npm packages", () => {
          const fileName = `./node_modules/@scoped-org/${asyncFileName}`;
          makeTempFile(fileName, asyncContent);
          service.custom = {
            val0: `\${file(${fileName}):str}`,
          };
          const expected = {
            val0: 'my-async-value-1',
          };
          return serverless.variables.populateObject(service.custom).should.become(expected);
        });
        const selfFileName = 'self.yml';
        const selfContent = `foo: baz
bar: \${self:custom.self.foo}
`;
        it('should populate a "cyclic" reference across an unresolved dependency (issue #4687)', () => {
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
          return serverless.variables.populateObject(service.custom).should.become(expected);
        });
        const emptyFileName = 'empty.js';
        const emptyContent = `'use strict';
module.exports = {
  func: () => ({ value: 'a value' }),
}
`;
        it('should reject population of an attribute not exported from a file', () => {
          makeTempFile(emptyFileName, emptyContent);
          service.custom = {
            val: `\${file(${emptyFileName}):func.notAValue}`,
          };
          return serverless.variables
            .populateObject(service.custom)
            .should.be.rejectedWith(
              serverless.classes.Error,
              'Invalid variable syntax when referencing file'
            );
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
      return serverless.variables
        .populateProperty(property)
        .should.eventually.eql('my stage is dev');
    });

    it('should allow a single-quoted string if overwrite syntax provided', () => {
      // eslint-disable-next-line no-template-curly-in-string
      const property = "my stage is ${opt:stage, 'prod'}";
      serverless.variables.options = {};
      return serverless.variables
        .populateProperty(property)
        .should.eventually.eql('my stage is prod');
    });

    it('should allow a double-quoted string if overwrite syntax provided', () => {
      // eslint-disable-next-line no-template-curly-in-string
      const property = 'my stage is ${opt:stage, "prod"}';
      serverless.variables.options = {};
      return serverless.variables
        .populateProperty(property)
        .should.eventually.eql('my stage is prod');
    });

    it('should call getValueFromSource if no overwrite syntax provided', () => {
      // eslint-disable-next-line no-template-curly-in-string
      const property = 'my stage is ${opt:stage}';
      serverless.variables.options = { stage: 'prod' };
      return serverless.variables
        .populateProperty(property)
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
      const error = new serverless.classes.Error(`Parameter ${param} not found.`, 400);
      const requestStub = sinon
        .stub(awsProvider, 'request')
        .callsFake(() => BbPromise.reject(error));
      const warnIfNotFoundSpy = sinon.spy(serverless.variables, 'warnIfNotFound');

      return serverless.variables
        .populateProperty(property)
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
      const requestStub = sinon
        .stub(awsProvider, 'request')
        .callsFake(() => BbPromise.reject(error));
      return serverless.variables
        .populateProperty(property)
        .should.be.rejectedWith(serverless.classes.Error)
        .then(() => expect(requestStub.callCount).to.equal(1))
        .finally(() => requestStub.restore());
    });

    it('should run recursively if nested variables provided', () => {
      // eslint-disable-next-line no-template-curly-in-string
      const property = 'my stage is ${env:${opt:name}}';
      process.env.TEST_VAR = 'dev';
      serverless.variables.options = { name: 'TEST_VAR' };
      return serverless.variables
        .populateProperty(property)
        .should.eventually.eql('my stage is dev');
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
      return serverless.variables
        .populateProperty(property)
        .should.eventually.eql('my stage is dev');
    });
  });

  describe('#populateVariable()', () => {
    it('should populate string variables as sub string', () => {
      const valueToPopulate = 'dev';
      const matchedString = '${opt:stage}'; // eslint-disable-line no-template-curly-in-string
      // eslint-disable-next-line no-template-curly-in-string
      const property = 'my stage is ${opt:stage}';
      serverless.variables
        .populateVariable(property, matchedString, valueToPopulate)
        .should.eql('my stage is dev');
    });

    it('should populate number variables as sub string', () => {
      const valueToPopulate = 5;
      const matchedString = '${opt:number}'; // eslint-disable-line no-template-curly-in-string
      // eslint-disable-next-line no-template-curly-in-string
      const property = 'your account number is ${opt:number}';
      serverless.variables
        .populateVariable(property, matchedString, valueToPopulate)
        .should.eql('your account number is 5');
    });

    it('should populate non string variables', () => {
      const valueToPopulate = 5;
      const matchedString = '${opt:number}'; // eslint-disable-line no-template-curly-in-string
      const property = '${opt:number}'; // eslint-disable-line no-template-curly-in-string
      return serverless.variables
        .populateVariable(property, matchedString, valueToPopulate)
        .should.equal(5);
    });

    it('should throw error if populating non string or non number variable as sub string', () => {
      const valueToPopulate = {};
      const matchedString = '${opt:object}'; // eslint-disable-line no-template-curly-in-string
      // eslint-disable-next-line no-template-curly-in-string
      const property = 'your account number is ${opt:object}';
      return expect(() =>
        serverless.variables.populateVariable(property, matchedString, valueToPopulate)
      ).to.throw(serverless.classes.Error);
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
      const expected = ['","', "','", "\",', ','\"", "\"',', ','\"", '\',", ","\'', '\'",", ","\''];
      expect(serverless.variables.splitByComma(input)).to.eql(expected);
    });
    it('should deal with a combination of these cases', () => {
      const input = " \t\n'a'\t\n , \n\t\"foo,bar\", opt:foo, \",\", ',', \"',', ','\", foo\n\t ";
      const expected = ["'a'", '"foo,bar"', 'opt:foo', '","', "','", "\"',', ','\"", 'foo'];
      expect(serverless.variables.splitByComma(input)).to.eql(expected);
    });
  });

  describe('#overwrite()', () => {
    beforeEach(() => {
      serverless.service.provider.variableSyntax = '\\${{([ ~:a-zA-Z0-9._@\'",\\-\\/\\(\\)*?]+?)}}';
      serverless.variables.loadVariableSyntax();
      delete serverless.service.provider.variableSyntax;
    });
    it('should overwrite undefined and null values', () => {
      const getValueFromSourceStub = sinon.stub(serverless.variables, 'getValueFromSource');
      getValueFromSourceStub.onCall(0).resolves(undefined);
      getValueFromSourceStub.onCall(1).resolves(null);
      getValueFromSourceStub.onCall(2).resolves('variableValue');
      return serverless.variables
        .overwrite(['opt:stage', 'env:stage', 'self:provider.stage'])
        .should.be.fulfilled.then(valueToPopulate => {
          expect(valueToPopulate).to.equal('variableValue');
          expect(getValueFromSourceStub).to.have.been.calledThrice;
        })
        .finally(() => getValueFromSourceStub.restore());
    });

    it('should overwrite empty object values', () => {
      const getValueFromSourceStub = sinon.stub(serverless.variables, 'getValueFromSource');
      getValueFromSourceStub.onCall(0).resolves({});
      getValueFromSourceStub.onCall(1).resolves('variableValue');
      return serverless.variables
        .overwrite(['opt:stage', 'env:stage'])
        .should.be.fulfilled.then(valueToPopulate => {
          expect(valueToPopulate).to.equal('variableValue');
          expect(getValueFromSourceStub).to.have.been.calledTwice;
        })
        .finally(() => getValueFromSourceStub.restore());
    });

    it('should overwrite values with an array even if it is empty', () => {
      const getValueFromSourceStub = sinon.stub(serverless.variables, 'getValueFromSource');
      getValueFromSourceStub.onCall(0).resolves(undefined);
      getValueFromSourceStub.onCall(1).resolves([]);
      return serverless.variables
        .overwrite(['opt:stage', 'env:stage'])
        .should.be.fulfilled.then(valueToPopulate => {
          expect(valueToPopulate).to.deep.equal([]);
          expect(getValueFromSourceStub).to.have.been.calledTwice;
        })
        .finally(() => getValueFromSourceStub.restore());
    });

    it('should not overwrite 0 values', () => {
      const getValueFromSourceStub = sinon.stub(serverless.variables, 'getValueFromSource');
      getValueFromSourceStub.onCall(0).resolves(0);
      getValueFromSourceStub.onCall(1).resolves('variableValue');
      return serverless.variables
        .overwrite(['opt:stage', 'env:stage'])
        .should.become(0)
        .then()
        .finally(() => getValueFromSourceStub.restore());
    });

    it('should not overwrite false values', () => {
      const getValueFromSourceStub = sinon.stub(serverless.variables, 'getValueFromSource');
      getValueFromSourceStub.onCall(0).resolves(false);
      getValueFromSourceStub.onCall(1).resolves('variableValue');
      return serverless.variables
        .overwrite(['opt:stage', 'env:stage'])
        .should.become(false)
        .then()
        .finally(() => getValueFromSourceStub.restore());
    });

    it('should skip getting values once a value has been found', () => {
      const getValueFromSourceStub = sinon.stub(serverless.variables, 'getValueFromSource');
      getValueFromSourceStub.onCall(0).resolves(undefined);
      getValueFromSourceStub.onCall(1).resolves('variableValue');
      getValueFromSourceStub.onCall(2).resolves('variableValue2');
      return serverless.variables
        .overwrite(['opt:stage', 'env:stage', 'self:provider.stage'])
        .should.be.fulfilled.then(valueToPopulate =>
          expect(valueToPopulate).to.equal('variableValue')
        )
        .finally(() => getValueFromSourceStub.restore());
    });
    it('should properly handle string values containing commas', () => {
      const str = '"foo,bar"';
      const getValueFromSourceStub = sinon
        .stub(serverless.variables, 'getValueFromSource')
        .resolves(undefined);
      return serverless.variables
        .overwrite(['opt:stage', str])
        .should.be.fulfilled.then(() =>
          expect(getValueFromSourceStub.getCall(1).args[0]).to.eql(str)
        )
        .finally(() => getValueFromSourceStub.restore());
    });
  });

  describe('#getValueFromSource()', () => {
    const variableValue = 'variableValue';
    let getValueFromSlsStub;
    let getValueFromEnvStub;
    let getValueFromOptionsStub;
    let getValueFromSelfStub;
    let getValueFromFileStub;
    let getValueFromCfStub;
    let getValueFromS3Stub;
    let getValueFromSsmStub;

    beforeEach(() => {
      getValueFromSlsStub = sinon
        .stub(serverless.variables.variableResolvers[0], 'resolver')
        .resolves('variableValue');
      getValueFromEnvStub = sinon
        .stub(serverless.variables.variableResolvers[1], 'resolver')
        .resolves('variableValue');
      getValueFromOptionsStub = sinon
        .stub(serverless.variables.variableResolvers[2], 'resolver')
        .resolves('variableValue');
      getValueFromSelfStub = sinon
        .stub(serverless.variables.variableResolvers[3], 'resolver')
        .resolves('variableValue');
      getValueFromFileStub = sinon
        .stub(serverless.variables.variableResolvers[4], 'resolver')
        .resolves('variableValue');
      getValueFromCfStub = sinon
        .stub(serverless.variables.variableResolvers[5], 'resolver')
        .resolves('variableValue');
      getValueFromS3Stub = sinon
        .stub(serverless.variables.variableResolvers[6], 'resolver')
        .resolves('variableValue');
      getValueFromSsmStub = sinon
        .stub(serverless.variables.variableResolvers[8], 'resolver')
        .resolves('variableValue');
    });

    afterEach(() => {
      serverless.variables.variableResolvers[0].resolver.restore();
      serverless.variables.variableResolvers[1].resolver.restore();
      serverless.variables.variableResolvers[2].resolver.restore();
      serverless.variables.variableResolvers[3].resolver.restore();
      serverless.variables.variableResolvers[4].resolver.restore();
      serverless.variables.variableResolvers[5].resolver.restore();
      serverless.variables.variableResolvers[6].resolver.restore();
      serverless.variables.variableResolvers[8].resolver.restore();
    });

    it('should call getValueFromSls if referencing sls var', () =>
      serverless.variables
        .getValueFromSource('sls:instanceId')
        .should.be.fulfilled.then(valueToPopulate => {
          expect(valueToPopulate).to.equal(variableValue);
          expect(getValueFromSlsStub).to.have.been.called;
          expect(getValueFromSlsStub).to.have.been.calledWith('sls:instanceId');
        }));

    it('should call getValueFromEnv if referencing env var', () =>
      serverless.variables
        .getValueFromSource('env:TEST_VAR')
        .should.be.fulfilled.then(valueToPopulate => {
          expect(valueToPopulate).to.equal(variableValue);
          expect(getValueFromEnvStub).to.have.been.called;
          expect(getValueFromEnvStub).to.have.been.calledWith('env:TEST_VAR');
        }));

    it('should call getValueFromOptions if referencing an option', () =>
      serverless.variables
        .getValueFromSource('opt:stage')
        .should.be.fulfilled.then(valueToPopulate => {
          expect(valueToPopulate).to.equal(variableValue);
          expect(getValueFromOptionsStub).to.have.been.called;
          expect(getValueFromOptionsStub).to.have.been.calledWith('opt:stage');
        }));

    it('should call getValueFromSelf if referencing from self', () =>
      serverless.variables
        .getValueFromSource('self:provider')
        .should.be.fulfilled.then(valueToPopulate => {
          expect(valueToPopulate).to.equal(variableValue);
          expect(getValueFromSelfStub).to.have.been.called;
          expect(getValueFromSelfStub).to.have.been.calledWith('self:provider');
        }));

    it('should call getValueFromFile if referencing from another file', () =>
      serverless.variables
        .getValueFromSource('file(./config.yml)')
        .should.be.fulfilled.then(valueToPopulate => {
          expect(valueToPopulate).to.equal(variableValue);
          expect(getValueFromFileStub).to.have.been.called;
          expect(getValueFromFileStub).to.have.been.calledWith('file(./config.yml)');
        }));

    it('should call getValueFromCf if referencing CloudFormation Outputs', () =>
      serverless.variables
        .getValueFromSource('cf:test-stack.testOutput')
        .should.be.fulfilled.then(valueToPopulate => {
          expect(valueToPopulate).to.equal(variableValue);
          expect(getValueFromCfStub).to.have.been.called;
          expect(getValueFromCfStub).to.have.been.calledWith('cf:test-stack.testOutput');
        }));

    it('should call getValueFromS3 if referencing variable in S3', () =>
      serverless.variables
        .getValueFromSource('s3:test-bucket/path/to/key')
        .should.be.fulfilled.then(valueToPopulate => {
          expect(valueToPopulate).to.equal(variableValue);
          expect(getValueFromS3Stub).to.have.been.called;
          expect(getValueFromS3Stub).to.have.been.calledWith('s3:test-bucket/path/to/key');
        }));

    it('should call getValueFromSsm if referencing variable in SSM', () =>
      serverless.variables
        .getValueFromSource('ssm:/test/path/to/param')
        .should.be.fulfilled.then(valueToPopulate => {
          expect(valueToPopulate).to.equal(variableValue);
          expect(getValueFromSsmStub).to.have.been.called;
          expect(getValueFromSsmStub).to.have.been.calledWith('ssm:/test/path/to/param');
        }));

    it('should reject invalid sources', () =>
      serverless.variables
        .getValueFromSource('weird:source')
        .should.be.rejectedWith(serverless.classes.Error));

    describe('caching', () => {
      const sources = [
        { functionIndex: 0, function: 'getValueFromSls', variableString: 'sls:instanceId' },
        { functionIndex: 1, function: 'getValueFromEnv', variableString: 'env:NODE_ENV' },
        { functionIndex: 2, function: 'getValueFromOptions', variableString: 'opt:stage' },
        { functionIndex: 3, function: 'getValueFromSelf', variableString: 'self:provider' },
        { functionIndex: 4, function: 'getValueFromFile', variableString: 'file(./config.yml)' },
        {
          functionIndex: 5,
          function: 'getValueFromCf',
          variableString: 'cf:test-stack.testOutput',
        },
        {
          functionIndex: 6,
          function: 'getValueFromS3',
          variableString: 's3:test-bucket/path/to/ke',
        },
        {
          functionIndex: 8,
          function: 'getValueFromSsm',
          variableString: 'ssm:/test/path/to/param',
        },
      ];
      sources.forEach(source => {
        it(`should only call ${source.function} once, returning the cached value otherwise`, () => {
          const getValueFunctionStub =
            serverless.variables.variableResolvers[source.functionIndex].resolver;
          return BbPromise.all([
            serverless.variables
              .getValueFromSource(source.variableString)
              .should.become(variableValue),
            BbPromise.delay(100).then(() =>
              serverless.variables
                .getValueFromSource(source.variableString)
                .should.become(variableValue)
            ),
          ]).then(() => {
            expect(getValueFunctionStub).to.have.been.calledOnce;
            expect(getValueFunctionStub).to.have.been.calledWith(source.variableString);
          });
        });
      });
    });
  });

  describe('#getValueFromSls()', () => {
    it('should get variable from Serverless Framework provided variables', () => {
      serverless.instanceId = 12345678;
      return serverless.variables.getValueFromSls('sls:instanceId').then(valueToPopulate => {
        expect(valueToPopulate).to.equal(12345678);
      });
    });
  });

  describe('#getValueFromEnv()', () => {
    it('should get variable from environment variables', () => {
      process.env.TEST_VAR = 'someValue';
      return serverless.variables.getValueFromEnv('env:TEST_VAR').should.become('someValue');
    });

    it('should allow top-level references to the environment variables hive', () => {
      process.env.TEST_VAR = 'someValue';
      return serverless.variables.getValueFromEnv('env:').then(valueToPopulate => {
        expect(valueToPopulate.TEST_VAR).to.be.equal('someValue');
      });
    });
  });

  describe('#getValueFromOptions()', () => {
    it('should get variable from options', () => {
      serverless.variables.options = { stage: 'prod' };
      return serverless.variables.getValueFromOptions('opt:stage').should.become('prod');
    });

    it('should allow top-level references to the options hive', () => {
      serverless.variables.options = { stage: 'prod' };
      return serverless.variables
        .getValueFromOptions('opt:')
        .should.become(serverless.variables.options);
    });
  });

  describe('#getValueFromSelf()', () => {
    beforeEach(() => {
      serverless.service.provider.variableSyntax = '\\${{([ ~:a-zA-Z0-9._@\'",\\-\\/\\(\\)*?]+?)}}';
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
      return serverless.variables
        .getValueFromSelf('self:service.name')
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
      return serverless.variables
        .getValueFromSelf('self:service.awsKmsKeyArn')
        .should.become(keyArn);
    });
    it('should handle self-references to the root of the serverless.yml file', () => {
      serverless.variables.service = {
        service: 'testService',
        provider: 'testProvider',
        defaults: serverless.service.defaults,
      };
      return serverless.variables
        .getValueFromSelf('self:')
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
      return serverless.variables
        .getValueFromFile('file(~/somedir/config.yml)')
        .should.be.fulfilled.then(valueToPopulate => {
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
      const tmpDirPath = getTmpDirPath();
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
      return serverless.variables
        .getValueFromFile('file(./config.yml)')
        .should.eventually.eql(configYml);
    });

    it('should get undefined if non existing file and the second argument is true', () => {
      const tmpDirPath = getTmpDirPath();
      serverless.config.update({ servicePath: tmpDirPath });
      const realpathSync = sinon.spy(fse, 'realpathSync');
      const existsSync = sinon.spy(fse, 'existsSync');
      return serverless.variables
        .getValueFromFile('file(./non-existing.yml)')
        .should.be.fulfilled.then(valueToPopulate => {
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
      const tmpDirPath = getTmpDirPath();
      SUtils.writeFileSync(path.join(tmpDirPath, 'someFile'), 'hello world');
      serverless.config.update({ servicePath: tmpDirPath });
      return serverless.variables.getValueFromFile('file(./someFile)').should.become('hello world');
    });

    it('should populate symlinks', function() {
      const SUtils = new Utils();
      const tmpDirPath = getTmpDirPath();
      const realFilePath = path.join(tmpDirPath, 'someFile');
      const symlinkPath = path.join(tmpDirPath, 'refSomeFile');
      SUtils.writeFileSync(realFilePath, 'hello world');
      try {
        fse.ensureSymlinkSync(realFilePath, symlinkPath);
      } catch (error) {
        skipOnDisabledSymlinksInWindows(error, this);
        throw error;
      }
      serverless.config.update({ servicePath: tmpDirPath });
      return serverless.variables
        .getValueFromFile('file(./refSomeFile)')
        .should.become('hello world')
        .then()
        .finally(() => {
          fse.removeSync(realFilePath);
          fse.removeSync(symlinkPath);
        });
    });

    it('should trim trailing whitespace and new line character', () => {
      const SUtils = new Utils();
      const tmpDirPath = getTmpDirPath();
      SUtils.writeFileSync(path.join(tmpDirPath, 'someFile'), 'hello world \n');
      serverless.config.update({ servicePath: tmpDirPath });
      return serverless.variables.getValueFromFile('file(./someFile)').should.become('hello world');
    });

    it('should populate from another file when variable is of any type', () => {
      const SUtils = new Utils();
      const tmpDirPath = getTmpDirPath();
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
      return serverless.variables
        .getValueFromFile('file(./config.yml):test2.sub')
        .should.become(configYml.test2.sub);
    });

    it('should populate from a javascript file', () => {
      const SUtils = new Utils();
      const tmpDirPath = getTmpDirPath();
      const jsData = 'module.exports.hello=function(){return "hello world";};';
      SUtils.writeFileSync(path.join(tmpDirPath, 'hello.js'), jsData);
      serverless.config.update({ servicePath: tmpDirPath });
      return serverless.variables
        .getValueFromFile('file(./hello.js):hello')
        .should.become('hello world');
    });

    it('should populate an entire variable exported by a javascript file', () => {
      const SUtils = new Utils();
      const tmpDirPath = getTmpDirPath();
      const jsData = 'module.exports=function(){return { hello: "hello world" };};';
      SUtils.writeFileSync(path.join(tmpDirPath, 'hello.js'), jsData);
      serverless.config.update({ servicePath: tmpDirPath });
      return serverless.variables
        .getValueFromFile('file(./hello.js)')
        .should.become({ hello: 'hello world' });
    });

    it('should throw if property exported by a javascript file is not a function', () => {
      const SUtils = new Utils();
      const tmpDirPath = getTmpDirPath();
      const jsData = 'module.exports={ hello: "hello world" };';
      SUtils.writeFileSync(path.join(tmpDirPath, 'hello.js'), jsData);
      serverless.config.update({ servicePath: tmpDirPath });
      return serverless.variables
        .getValueFromFile('file(./hello.js)')
        .should.be.rejectedWith(serverless.classes.Error);
    });

    it('should populate deep object from a javascript file', () => {
      const SUtils = new Utils();
      const tmpDirPath = getTmpDirPath();
      const jsData = `module.exports.hello=function(){
        return {one:{two:{three: 'hello world'}}}
      };`;
      SUtils.writeFileSync(path.join(tmpDirPath, 'hello.js'), jsData);
      serverless.config.update({ servicePath: tmpDirPath });
      serverless.variables.loadVariableSyntax();
      return serverless.variables
        .getValueFromFile('file(./hello.js):hello.one.two.three')
        .should.become('hello world');
    });

    it('should preserve the exported function context when executing', () => {
      const SUtils = new Utils();
      const tmpDirPath = getTmpDirPath();
      const jsData = `
      module.exports.one = {two: {three: 'hello world'}}
      module.exports.hello=function(){ return this; };`;
      SUtils.writeFileSync(path.join(tmpDirPath, 'hello.js'), jsData);
      serverless.config.update({ servicePath: tmpDirPath });
      serverless.variables.loadVariableSyntax();
      return serverless.variables
        .getValueFromFile('file(./hello.js):hello.one.two.three')
        .should.become('hello world');
    });

    it('should file variable not using ":" syntax', () => {
      const SUtils = new Utils();
      const tmpDirPath = getTmpDirPath();
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
      return serverless.variables
        .getValueFromFile('file(./config.yml).testObj.sub')
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
        Stacks: [
          {
            Outputs: [
              {
                OutputKey: 'MockExport',
                OutputValue: 'MockValue',
              },
            ],
          },
        ],
      };
      const cfStub = sinon
        .stub(serverless.getProvider('aws'), 'request')
        .callsFake(() => BbPromise.resolve(awsResponseMock));
      return serverless.variables
        .getValueFromCf('cf:some-stack.MockExport')
        .should.become('MockValue')
        .then(() => {
          expect(cfStub).to.have.been.calledOnce;
          expect(cfStub).to.have.been.calledWithExactly(
            'CloudFormation',
            'describeStacks',
            { StackName: 'some-stack' },
            { useCache: true }
          );
        })
        .finally(() => cfStub.restore());
    });

    it('should get variable from CloudFormation of different region', () => {
      const options = {
        stage: 'prod',
        region: 'us-west-2',
      };
      const awsProvider = new AwsProvider(serverless, options);
      serverless.setProvider('aws', awsProvider);
      serverless.variables.options = options;
      const awsResponseMock = {
        Stacks: [
          {
            Outputs: [
              {
                OutputKey: 'MockExport',
                OutputValue: 'MockValue',
              },
            ],
          },
        ],
      };
      const cfStub = sinon
        .stub(serverless.getProvider('aws'), 'request')
        .callsFake(() => BbPromise.resolve(awsResponseMock));
      return serverless.variables
        .getValueFromCf('cf.us-east-1:some-stack.MockExport')
        .should.become('MockValue')
        .then(() => {
          expect(cfStub).to.have.been.calledOnce;
          expect(cfStub).to.have.been.calledWithExactly(
            'CloudFormation',
            'describeStacks',
            { StackName: 'some-stack' },
            { region: 'us-east-1', useCache: true }
          );
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
        Stacks: [
          {
            Outputs: [
              {
                OutputKey: 'MockExport',
                OutputValue: 'MockValue',
              },
            ],
          },
        ],
      };
      const cfStub = sinon
        .stub(serverless.getProvider('aws'), 'request')
        .callsFake(() => BbPromise.resolve(awsResponseMock));
      return serverless.variables
        .getValueFromCf('cf:some-stack.DoestNotExist')
        .should.be.rejectedWith(
          serverless.classes.Error,
          /to request a non exported variable from CloudFormation/
        )
        .then(() => {
          expect(cfStub).to.have.been.calledOnce;
          expect(cfStub).to.have.been.calledWithExactly(
            'CloudFormation',
            'describeStacks',
            { StackName: 'some-stack' },
            { useCache: true }
          );
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
      const s3Stub = sinon
        .stub(awsProvider, 'request')
        .callsFake(() => BbPromise.resolve(awsResponseMock));
      return serverless.variables
        .getValueFromS3('s3:some.bucket/path/to/key')
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
            { useCache: true }
          );
        })
        .finally(() => s3Stub.restore());
    });

    it('should throw error if error getting value from S3', () => {
      const error = new Error('The specified bucket is not valid');
      const requestStub = sinon
        .stub(awsProvider, 'request')
        .callsFake(() => BbPromise.reject(error));
      return expect(serverless.variables.getValueFromS3('s3:some.bucket/path/to/key'))
        .to.be.rejectedWith(
          serverless.classes.Error,
          'Error getting value for s3:some.bucket/path/to/key. The specified bucket is not valid'
        )
        .then()
        .finally(() => requestStub.restore());
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
      const ssmStub = sinon
        .stub(awsProvider, 'request')
        .callsFake(() => BbPromise.resolve(awsResponseMock));
      return serverless.variables
        .getValueFromSsm(`ssm:${param}`)
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
            { useCache: true }
          );
        })
        .finally(() => ssmStub.restore());
    });
    it('should get variable from Ssm using path-style param', () => {
      const ssmStub = sinon
        .stub(awsProvider, 'request')
        .callsFake(() => BbPromise.resolve(awsResponseMock));
      return serverless.variables
        .getValueFromSsm(`ssm:${param}`)
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
            { useCache: true }
          );
        })
        .finally(() => ssmStub.restore());
    });
    it('should get encrypted variable from Ssm using extended syntax', () => {
      const ssmStub = sinon
        .stub(awsProvider, 'request')
        .callsFake(() => BbPromise.resolve(awsResponseMock));
      return serverless.variables
        .getValueFromSsm(`ssm:${param}~true`)
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
            { useCache: true }
          );
        })
        .finally(() => ssmStub.restore());
    });
    it('should get unencrypted variable from Ssm using extended syntax', () => {
      const ssmStub = sinon
        .stub(awsProvider, 'request')
        .callsFake(() => BbPromise.resolve(awsResponseMock));
      return serverless.variables
        .getValueFromSsm(`ssm:${param}~false`)
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
            { useCache: true }
          );
        })
        .finally(() => ssmStub.restore());
    });
    it('should ignore bad values for extended syntax', () => {
      const ssmStub = sinon
        .stub(awsProvider, 'request')
        .callsFake(() => BbPromise.resolve(awsResponseMock));
      return serverless.variables
        .getValueFromSsm(`ssm:${param}~badvalue`)
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
            { useCache: true }
          );
        })
        .finally(() => ssmStub.restore());
    });
    it('should get split StringList variable from Ssm using extended syntax', () => {
      const stringListValue = 'MockValue1,MockValue2';
      const parsedValue = ['MockValue1', 'MockValue2'];
      const stringListResponseMock = {
        Parameter: {
          Value: stringListValue,
          Type: 'StringList',
        },
      };
      const ssmStub = sinon
        .stub(awsProvider, 'request')
        .callsFake(() => BbPromise.resolve(stringListResponseMock));
      return serverless.variables
        .getValueFromSsm(`ssm:${param}~split`)
        .should.become(parsedValue)
        .then(() => {
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
        })
        .finally(() => ssmStub.restore());
    });
    it('should get unsplit StringList variable from Ssm by default', () => {
      const stringListValue = 'MockValue1,MockValue2';
      const stringListResponseMock = {
        Parameter: {
          Value: stringListValue,
          Type: 'StringList',
        },
      };
      const ssmStub = sinon
        .stub(awsProvider, 'request')
        .callsFake(() => BbPromise.resolve(stringListResponseMock));
      return serverless.variables
        .getValueFromSsm(`ssm:${param}`)
        .should.become(stringListValue)
        .then(() => {
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
        })
        .finally(() => ssmStub.restore());
    });
    it('should warn when attempting to split a non-StringList Ssm variable', () => {
      const logWarningSpy = sinon.spy(slsError, 'logWarning');
      const consoleLogStub = sinon.stub(console, 'log').returns();
      const ProxyQuiredVariables = proxyquire('./Variables.js', { './Error': logWarningSpy });
      const varProxy = new ProxyQuiredVariables(serverless);
      const stringListResponseMock = {
        Parameter: {
          Value: value,
          Type: 'String',
        },
      };
      const ssmStub = sinon
        .stub(awsProvider, 'request')
        .callsFake(() => BbPromise.resolve(stringListResponseMock));
      return varProxy
        .getValueFromSsm(`ssm:${param}~split`)
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
            { useCache: true }
          );
          expect(logWarningSpy).to.have.been.calledWithExactly(
            `Cannot split SSM parameter '${param}' of type 'String'. Must be 'StringList'.`
          );
        })
        .finally(() => {
          ssmStub.restore();
          logWarningSpy.restore();
          consoleLogStub.restore();
        });
    });
    describe('Referencing to AWS SecretsManager', () => {
      it('should NOT parse value as json if not referencing to AWS SecretsManager', () => {
        const secretParam = '/path/to/foo-bar';
        const jsonLikeText = '{"str":"abc","num":123}';
        const awsResponse = {
          Parameter: {
            Value: jsonLikeText,
          },
        };
        const ssmStub = sinon
          .stub(awsProvider, 'request')
          .callsFake(() => BbPromise.resolve(awsResponse));
        return serverless.variables
          .getValueFromSsm(`ssm:${secretParam}~true`)
          .should.become(jsonLikeText)
          .then()
          .finally(() => ssmStub.restore());
      });
      it('should parse value as json if returned value is json-like', () => {
        const secretParam = '/aws/reference/secretsmanager/foo-bar';
        const jsonLikeText = '{"str":"abc","num":123}';
        const json = {
          str: 'abc',
          num: 123,
        };
        const awsResponse = {
          Parameter: {
            Value: jsonLikeText,
          },
        };
        const ssmStub = sinon
          .stub(awsProvider, 'request')
          .callsFake(() => BbPromise.resolve(awsResponse));
        return serverless.variables
          .getValueFromSsm(`ssm:${secretParam}~true`)
          .should.become(json)
          .then()
          .finally(() => ssmStub.restore());
      });
      it('should get value as text if returned value is NOT json-like', () => {
        const secretParam = '/aws/reference/secretsmanager/foo-bar';
        const plainText = 'I am plain text';
        const awsResponse = {
          Parameter: {
            Value: plainText,
          },
        };
        const ssmStub = sinon
          .stub(awsProvider, 'request')
          .callsFake(() => BbPromise.resolve(awsResponse));
        return serverless.variables
          .getValueFromSsm(`ssm:${secretParam}~true`)
          .should.become(plainText)
          .then()
          .finally(() => ssmStub.restore());
      });
    });
    it('should return undefined if SSM parameter does not exist', () => {
      const error = new serverless.classes.Error(`Parameter ${param} not found.`, 400);
      const requestStub = sinon
        .stub(awsProvider, 'request')
        .callsFake(() => BbPromise.reject(error));
      return serverless.variables
        .getValueFromSsm(`ssm:${param}`)
        .should.become(undefined)
        .then()
        .finally(() => requestStub.restore());
    });

    it('should reject if SSM request returns unexpected error', () => {
      const error = new Error(
        'User: <arn> is not authorized to perform: ssm:GetParameter on resource: <arn>'
      );
      const requestStub = sinon
        .stub(awsProvider, 'request')
        .callsFake(() => BbPromise.reject(error));
      return serverless.variables
        .getValueFromSsm(`ssm:${param}`)
        .should.be.rejected.then()
        .finally(() => requestStub.restore());
    });
  });

  describe('#getValueStrToBool()', () => {
    const errMessage = 'Unexpected strToBool input; expected either "true", "false", "0", or "1".';
    beforeEach(() => {
      serverless.variables.service = {
        service: 'testService',
        provider: serverless.service.provider,
      };
      serverless.variables.loadVariableSyntax();
    });
    it('regex for "true" input', () => {
      expect(serverless.variables.strToBoolRefSyntax.test('${strToBool(true)}')).to.equal(true);
    });
    it('regex for "false" input', () => {
      expect(serverless.variables.strToBoolRefSyntax.test('${strToBool(false)}')).to.equal(true);
    });
    it('regex for "0" input', () => {
      expect(serverless.variables.strToBoolRefSyntax.test('${strToBool(0)}')).to.equal(true);
    });
    it('regex for "1" input', () => {
      expect(serverless.variables.strToBoolRefSyntax.test('${strToBool(1)}')).to.equal(true);
    });
    it('regex for "null" input', () => {
      expect(serverless.variables.strToBoolRefSyntax.test('${strToBool(null)}')).to.equal(true);
    });
    it('regex for truthy input', () => {
      expect(serverless.variables.strToBoolRefSyntax.test('${strToBool(anything)}')).to.equal(true);
    });
    it('regex for empty input', () => {
      expect(serverless.variables.strToBoolRefSyntax.test('${strToBool()}')).to.equal(false);
    });
    it('true (string) should return true (boolean)', () => {
      return serverless.variables.getValueStrToBool('strToBool(true)').should.become(true);
    });
    it('false (string) should return false (boolean)', () => {
      return serverless.variables.getValueStrToBool('strToBool(false)').should.become(false);
    });
    it('1 (string) should return true (boolean)', () => {
      return serverless.variables.getValueStrToBool('strToBool(1)').should.become(true);
    });
    it('0 (string) should return false (boolean)', () => {
      return serverless.variables.getValueStrToBool('strToBool(0)').should.become(false);
    });
    it('truthy string should throw an error', () => {
      return serverless.variables
        .getValueStrToBool('strToBool(anything)')
        .catch(err => err.message)
        .should.become(errMessage);
    });
    it('null (string) should throw an error', () => {
      return serverless.variables
        .getValueStrToBool('strToBool(null)')
        .catch(err => err.message)
        .should.become(errMessage);
    });
    it('strToBool(true) as an input to strToBool', () => {
      const input = serverless.variables.getValueStrToBool('strToBool(true)');
      return serverless.variables.getValueStrToBool(input).should.become(true);
    });
    it('strToBool(false) as an input to strToBool', () => {
      const input = serverless.variables.getValueStrToBool('strToBool(false)');
      return serverless.variables.getValueStrToBool(input).should.become(true);
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
      return serverless.variables
        .getDeeperValue(['custom', 'subProperty', 'deep'], valueToPopulateMock)
        .should.become('deepValue');
    });
    it('should not throw error if referencing invalid properties', () => {
      const valueToPopulateMock = {
        service: 'testService',
        custom: {
          subProperty: 'hello',
        },
      };
      serverless.variables.loadVariableSyntax();
      return serverless.variables
        .getDeeperValue(['custom', 'subProperty', 'deep', 'deeper'], valueToPopulateMock)
        .should.eventually.deep.equal({});
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
      return serverless.variables
        .getDeeperValue(['custom', 'subProperty', 'deep'], serverless.variables.service)
        .should.become('${deep:0}');
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
      return serverless.variables
        .getDeeperValue(['custom', 'anotherVar', 'veryDeep'], serverless.variables.service)
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
    describe('when variable string does not match any of syntax', () => {
      // These situation happen when deep variable population fails
      it('should do nothing if variable has null value.', () => {
        varProxy.warnIfNotFound('', null);
        expect(logWarningSpy).to.not.have.been.calledOnce;
      });
      it('should do nothing if variable has undefined value.', () => {
        varProxy.warnIfNotFound('', undefined);
        expect(logWarningSpy).to.not.have.been.calledOnce;
      });
      it('should do nothing if variable has empty object value.', () => {
        varProxy.warnIfNotFound('', {});
        expect(logWarningSpy).to.not.have.been.calledOnce;
      });
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
    it('should not log if variable has empty array value.', () => {
      varProxy.warnIfNotFound('self:service', []);
      expect(logWarningSpy).to.not.have.been.called;
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
