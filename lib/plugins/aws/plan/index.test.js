'use strict';

const { expect } = require('chai');
const sinon = require('sinon');
const Serverless = require('../../../Serverless');
const runServerless = require('../../../../tests/utils/run-serverless');
const fixtures = require('../../../../tests/fixtures');

describe('AwsPlan', () => {
  after(fixtures.cleanup);

  // unmodified version of the run command
  const run = Serverless.prototype.run;

  let requestStub;
  let messages;

  beforeEach(() => {
    requestStub = sinon.stub();
    messages = [];
    Serverless.prototype.run = function() {
      // set request stub
      this.providers.aws.request = requestStub;
      // decorate cli logger
      const log = this.cli.consoleLog;
      this.cli.consoleLog = function(message) {
        log(message);
        messages.push(message);
      };
      // prevent other remote calls
      const plugin = this.pluginManager.getPlugins().find(p => p.constructor.name === 'AwsPlan');
      plugin.waitForChangeSetCreateComplete = () => Promise.resolve();
      return run.call(this);
    };
  });

  afterEach(() => {
    Serverless.prototype.run = run;
  });

  it('Should not run when if stack is not deployed', () => {
    requestStub
      .withArgs('CloudFormation', 'describeStackResource', {
        StackName: 'irrelevant-dev',
        LogicalResourceId: 'ServerlessDeploymentBucket',
      })
      .rejects();

    return runServerless({
      config: { service: 'irrelevant', provider: 'aws' },
      cliArgs: ['plan'],
    })
      .then(() => {
        expect.fail();
      })
      .catch(() => {
        expect(messages.length).to.be.above(0, 'no messages');
        expect(
          messages.some(message => message.includes('runs only on deployed projects')),
          'missing console message'
        ).to.be.true;
      });
  });

  it('Should make all necessary aws requests to report changes', () => {
    requestStub.withArgs('CloudFormation', 'describeStackResource', sinon.match.any).resolves({
      StackResourceDetail: {
        PhysicalResourceId: 'foo-bucket',
      },
    });
    requestStub.withArgs('S3', 'upload', sinon.match.any).resolves({});
    requestStub.withArgs('CloudFormation', 'createChangeSet', sinon.match.any).resolves({});
    requestStub.withArgs('CloudFormation', 'describeStacks', sinon.match.any).resolves({
      Stacks: [{ Parameters: [], Tags: [] }],
    });
    requestStub.withArgs('CloudFormation', 'describeChangeSet', sinon.match.any).resolves({
      StackName: 'aws-sls-dev',
      Parameters: [],
      Tags: [],
      Changes: [],
    });
    requestStub.withArgs('CloudFormation', 'deleteChangeSet', sinon.match.any).resolves({});
    requestStub.withArgs('S3', 'listObjectsV2', sinon.match.any).resolves({ Contents: [] });
    return runServerless({
      config: { service: 'irrelevant', provider: 'aws' },
      cliArgs: ['plan'],
    }).then(() => {
      const calls = requestStub.getCalls();
      expect(calls.length).to.equal(8);
      expect(calls[0].args).to.deep.equal([
        'CloudFormation',
        'describeStackResource',
        {
          StackName: 'irrelevant-dev',
          LogicalResourceId: 'ServerlessDeploymentBucket',
        },
      ]);
      expect(calls[1].args[0]).to.equal('S3');
      expect(calls[1].args[1]).to.equal('upload');
      expect(calls[2].args[0]).to.equal('CloudFormation');
      expect(calls[2].args[1]).to.equal('createChangeSet');
      expect(calls[3].args[0]).to.equal('CloudFormation');
      expect(calls[3].args[1]).to.equal('describeStacks');
      expect(calls[4].args[0]).to.equal('CloudFormation');
      expect(calls[4].args[1]).to.equal('describeChangeSet');
      expect(calls[5].args[0]).to.equal('CloudFormation');
      expect(calls[5].args[1]).to.equal('deleteChangeSet');
      expect(calls[6].args[0]).to.equal('S3');
      expect(calls[6].args[1]).to.equal('listObjectsV2');
      expect(calls[7].args[0]).to.equal('S3');
      expect(calls[7].args[1]).to.equal('deleteObjects');
      expect(
        messages.some(message => message.includes('Resource Changes')),
        'Resource changes were not printed'
      ).to.be.true;
    });
  });
});
