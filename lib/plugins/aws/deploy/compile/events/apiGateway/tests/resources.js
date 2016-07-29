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
          {
            http: 'GET bar/{id}'
          },
          {
            http: 'GET bar/{id}/foobar'
          },
          {
            http: 'GET bar/{foo_id}'
          },
          {
            http: 'GET bar/{foo_id}/foobar'
          }
        ],
      },
    };
  });

  it('should construct the correct resourcePaths array', () => awsCompileApigEvents
    .compileResources().then(() => {
      const expectedResourcePaths = ['foo/bar', 'foo', 'bar/foo', 'bar', 'bar/{id}',
        'bar/{id}/foobar', 'bar/{foo_id}', 'bar/{foo_id}/foobar'];
      expect(awsCompileApigEvents.resourcePaths).to.deep.equal(expectedResourcePaths);
    })
  );

  it('should construct the correct resourceLogicalIds object', () => awsCompileApigEvents
    .compileResources().then(() => {
      const expectedResourceLogicalIds = {
        'foo/bar': 'ResourceApigEventFirstFooBar',
        foo: 'ResourceApigEventFirstFoo',
        'bar/{id}/foobar': 'ResourceApigEventFirstBarIdFoobar',
        'bar/{id}': 'ResourceApigEventFirstBarId',
        'bar/{foo_id}/foobar': 'ResourceApigEventFirstBarFooidFoobar',
        'bar/{foo_id}': 'ResourceApigEventFirstBarFooid',
        'bar/foo': 'ResourceApigEventFirstBarFoo',
        bar: 'ResourceApigEventFirstBar',
      };
      expect(awsCompileApigEvents.resourceLogicalIds).to.deep.equal(expectedResourceLogicalIds);
    })
  );

  it('should create resource resources when http events are given', () => awsCompileApigEvents
    .compileResources().then(() => {
      expect(awsCompileApigEvents.serverless.service.resources.Resources
        .ResourceApigEventFirstFooBar.Properties.PathPart)
        .to.equal('bar');
      expect(awsCompileApigEvents.serverless.service.resources.Resources
        .ResourceApigEventFirstFooBar.Properties.ParentId.Ref)
        .to.equal('ResourceApigEventFirstFoo');
      expect(awsCompileApigEvents.serverless.service.resources.Resources
        .ResourceApigEventFirstFoo.Properties.ParentId['Fn::GetAtt'][0])
        .to.equal('RestApiApigEvent');
      expect(awsCompileApigEvents.serverless.service.resources.Resources
        .ResourceApigEventFirstBar.Properties.ParentId['Fn::GetAtt'][1])
        .to.equal('RootResourceId');
      expect(awsCompileApigEvents.serverless.service.resources.Resources
        .ResourceApigEventFirstBarId.Properties.ParentId.Ref)
        .to.equal('ResourceApigEventFirstBar');
      expect(awsCompileApigEvents.serverless.service.resources.Resources
        .ResourceApigEventFirstBarFooid.Properties.ParentId.Ref)
        .to.equal('ResourceApigEventFirstBar');
      expect(awsCompileApigEvents.serverless.service.resources.Resources
        .ResourceApigEventFirstBarFooidFoobar.Properties.ParentId.Ref)
        .to.equal('ResourceApigEventFirstBarFooid');
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
