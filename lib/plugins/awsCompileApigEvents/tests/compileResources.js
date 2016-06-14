'use strict';

const expect = require('chai').expect;
const AwsCompileApigEvents = require('../awsCompileApigEvents');
const Serverless = require('../../../Serverless');

describe('#compileResources()', () => {
  let serverless;
  let awsCompileApigEvents;

  beforeEach(() => {
    serverless = new Serverless();
    serverless.init();
    serverless.service.resources = { aws: { Resources: {} } };
    awsCompileApigEvents = new AwsCompileApigEvents(serverless);
    awsCompileApigEvents.serverless.service.functions = {
      hello: {
        events: {
          aws: {
            http_endpoint: {
              post: 'foo/bar',
              get: 'bar/foo',
            },
          },
        },
      },
    };
  });

  it('should construct the correct resourcePaths array', () => {
    awsCompileApigEvents.compileResources().then(() => {
      const expectedResourcePaths = ['foo/bar', 'foo', 'bar/foo', 'bar'];
      expect(awsCompileApigEvents.resourcePaths).to.deep.equal(expectedResourcePaths);
    });
  });

  it('should construct the correct resourceLogicalIds object', () => {
    awsCompileApigEvents.compileResources().then(() => {
      const expectedResourceLogicalIds = {
        'foo/bar': 'ResourceApigEvent0',
        foo: 'ResourceApigEvent1',
        'bar/foo': 'ResourceApigEvent2',
        bar: 'ResourceApigEvent3',
      };
      expect(awsCompileApigEvents.resourceLogicalIds).to.deep.equal(expectedResourceLogicalIds);
    });
  });

  it('should compile to the correct CF resources', () => {
    awsCompileApigEvents.compileResources().then(() => {
      expect(awsCompileApigEvents.serverless.service.resources.aws.Resources
        .ResourceApigEvent0.Properties.PathPart).to.equal('bar');
      expect(awsCompileApigEvents.serverless.service.resources.aws.Resources
        .ResourceApigEvent0.Properties.ParentId.Ref).to.equal('ResourceApigEvent1');
      expect(awsCompileApigEvents.serverless.service.resources.aws.Resources
        .ResourceApigEvent2.Properties.ParentId['Fn::GetAtt'][0]).to.equal('RestApiApigEvent');
      expect(awsCompileApigEvents.serverless.service.resources.aws.Resources
        .ResourceApigEvent2.Properties.ParentId['Fn::GetAtt'][1]).to.equal('RootResourceId');
    });
  });
});
