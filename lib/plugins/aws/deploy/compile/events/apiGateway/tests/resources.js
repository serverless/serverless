'use strict';

const expect = require('chai').expect;
const AwsCompileApigEvents = require('../index');
const Serverless = require('../../../../../../../Serverless');

describe('#compileResources()', () => {
  let serverless;
  let awsCompileApigEvents;

  beforeEach(() => {
    serverless = new Serverless();
    serverless.service.resources = { Resources: {} };
    awsCompileApigEvents = new AwsCompileApigEvents(serverless);
    awsCompileApigEvents.serverless.service.functions = {
      first: {
        events: [
          {
            http: {
              path: 'foo/bar',
              method: 'POST',
            },
          },
          {
            http: 'GET bar/foo',
          },
        ],
      },
    };
  });

  it('should construct the correct resourcePaths array', () => awsCompileApigEvents
    .compileResources().then(() => {
      const expectedResourcePaths = ['foo/bar', 'foo', 'bar/foo', 'bar'];
      expect(awsCompileApigEvents.resourcePaths).to.deep.equal(expectedResourcePaths);
    })
  );

  it('should construct the correct resourceLogicalIds object', () => awsCompileApigEvents
    .compileResources().then(() => {
      const expectedResourceLogicalIds = {
        'foo/bar': 'ResourceApigEvent0',
        foo: 'ResourceApigEvent1',
        'bar/foo': 'ResourceApigEvent2',
        bar: 'ResourceApigEvent3',
      };
      expect(awsCompileApigEvents.resourceLogicalIds).to.deep.equal(expectedResourceLogicalIds);
    })
  );

  it('should create resource resources when http events are given', () => awsCompileApigEvents
    .compileResources().then(() => {
      expect(awsCompileApigEvents.serverless.service.resources.Resources
        .ResourceApigEvent0.Properties.PathPart).to.equal('bar');
      expect(awsCompileApigEvents.serverless.service.resources.Resources
        .ResourceApigEvent0.Properties.ParentId.Ref).to.equal('ResourceApigEvent1');
      expect(awsCompileApigEvents.serverless.service.resources.Resources
        .ResourceApigEvent1.Properties.ParentId['Fn::GetAtt'][0]).to.equal('RestApiApigEvent');
      expect(awsCompileApigEvents.serverless.service.resources.Resources
        .ResourceApigEvent3.Properties.ParentId['Fn::GetAtt'][1]).to.equal('RootResourceId');
    })
  );

  it('should not create resource resources when http events are not given', () => {
    awsCompileApigEvents.serverless.service.functions = {
      first: {
        events: [],
      },
    };

    return awsCompileApigEvents.compileResources().then(() => {
      expect(
        awsCompileApigEvents.serverless.service.resources.Resources
      ).to.deep.equal({});
    });
  });
});
