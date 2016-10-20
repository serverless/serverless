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
    awsCompileApigEvents.restApiLogicalId = 'ApiGatewayRestApi';
  });

  // sorted makes parent refs easier
  it('should construct the correct (sorted) resourcePaths array', () => {
    expect(awsCompileApigEvents.getResourcePaths([
      {
        path: 'foo/bar',
        method: 'POST',
      },
      {
        path: 'bar/-',
        method: 'GET',
      },
      {
        path: 'bar/foo',
        method: 'GET',
      },
      {
        path: 'bar/{id}/foobar',
        method: 'GET',
      },
      {
        path: 'bar/{id}',
        method: 'GET',
      },
      {
        path: 'bar/{foo_id}',
        method: 'GET',
      },
      {
        path: 'bar/{foo_id}/foobar',
        method: 'GET',
      },
    ])).to.deep.equal([
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

  it('should reference the appropriate ParentId', () =>
    awsCompileApigEvents.compileResources({
      events: [
        {
          path: 'foo/bar',
          method: 'POST',
        },
        {
          path: 'bar/-',
          method: 'GET',
        },
        {
          path: 'bar/foo',
          method: 'GET',
        },
        {
          path: 'bar/{id}/foobar',
          method: 'GET',
        },
        {
          path: 'bar/{id}',
          method: 'GET',
        },
        {
          path: 'bar/{foo_id}',
          method: 'GET',
        },
        {
          path: 'bar/{foo_id}/foobar',
          method: 'GET',
        },
      ],
    }).then(() => {
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
      expect(awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
        .Resources.ApiGatewayResourceBarFooidVar.Properties.ParentId.Ref)
        .to.equal('ApiGatewayResourceBar');
      expect(awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
        .Resources.ApiGatewayResourceBarFooidVarFoobar.Properties.ParentId.Ref)
        .to.equal('ApiGatewayResourceBarFooidVar');
    })
  );

  it('should construct the correct resourceLogicalIds object', () =>
    awsCompileApigEvents.compileResources({
      events: [
        {
          path: 'foo/bar',
          method: 'POST',
        },
        {
          path: 'bar/-',
          method: 'GET',
        },
        {
          path: 'bar/foo',
          method: 'GET',
        },
        {
          path: 'bar/{id}/foobar',
          method: 'GET',
        },
        {
          path: 'bar/{id}',
          method: 'GET',
        },
        {
          path: 'bar/{foo_id}',
          method: 'GET',
        },
        {
          path: 'bar/{foo_id}/foobar',
          method: 'GET',
        },
      ],
    }).then(() => {
      const expectedResourceLogicalIds = {
        'bar/-': 'ApiGatewayResourceBarDash',
        'foo/bar': 'ApiGatewayResourceFooBar',
        foo: 'ApiGatewayResourceFoo',
        'bar/{id}/foobar': 'ApiGatewayResourceBarIdVarFoobar',
        'bar/{id}': 'ApiGatewayResourceBarIdVar',
        'bar/{foo_id}/foobar': 'ApiGatewayResourceBarFooidVarFoobar',
        'bar/{foo_id}': 'ApiGatewayResourceBarFooidVar',
        'bar/foo': 'ApiGatewayResourceBarFoo',
        bar: 'ApiGatewayResourceBar',
      };
      expect(awsCompileApigEvents.resourceLogicalIds).to.deep.equal(expectedResourceLogicalIds);
    })
  );

  it('should construct resourceLogicalIds that do not collide', () =>
    awsCompileApigEvents.compileResources({
      events: [
        {
          path: 'foo/bar',
          method: 'POST',
        },
        {
          path: 'foo/{bar}',
          method: 'GET',
        },
      ],
    }).then(() => {
      expect(awsCompileApigEvents.resourceLogicalIds).to.deep.equal({
        foo: 'ApiGatewayResourceFoo',
        'foo/bar': 'ApiGatewayResourceFooBar',
        'foo/{bar}': 'ApiGatewayResourceFooBarVar',
      });
    })
  );

  it('should set the appropriate Pathpart', () =>
    awsCompileApigEvents.compileResources({
      events: [
        {
          path: 'foo/{bar}',
          method: 'GET',
        },
        {
          path: 'foo/bar',
          method: 'GET',
        },
        {
          path: 'foo/{bar}/baz',
          method: 'GET',
        },
      ],
    }).then(() => {
      expect(awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
        .Resources.ApiGatewayResourceFooBar.Properties.PathPart)
        .to.equal('bar');
      expect(awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
        .Resources.ApiGatewayResourceFooBarVar.Properties.PathPart)
        .to.equal('{bar}');
      expect(awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
        .Resources.ApiGatewayResourceFooBarVarBaz.Properties.PathPart)
        .to.equal('baz');
    })
  );

  it('should handle root resource references', () =>
    awsCompileApigEvents.compileResources({
      events: [
        {
          path: '',
          method: 'GET',
        },
      ],
    }).then(() => {
      expect(awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
        .Resources).to.deep.equal({});
    })
  );
});
