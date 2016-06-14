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
            http_endpoints: {
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
        'foo/bar': 'Resource0ApigEvent',
        foo: 'Resource1ApigEvent',
        'bar/foo': 'Resource2ApigEvent',
        bar: 'Resource3ApigEvent',
      };
      expect(awsCompileApigEvents.resourceLogicalIds).to.deep.equal(expectedResourceLogicalIds);
    });
  });

  it('should compile to the correct CF resources', () => {
    awsCompileApigEvents.compileResources().then(() => {
      expect(awsCompileApigEvents.serverless.service.resources.aws.Resources
        .Resource0ApigEvent.Properties.PathPart).to.equal('bar');
      expect(awsCompileApigEvents.serverless.service.resources.aws.Resources
        .Resource0ApigEvent.Properties.ParentId.Ref).to.equal('Resource1ApigEvent');
      expect(awsCompileApigEvents.serverless.service.resources.aws.Resources
        .Resource3ApigEvent.Properties.ParentId['Fn::GetAtt'][0]).to.equal('RestApiApigEvent');
      expect(awsCompileApigEvents.serverless.service.resources.aws.Resources
        .Resource3ApigEvent.Properties.ParentId['Fn::GetAtt'][1]).to.equal('RootResourceId');
    });
  });
});
