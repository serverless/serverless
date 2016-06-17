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
    serverless.init();
    const options = {};
    create = new Create(serverless, options);
  });

  describe('#constructor()', () => {
    it('should have commands', () => expect(create.commands).to.be.not.empty);

    it('should have hooks', () => expect(create.hooks).to.be.not.empty);
  });

  describe('#prompt()', () => {
    beforeEach(() => {
      create.options.name = 'valid-service-name';
      create.options.provider = 'aws';
    });

    it('should NOT generate greeting if not interactive', () => {
      const greetingStub = sinon.stub(create.serverless.cli, 'asciiGreeting');
      return create.prompt().then(() => {
        expect(greetingStub.notCalled).to.be.equal(true);
        create.serverless.cli.asciiGreeting.restore();
      });
    });

    it('should generate greeting if interactive', () => {
      create.serverless.config.interactive = true;
      const greetingStub = sinon.stub(create.serverless.cli, 'asciiGreeting');
      return create.prompt().then(() => {
        expect(greetingStub.calledOnce).to.be.equal(true);
        create.serverless.cli.asciiGreeting.restore();
        create.serverless.config.interactive = false;
      });
    });
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

  describe('#parse()', () => {
    it('it should parse template files', () => create.parse()
      .spread((yaml, json) => {
        expect(Object.keys(yaml).length !== 0).to.be.equal(true);
        expect(Object.keys(json).length !== 0).to.be.equal(true);
      })
    );
  });

  describe('#scaffold()', () => {
    let fakeYaml;
    let fakeJson;
    let tmpDir;
    before(() => {
      create.options.name = 'new-service';
      create.options.provider = 'aws';
      fakeYaml = { service: '' };
      fakeJson = { name: '' };
      tmpDir = path.join(os.tmpdir(), (new Date).getTime().toString(), create.options.name);
      create.serverless.config.servicePath = tmpDir;
    });

    it('should generate handler.js', () => create.scaffold(fakeYaml, fakeJson)
      .then(() => {
        expect(create.serverless.utils.fileExistsSync(path.join(tmpDir, 'handler.js')))
          .to.be.equal(true);
      })
    );

    it('should generate serverless.yaml and set correct service and provider name', () => create
      .scaffold(fakeYaml, fakeJson).then(() => {
        expect(create.serverless.utils
          .fileExistsSync(path.join(tmpDir, 'serverless.yaml'))).to.be.equal(true);
        create.serverless.yamlParser
          .parse(path.join(tmpDir, 'serverless.yaml')).then((serverlessYaml) => {
            expect(serverlessYaml.service).to.be.equal('new-service');
          expect(serverlessYaml.provider).to.be.equal('aws');
          });
      })
    );

    it('should generate package.json and set correct package name', () => create
      .scaffold(fakeYaml, fakeJson).then(() => {
        expect(create.serverless.utils
          .fileExistsSync(path.join(tmpDir, 'package.json'))).to.be.equal(true);
        const packageJson = create.serverless.utils
          .readFileSync(path.join(tmpDir, 'package.json'));
        expect(packageJson.name).to.be.equal('new-service');
      })
    );

    it('should generate serverless.env.yaml and set correct stage and region', () => create
      .scaffold(fakeYaml, fakeJson).then(() => {
        expect(create.serverless.utils
          .fileExistsSync(path.join(tmpDir, 'serverless.env.yaml'))).to.be.equal(true);
        create.serverless.yamlParser
          .parse(path.join(tmpDir, 'serverless.env.yaml')).then((serverlessEnvYaml) => {
            expect(typeof serverlessEnvYaml.stages.dev.regions['us-east-1']).to.be.equal('object');
          });
      })
    );
  });

  describe('#finish()', () => {
    it('should log 5 messages', () => {
      const logStub = sinon.stub(create.serverless.cli, 'log');
      create.finish();
      expect(logStub.callCount).to.be.equal(5);
      create.serverless.cli.log.restore();
    });
  });
});
