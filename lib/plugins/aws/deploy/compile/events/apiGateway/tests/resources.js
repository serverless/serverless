'use strict';

const expect = require('chai').expect;

const AwsCompileApigEvents = require('../index');
const AwsProvider = require('../../../../../provider/awsProvider');
const Serverless = require('../../../../../../../Serverless');

describe('#compileResources()', () => {
  let serverless;
  let awsCompileApigEvents;

  beforeEach(() => {
    const options = {
      stage: 'dev',
      region: 'us-east-1',
    };
    serverless = new Serverless();
    serverless.setProvider('aws', new AwsProvider(serverless, options));
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
            http: 'GET bar/-',
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
      const expectedResourcePaths = [
        'foo/bar',
        'foo',
        'bar/-',
        'bar',
        'bar/foo',
        'bar/{id}',
        'bar/{id}/foobar',
        'bar/{foo_id}',
        'bar/{foo_id}/foobar',
      ];
      expect(awsCompileApigEvents.resourcePaths).to.deep.equal(expectedResourcePaths);
    })
  );

  it('should construct the correct resourceLogicalIds object', () => awsCompileApigEvents
    .compileResources().then(() => {
      const expectedResourceLogicalIds = {
        'bar/-': awsCompileApigEvents.provider.naming.getLogicalApiGatewayResourceName('bar/-'),
        'foo/bar': awsCompileApigEvents.provider.naming.getLogicalApiGatewayResourceName('foo/bar'),
        foo: awsCompileApigEvents.provider.naming.getLogicalApiGatewayResourceName('foo'),
        'bar/{id}/foobar': awsCompileApigEvents.provider.naming
          .getLogicalApiGatewayResourceName('bar/{id}/foobar'),
        'bar/{id}': awsCompileApigEvents.provider.naming
          .getLogicalApiGatewayResourceName('bar/{id}'),
        'bar/{foo_id}/foobar': awsCompileApigEvents.provider.naming
          .getLogicalApiGatewayResourceName('bar/{foo_id}/foobar'),
        'bar/{foo_id}': awsCompileApigEvents.provider.naming
          .getLogicalApiGatewayResourceName('bar/{foo_id}'),
        'bar/foo': awsCompileApigEvents.provider.naming.getLogicalApiGatewayResourceName('bar/foo'),
        bar: awsCompileApigEvents.provider.naming.getLogicalApiGatewayResourceName('bar'),
      };
      expect(awsCompileApigEvents.resourceLogicalIds).to.deep.equal(expectedResourceLogicalIds);
    })
  );

  it('should create resource resources when http events are given', () => awsCompileApigEvents
    .compileResources().then(() => {
      expect(awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
        .Resources[awsCompileApigEvents.provider.naming.getLogicalApiGatewayResourceName('foo/bar')]
        .Properties.PathPart).to.equal('bar');
      expect(awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
        .Resources[awsCompileApigEvents.provider.naming.getLogicalApiGatewayResourceName('foo/bar')]
        .Properties.ParentId.Ref).to.equal(awsCompileApigEvents.provider.naming
          .getLogicalApiGatewayResourceName('foo'));
      expect(awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
        .Resources[awsCompileApigEvents.provider.naming.getLogicalApiGatewayResourceName('foo')]
        .Properties.ParentId['Fn::GetAtt'][0])
        .to.equal(awsCompileApigEvents.provider.naming.getLogicalApiGatewayName());
      expect(awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
        .Resources[awsCompileApigEvents.provider.naming.getLogicalApiGatewayResourceName('bar')]
        .Properties.ParentId['Fn::GetAtt'][1])
        .to.equal('RootResourceId');
      expect(awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
        .Resources[
          awsCompileApigEvents.provider.naming.getLogicalApiGatewayResourceName('bar/{id}')
        ].Properties.ParentId.Ref)
        .to.equal(awsCompileApigEvents.provider.naming.getLogicalApiGatewayResourceName('bar'));
      expect(awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
        .Resources[
          awsCompileApigEvents.provider.naming.getLogicalApiGatewayResourceName('bar/{foo_id}')
        ].Properties.ParentId.Ref)
        .to.equal(awsCompileApigEvents.provider.naming.getLogicalApiGatewayResourceName('bar'));
      expect(awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
        .Resources[awsCompileApigEvents.provider.naming
          .getLogicalApiGatewayResourceName('bar/{foo_id}/foobar')]
        .Properties.ParentId.Ref)
        .to.equal(
          awsCompileApigEvents.provider.naming.getLogicalApiGatewayResourceName('bar/{foo_id}')
        );
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
