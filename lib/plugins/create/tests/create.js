'use strict';

const expect = require('chai').expect;
const sinon = require('sinon');
const path = require('path');
const os = require('os');
const Create = require('../create');
const Serverless = require('../../../Serverless');

describe('Create', () => {
  let create;

  before(() => {
    const serverless = new Serverless();
    const options = {};
    create = new Create(serverless, options);
    create.serverless.cli = new serverless.classes.CLI();
  });

  describe('#constructor()', () => {
    it('should have commands', () => expect(create.commands).to.be.not.empty);

    it('should have hooks', () => expect(create.hooks).to.be.not.empty);
  });

  describe('#validate()', () => {
    it('it should resolve if name is valid and all required options provided', () => {
      create.options.name = 'valid-service-name';
      create.options.provider = 'aws';
      return create.validate();
    });

    it('it should throw error if name is invalid', () => {
      create.options.name = 'invalid_service_name';
      create.options.provider = 'aws';
      expect(() => create.validate()).to.throw(Error);
    });

    it('it should throw error if provider is invalid', () => {
      create.options.name = 'valid-service-name';
      create.options.provider = 'random';
      expect(() => create.validate()).to.throw(Error);
    });

    it('should set servicePath based on service name', () => {
      create.options.name = 'valid-service-name';
      create.options.provider = 'aws';
      return create.validate().then(() => expect(create.serverless.config.servicePath)
        .to.be.equal(path.join(process.cwd(), create.options.name)));
    });
  });

  describe('#scaffold()', () => {
    let tmpDir;
    before(() => {
      create.options.name = 'new-service';
      create.options.provider = 'aws';
      tmpDir = path.join(os.tmpdir(), (new Date).getTime().toString(), create.options.name);
      create.serverless.config.servicePath = tmpDir;
    });

    it('should generate serverless.yaml and set correct service and provider name', () => create
      .scaffold({ service: '' })
      .then(() => {
        expect(create.serverless.utils
          .fileExistsSync(path.join(tmpDir, 'serverless.yaml'))).to.be.equal(true);
        create.serverless.yamlParser
        .parse(path.join(tmpDir, 'serverless.yaml')).then((serverlessYaml) => {
          expect(serverlessYaml.service).to.be.equal('new-service');
          expect(serverlessYaml.provider).to.be.equal('aws');
        });
      })
    );

    it('should generate serverless.env.yaml', () => create.scaffold({ service: '' })
      .then(() => {
        expect(create.serverless.utils.fileExistsSync(path.join(tmpDir, 'handler.js')))
          .to.be.equal(true);
      })
    );

    it('should generate handler.js', () => create.scaffold({ service: '' })
      .then(() => {
        expect(create.serverless.utils.fileExistsSync(path.join(tmpDir, 'handler.js')))
          .to.be.equal(true);
      })
    );
  });

  describe('#finish()', () => {
    it('should log 4 messages', () => {
      const logStub = sinon.stub(create.serverless.cli, 'log');
      create.finish();
      expect(logStub.callCount).to.be.equal(4);
      create.serverless.cli.log.restore();
    });
  });
});
