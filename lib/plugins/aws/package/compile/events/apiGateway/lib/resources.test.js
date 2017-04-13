'use strict';

const expect = require('chai').expect;
const AwsCompileApigEvents = require('../index');
const Serverless = require('../../../../../../../Serverless');
const AwsProvider = require('../../../../../provider/awsProvider');

describe('#compileResources()', () => {
  let serverless;
  let awsCompileApigEvents;

  beforeEach(() => {
    serverless = new Serverless();
    serverless.setProvider('aws', new AwsProvider(serverless));
    serverless.service.provider.compiledCloudFormationTemplate = { Resources: {} };
    awsCompileApigEvents = new AwsCompileApigEvents(serverless);
    awsCompileApigEvents.apiGatewayRestApiLogicalId = 'ApiGatewayRestApi';
    awsCompileApigEvents.validated = {};
  });

  // sorted makes parent refs easier
  it('should construct the correct (sorted) resourcePaths array', () => {
    awsCompileApigEvents.validated.events = [
      {
        http: {
          path: '',
          method: 'GET',
        },
      },
      {
        http: {
          path: 'foo/bar',
          method: 'POST',
        },
      },
      {
        http: {
          path: 'bar/-',
          method: 'GET',
        },
      },
      {
        http: {
          path: 'bar/foo',
          method: 'GET',
        },
      },
      {
        http: {
          path: 'bar/{id}/foobar',
          method: 'GET',
        },
      },
      {
        http: {
          path: 'bar/{id}',
          method: 'GET',
        },
      },
      {
        http: {
          path: 'bar/{foo_id}',
          method: 'GET',
        },
      },
      {
        http: {
          path: 'bar/{foo_id}/foobar',
          method: 'GET',
        },
      },
    ];
    expect(awsCompileApigEvents.getResourcePaths()).to.deep.equal([
      'foo',
      'bar',
      'foo/bar',
      'bar/-',
      'bar/foo',
      'bar/{id}',
      'bar/{foo_id}',
      'bar/{id}/foobar',
      'bar/{foo_id}/foobar',
    ]);
  });

  it('should reference the appropriate ParentId', () => {
    awsCompileApigEvents.validated.events = [
      {
        http: {
          path: 'foo/bar',
          method: 'POST',
        },
      },
      {
        http: {
          path: 'bar/-',
          method: 'GET',
        },
      },
      {
        http: {
          path: 'bar/foo',
          method: 'GET',
        },
      },
      {
        http: {
          path: 'bar/{id}/foobar',
          method: 'GET',
        },
      },
      {
        http: {
          path: 'bar/{id}',
          method: 'GET',
        },
      },
    ];
    return awsCompileApigEvents.compileResources().then(() => {
      expect(awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
        .Resources.ApiGatewayResourceFoo.Properties.ParentId['Fn::GetAtt'][0])
        .to.equal('ApiGatewayRestApi');
      expect(awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
        .Resources.ApiGatewayResourceFoo.Properties.ParentId['Fn::GetAtt'][1])
        .to.equal('RootResourceId');
      expect(awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
        .Resources.ApiGatewayResourceFooBar.Properties.ParentId.Ref)
        .to.equal('ApiGatewayResourceFoo');
      expect(awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
        .Resources.ApiGatewayResourceBarIdVar.Properties.ParentId.Ref)
        .to.equal('ApiGatewayResourceBar');
    });
  });

  it('should construct the correct resourceLogicalIds object', () => {
    awsCompileApigEvents.validated.events = [
      {
        http: {
          path: '',
          method: 'POST',
        },
      },
      {
        http: {
          path: 'foo',
          method: 'GET',
        },
      },
      {
        http: {
          path: 'foo/{foo_id}/bar',
          method: 'GET',
        },
      },
      {
        http: {
          path: 'baz/foo',
          method: 'GET',
        },
      },
    ];
    return awsCompileApigEvents.compileResources().then(() => {
      expect(awsCompileApigEvents.apiGatewayResourceLogicalIds).to.deep.equal({
        baz: 'ApiGatewayResourceBaz',
        'baz/foo': 'ApiGatewayResourceBazFoo',
        foo: 'ApiGatewayResourceFoo',
        'foo/{foo_id}': 'ApiGatewayResourceFooFooidVar',
        'foo/{foo_id}/bar': 'ApiGatewayResourceFooFooidVarBar',
      });
    });
  });

  it('should construct resourceLogicalIds that do not collide', () => {
    awsCompileApigEvents.validated.events = [
      {
        http: {
          path: 'foo/bar',
          method: 'POST',
        },
      },
      {
        http: {
          path: 'foo/{bar}',
          method: 'GET',
        },
      },
    ];
    return awsCompileApigEvents.compileResources().then(() => {
      expect(awsCompileApigEvents.apiGatewayResourceLogicalIds).to.deep.equal({
        foo: 'ApiGatewayResourceFoo',
        'foo/bar': 'ApiGatewayResourceFooBar',
        'foo/{bar}': 'ApiGatewayResourceFooBarVar',
      });
    });
  });

  it('should set the appropriate Pathpart', () => {
    awsCompileApigEvents.validated.events = [
      {
        http: {
          path: 'foo/{bar}',
          method: 'GET',
        },
      },
      {
        http: {
          path: 'foo/bar',
          method: 'GET',
        },
      },
      {
        http: {
          path: 'foo/{bar}/baz',
          method: 'GET',
        },
      },
    ];
    return awsCompileApigEvents.compileResources().then(() => {
      expect(awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
        .Resources.ApiGatewayResourceFooBar.Properties.PathPart)
        .to.equal('bar');
      expect(awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
        .Resources.ApiGatewayResourceFooBarVar.Properties.PathPart)
        .to.equal('{bar}');
      expect(awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
        .Resources.ApiGatewayResourceFooBarVarBaz.Properties.PathPart)
        .to.equal('baz');
    });
  });

  it('should handle root resource references', () => {
    awsCompileApigEvents.validated.events = [
      {
        http: {
          path: '',
          method: 'GET',
        },
      },
    ];
    return awsCompileApigEvents.compileResources().then(() => {
      expect(awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
        .Resources).to.deep.equal({});
    });
  });
});
