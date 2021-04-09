'use strict';

const os = require('os');
const chai = require('chai');
const sinon = require('sinon');
const Serverless = require('../../../../lib/Serverless');
const CLI = require('../../../../lib/classes/CLI');
const PrintPlugin = require('../../../../lib/plugins/print.js');
const yaml = require('js-yaml');

const runServerless = require('../../../utils/run-serverless');

chai.use(require('chai-as-promised'));

const expect = chai.expect;

describe('Print', () => {
  let print;
  let serverless;

  beforeEach(() => {
    serverless = new Serverless();
    serverless.variables.options = {
      stage: 'dev',
      region: 'us-east-1',
    };
    serverless.cli = new CLI(serverless);
    serverless.processedInput = { options: {} };
    print = new PrintPlugin(serverless);
    print.serverless.cli = {
      consoleLog: sinon.spy(),
    };
  });

  it('should print standard config', () => {
    serverless.configurationInput = {
      service: 'my-service',
      provider: {
        name: 'aws',
      },
    };

    return print.print().then(() => {
      const message = print.serverless.cli.consoleLog.args.join();

      expect(print.serverless.cli.consoleLog.called).to.be.equal(true);
      expect(yaml.load(message)).to.eql(serverless.configurationInput);
    });
  });

  it('should print standard config in JSON', () => {
    serverless.configurationInput = {
      service: 'my-service',
      provider: {
        name: 'aws',
      },
    };

    print.options = { format: 'json' };
    return print.print().then(() => {
      const message = print.serverless.cli.consoleLog.args.join();

      expect(print.serverless.cli.consoleLog.called).to.be.equal(true);
      expect(JSON.parse(message)).to.eql(serverless.configurationInput);
    });
  });

  it('should apply paths to standard config in JSON', () => {
    serverless.configurationInput = {
      service: 'my-service',
      provider: {
        name: 'aws',
      },
    };

    print.options = { format: 'json', path: 'service' };
    return print.print().then(() => {
      const message = print.serverless.cli.consoleLog.args.join();

      expect(print.serverless.cli.consoleLog.called).to.be.equal(true);
      expect(JSON.parse(message)).to.eql(serverless.configurationInput.service);
    });
  });

  it('should apply paths to standard config in text', () => {
    serverless.configurationInput = {
      service: 'my-service',
      provider: {
        name: 'aws',
      },
    };

    print.options = { path: 'provider.name', format: 'text' };
    return print.print().then(() => {
      const message = print.serverless.cli.consoleLog.args.join();

      expect(print.serverless.cli.consoleLog.called).to.be.equal(true);
      expect(message).to.eql(serverless.configurationInput.provider.name);
    });
  });

  it('should print arrays in text', () => {
    serverless.configurationInput = {
      service: 'my-service',
      provider: {
        name: 'aws',
      },
    };

    print.options = { transform: 'keys', format: 'text' };
    return print.print().then(() => {
      const message = print.serverless.cli.consoleLog.args.join();

      expect(print.serverless.cli.consoleLog.called).to.be.equal(true);
      expect(message).to.eql(`service${os.EOL}provider`);
    });
  });

  it('should apply a keys-transform to standard config in JSON', () => {
    serverless.configurationInput = {
      service: 'my-service',
      provider: {
        name: 'aws',
      },
    };

    print.options = { format: 'json', transform: 'keys' };
    return print.print().then(() => {
      const message = print.serverless.cli.consoleLog.args.join();

      expect(print.serverless.cli.consoleLog.called).to.be.equal(true);
      expect(JSON.parse(message)).to.eql(Object.keys(serverless.configurationInput));
    });
  });

  it('should not allow a non-existing path', () => {
    serverless.configurationInput = {
      service: 'my-service',
      provider: {
        name: 'aws',
      },
    };

    print.options = { path: 'provider.foobar' };
    return expect(print.print()).to.be.rejected;
  });

  it('should not allow an object as "text"', () => {
    serverless.configurationInput = {
      service: 'my-service',
      provider: {
        name: 'aws',
      },
    };

    print.options = { format: 'text' };
    return expect(print.print()).to.be.rejected;
  });

  it('should not allow an unknown transform', () => {
    serverless.configurationInput = {
      service: 'my-service',
      provider: {
        name: 'aws',
      },
    };

    print.options = { transform: 'foobar' };
    return expect(print.print()).to.be.rejected;
  });

  it('should not allow an unknown format', () => {
    serverless.configurationInput = {
      service: 'my-service',
      provider: {
        name: 'aws',
      },
    };

    print.options = { format: 'foobar' };
    return expect(print.print()).to.be.rejected;
  });

  it('should print special service object and provider string configs', () => {
    serverless.configurationInput = {
      service: {
        name: 'my-service',
      },
      provider: 'aws',
    };

    return print.print().then(() => {
      const message = print.serverless.cli.consoleLog.args.join();

      expect(print.serverless.cli.consoleLog.called).to.be.equal(true);
      expect(yaml.load(message)).to.eql(serverless.configurationInput);
    });
  });

  it('should resolve command line variables', () => {
    serverless.configurationInput = {
      service: 'my-service',
      provider: {
        name: 'aws',
        stage: '${opt:stage}',
      },
    };

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

      expect(print.serverless.cli.consoleLog.called).to.be.equal(true);
      expect(yaml.load(message)).to.eql(expected);
    });
  });

  it('should resolve using custom variable syntax', () => {
    serverless.configurationInput = {
      service: 'my-service',
      provider: {
        name: 'aws',
        stage: '${{opt:stage}}',
        variableSyntax: '\\${{([ ~:a-zA-Z0-9._@\\\'",\\-\\/\\(\\)*?]+?)}}',
      },
    };
    serverless.service.provider.variableSyntax = '\\${{([ ~:a-zA-Z0-9._@\\\'",\\-\\/\\(\\)*?]+?)}}';

    serverless.processedInput = {
      commands: ['print'],
      options: { stage: 'dev', region: undefined },
    };

    const expected = {
      service: 'my-service',
      provider: {
        name: 'aws',
        stage: 'dev',
        variableSyntax: '\\${{([ ~:a-zA-Z0-9._@\\\'",\\-\\/\\(\\)*?]+?)}}',
      },
    };

    return print.print().then(() => {
      const message = print.serverless.cli.consoleLog.args.join();

      expect(print.serverless.cli.consoleLog.called).to.be.equal(true);
      expect(yaml.load(message)).to.eql(expected);
    });
  });

  it('should resolve custom variables', () => {
    serverless.configurationInput = {
      service: 'my-service',
      custom: { region: 'us-east-1' },
      provider: {
        name: 'aws',
        stage: '${opt:stage}',
        region: '${self:custom.region}',
      },
    };

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

      expect(print.serverless.cli.consoleLog.called).to.be.equal(true);
      expect(yaml.load(message)).to.eql(expected);
    });
  });

  describe('should resolve fallback', () => {
    [
      { value: 'hello_123@~:/+', description: 'ascii chars' },
      { value: '①⑴⒈⒜Ⓐⓐⓟ ..▉가Ὠ', description: 'unicode chars' },
    ].forEach((testCase) => {
      it(testCase.description, () => {
        serverless.configurationInput = {
          custom: {
            me: `\${self:none, '${testCase.value}'}`,
          },
          provider: {},
        };

        serverless.processedInput = {
          commands: ['print'],
          options: {},
        };

        const expected = {
          custom: {
            me: testCase.value,
          },
          provider: {},
        };

        return print.print().then(() => {
          const message = print.serverless.cli.consoleLog.args.join();

          expect(print.serverless.cli.consoleLog.called).to.be.equal(true);
          expect(yaml.load(message)).to.eql(expected);
        });
      });
    });
  });
});

describe('test/unit/lib/plugins/print.test.js', () => {
  it('correctly prints config', async () => {
    const { stdoutData } = await runServerless({
      fixture: 'aws',
      command: 'print',
    });

    expect(stdoutData).to.include('name: aws');
  });
});
