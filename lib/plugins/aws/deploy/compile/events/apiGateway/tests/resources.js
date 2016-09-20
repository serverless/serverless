'use strict';

const expect = require('chai').expect;
const AwsCompileApigEvents = require('../index');
const Serverless = require('../../../../../../../Serverless');

describe('#compileResources()', () => {
  let serverless;
  let awsCompileApigEvents;

  beforeEach(() => {
    serverless = new Serverless();
    serverless.service.provider.compiledCloudFormationTemplate = { Resources: {} };
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
            http: 'GET bar/{id}',
          },
          {
            http: 'GET bar/{id}/foobar',
          },
          {
            http: 'GET bar/{foo_id}',
          },
          {
            http: 'GET bar/{foo_id}/foobar',
          },
        ],
      },
    };
  });

  it('should throw an error if http event type is not a string or an object', () => {
    awsCompileApigEvents.serverless.service.functions = {
      first: {
        events: [
          {
            http: 42,
          },
        ],
      },
    };

    expect(() => awsCompileApigEvents.compileResources()).to.throw(Error);
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
        'foo/bar': 'ApiGatewayResourceFooBar',
        foo: 'ApiGatewayResourceFoo',
        'bar/{id}/foobar': 'ApiGatewayResourceBarIdFoobar',
        'bar/{id}': 'ApiGatewayResourceBarId',
        'bar/{foo_id}/foobar': 'ApiGatewayResourceBarFooidFoobar',
        'bar/{foo_id}': 'ApiGatewayResourceBarFooid',
        'bar/foo': 'ApiGatewayResourceBarFoo',
        bar: 'ApiGatewayResourceBar',
      };
      expect(awsCompileApigEvents.resourceLogicalIds).to.deep.equal(expectedResourceLogicalIds);
    })
  );

  it('should create resource resources when http events are given', () => awsCompileApigEvents
    .compileResources().then(() => {
      expect(awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
        .Resources.ApiGatewayResourceFooBar.Properties.PathPart)
        .to.equal('bar');
      expect(awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
        .Resources.ApiGatewayResourceFooBar.Properties.ParentId.Ref)
        .to.equal('ApiGatewayResourceFoo');
      expect(awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
        .Resources.ApiGatewayResourceFoo.Properties.ParentId['Fn::GetAtt'][0])
        .to.equal('ApiGatewayRestApi');
      expect(awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
        .Resources.ApiGatewayResourceBar.Properties.ParentId['Fn::GetAtt'][1])
        .to.equal('RootResourceId');
      expect(awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
        .Resources.ApiGatewayResourceBarId.Properties.ParentId.Ref)
        .to.equal('ApiGatewayResourceBar');
      expect(awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
        .Resources.ApiGatewayResourceBarFooid.Properties.ParentId.Ref)
        .to.equal('ApiGatewayResourceBar');
      expect(awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
        .Resources.ApiGatewayResourceBarFooidFoobar.Properties.ParentId.Ref)
        .to.equal('ApiGatewayResourceBarFooid');
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
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources
      ).to.deep.equal({});
    });
  });
});
