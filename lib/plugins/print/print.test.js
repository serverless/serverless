'use strict';

const expect = require('chai').expect;
const sinon = require('sinon');
const proxyquire = require('proxyquire');
const Serverless = require('../../Serverless');
const CLI = require('../../classes/CLI');
const YAML = require('js-yaml');


describe('Print', () => {
  let print;
  let serverless;
  let getServerlessConfigFileStub;

  beforeEach(() => {
    getServerlessConfigFileStub = sinon.stub();
    const PrintPlugin = proxyquire('./print.js', {
      '../../utils/getServerlessConfigFile': getServerlessConfigFileStub,
    });
    serverless = new Serverless();
    serverless.variables.options = {
      stage: 'dev',
      region: 'us-east-1',
    };
    serverless.cli = new CLI(serverless);
    print = new PrintPlugin(serverless);
    print.serverless.cli = {
      consoleLog: sinon.spy(),
    };
  });

  afterEach(() => {
    serverless.service.provider.variableSyntax = '\\${([ ~:a-zA-Z0-9._\'",\\-\\/\\(\\)]+?)}';
  });

  it('should print standard config', () => {
    const conf = {
      service: 'my-service',
      provider: {
        name: 'aws',
      },
    };
    getServerlessConfigFileStub.resolves(conf);

    return print.print().then(() => {
      const message = print.serverless.cli.consoleLog.args.join();

      expect(getServerlessConfigFileStub.calledOnce).to.equal(true);
      expect(print.serverless.cli.consoleLog.called).to.be.equal(true);
      expect(YAML.load(message)).to.eql(conf);
    });
  });

  it('should print special service object and provider string configs', () => {
    const conf = {
      service: {
        name: 'my-service',
      },
      provider: 'aws',
    };
    getServerlessConfigFileStub.resolves(conf);

    return print.print().then(() => {
      const message = print.serverless.cli.consoleLog.args.join();

      expect(getServerlessConfigFileStub.calledOnce).to.equal(true);
      expect(print.serverless.cli.consoleLog.called).to.be.equal(true);
      expect(YAML.load(message)).to.eql(conf);
    });
  });

  it('should resolve command line variables', () => {
    const conf = {
      service: 'my-service',
      provider: {
        name: 'aws',
        stage: '${opt:stage}',
      },
    };
    getServerlessConfigFileStub.resolves(conf);

    serverless.processedInput = {
      commands: ['print'],
      options: { stage: 'dev', region: undefined },
    };

    const expected = {
      service: 'my-service',
      provider: {
        name: 'aws',
        stage: 'dev',
      },
    };

    return print.print().then(() => {
      const message = print.serverless.cli.consoleLog.args.join();

      expect(getServerlessConfigFileStub.calledOnce).to.equal(true);
      expect(print.serverless.cli.consoleLog.called).to.be.equal(true);
      expect(YAML.load(message)).to.eql(expected);
    });
  });

  it('should resolve using custom variable syntax', () => {
    const conf = {
      service: 'my-service',
      provider: {
        name: 'aws',
        stage: '${{opt:stage}}',
        variableSyntax: "\\${{([ ~:a-zA-Z0-9._\\'\",\\-\\/\\(\\)]+?)}}",
      },
    };
    serverless.service.provider.variableSyntax = "\\${{([ ~:a-zA-Z0-9._\\'\",\\-\\/\\(\\)]+?)}}";
    getServerlessConfigFileStub.resolves(conf);

    serverless.processedInput = {
      commands: ['print'],
      options: { stage: 'dev', region: undefined },
    };

    const expected = {
      service: 'my-service',
      provider: {
        name: 'aws',
        stage: 'dev',
        variableSyntax: "\\${{([ ~:a-zA-Z0-9._\\'\",\\-\\/\\(\\)]+?)}}",
      },
    };

    return print.print().then(() => {
      const message = print.serverless.cli.consoleLog.args.join();

      expect(getServerlessConfigFileStub.calledOnce).to.equal(true);
      expect(print.serverless.cli.consoleLog.called).to.be.equal(true);
      expect(YAML.load(message)).to.eql(expected);
    });
  });

  it('should resolve custom variables', () => {
    const conf = {
      service: 'my-service',
      custom: { region: 'us-east-1' },
      provider: {
        name: 'aws',
        stage: '${opt:stage}',
        region: '${self:custom.region}',
      },
    };
    getServerlessConfigFileStub.resolves(conf);

    serverless.processedInput = {
      commands: ['print'],
      options: { stage: 'dev', region: undefined },
    };
    serverless.service.custom = { region: 'us-east-1' };

    const expected = {
      service: 'my-service',
      custom: {
        region: 'us-east-1',
      },
      provider: {
        name: 'aws',
        stage: 'dev',
        region: 'us-east-1',
      },
    };

    return print.print().then(() => {
      const message = print.serverless.cli.consoleLog.args.join();

      expect(getServerlessConfigFileStub.calledOnce).to.equal(true);
      expect(print.serverless.cli.consoleLog.called).to.be.equal(true);
      expect(YAML.load(message)).to.eql(expected);
    });
  });

  it('should resolve self references', () => {
    const conf = {
      custom: {
        me: '${self:}',
      },
      provider: {},
    };
    getServerlessConfigFileStub.resolves(conf);

    serverless.processedInput = {
      commands: ['print'],
      options: {},
    };

    const expected = {
      custom: {
        me: {
          $ref: '$',
        },
      },
      provider: {},
    };

    return print.print().then(() => {
      const message = print.serverless.cli.consoleLog.args.join();

      expect(getServerlessConfigFileStub.calledOnce).to.equal(true);
      expect(print.serverless.cli.consoleLog.called).to.be.equal(true);
      expect(YAML.load(message)).to.eql(expected);
    });
  });
});
