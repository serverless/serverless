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
    expect(Object.keys(awsCompileApigEvents.getResourcePaths())).to.deep.equal([
      'foo',
      'foo/bar',
      'bar',
      'bar/-',
      'bar/foo',
      'bar/{id}',
      'bar/{id}/foobar',
      'bar/{foo_id}',
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
      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources
          .ApiGatewayResourceFoo.Properties.ParentId['Fn::GetAtt'][0]
      ).to.equal('ApiGatewayRestApi');
      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources
          .ApiGatewayResourceFoo.Properties.ParentId['Fn::GetAtt'][1]
      ).to.equal('RootResourceId');
      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources
          .ApiGatewayResourceFooBar.Properties.ParentId.Ref
      ).to.equal('ApiGatewayResourceFoo');
      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources
          .ApiGatewayResourceBarIdVar.Properties.ParentId.Ref
      ).to.equal('ApiGatewayResourceBar');
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
      const expectedResourceLogicalIds = {
        'baz': 'ApiGatewayResourceBaz',
        'baz/foo': 'ApiGatewayResourceBazFoo',
        'foo': 'ApiGatewayResourceFoo',
        'foo/{foo_id}': 'ApiGatewayResourceFooFooidVar',
        'foo/{foo_id}/bar': 'ApiGatewayResourceFooFooidVarBar',
      };
      Object.keys(expectedResourceLogicalIds).forEach(path => {
        expect(awsCompileApigEvents.apiGatewayResources[path].resourceLogicalId).equal(
          expectedResourceLogicalIds[path]
        );
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
      const expectedResourceLogicalIds = {
        'foo': 'ApiGatewayResourceFoo',
        'foo/bar': 'ApiGatewayResourceFooBar',
        'foo/{bar}': 'ApiGatewayResourceFooBarVar',
      };
      Object.keys(expectedResourceLogicalIds).forEach(path => {
        expect(awsCompileApigEvents.apiGatewayResources[path].resourceLogicalId).equal(
          expectedResourceLogicalIds[path]
        );
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
      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources
          .ApiGatewayResourceFooBar.Properties.PathPart
      ).to.equal('bar');
      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources
          .ApiGatewayResourceFooBarVar.Properties.PathPart
      ).to.equal('{bar}');
      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources
          .ApiGatewayResourceFooBarVarBaz.Properties.PathPart
      ).to.equal('baz');
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
      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources
      ).to.deep.equal({});
    });
  });

  it('should create child resources only if there are predefined parent resources', () => {
    awsCompileApigEvents.serverless.service.provider.apiGateway = {
      restApiId: '6fyzt1pfpk',
      restApiRootResourceId: 'z5d4qh4oqi',
      restApiResources: {
        '/foo': 'axcybf2i39',
        '/users': 'zxcvbnmasd',
        '/users/friends': 'fcasdoojp1',
        '/groups': 'iuoyiusduo',
      },
    };

    awsCompileApigEvents.validated.events = [
      {
        http: {
          path: 'foo/bar',
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
          path: 'foo/bar',
          method: 'DELETE',
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
          path: 'users/friends/comments',
          method: 'GET',
        },
      },
      {
        http: {
          path: 'users/me/posts',
          method: 'GET',
        },
      },
      {
        http: {
          path: 'groups/categories',
          method: 'GET',
        },
      },
    ];
    return awsCompileApigEvents.compileResources().then(() => {
      try {
        awsCompileApigEvents.getResourceId('users/{userId}');
        throw new Error('Expected API Gateway resource not found error, got success');
      } catch (e) {
        expect(e.message).to.equal('Can not find API Gateway resource from path users/{userId}');
      }

      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources
          .ApiGatewayResourceFoo
      ).to.equal(undefined);
      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources
          .ApiGatewayResourceBar.Properties.RestApiId
      ).to.equal('6fyzt1pfpk');
      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources
          .ApiGatewayResourceBar.Properties.ParentId
      ).to.equal('z5d4qh4oqi');
      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources
          .ApiGatewayResourceFooBar.Properties.ParentId
      ).to.equal('axcybf2i39');
      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources
          .ApiGatewayResourceBarIdVar.Properties.ParentId.Ref
      ).to.equal('ApiGatewayResourceBar');
      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources
          .ApiGatewayResourceUsersMePosts
      ).not.equal(undefined);
      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources
          .ApiGatewayResourceUsersFriendsComments.Properties.ParentId
      ).to.equal('fcasdoojp1');
    });
  });

  it('should not create any child resources if all resources exists', () => {
    awsCompileApigEvents.serverless.service.provider.apiGateway = {
      restApiId: '6fyzt1pfpk',
      restApiRootResourceId: 'z5d4qh4oqi',
      restApiResources: {
        'foo': 'axcybf2i39',
        'users': 'zxcvbnmasd',
        'users/friends': 'fcasdoojp1',
        'users/is/this/a/long/path': 'sadvgpoujk',
      },
    };

    awsCompileApigEvents.validated.events = [
      {
        http: {
          path: 'foo',
          method: 'GET',
        },
      },
      {
        http: {
          path: 'users',
          method: 'GET',
        },
      },
      {
        http: {
          path: 'users/friends',
          method: 'GET',
        },
      },
      {
        http: {
          path: 'users/is/this/a/long/path',
          method: 'GET',
        },
      },
    ];

    return awsCompileApigEvents.compileResources().then(() => {
      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources
          .ApiGatewayResourceFoo
      ).to.equal(undefined);
      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources
          .ApiGatewayResourceUsers
      ).to.equal(undefined);
      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources
          .ApiGatewayResourceUsersFriends
      ).to.equal(undefined);
      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources
          .ApiGatewayResourceUsersIsThis
      ).to.equal(undefined);
    });
  });

  it('should throw error if parent of existing resources is required', () => {
    awsCompileApigEvents.serverless.service.provider.apiGateway = {
      restApiId: '6fyzt1pfpk',
      restApiRootResourceId: 'z5d4qh4oqi',
      restApiResources: {
        'users/friends': 'fcasdoojp1',
      },
    };

    awsCompileApigEvents.validated.events = [
      {
        http: {
          path: 'users',
          method: 'GET',
        },
      },
      {
        http: {
          path: 'users/friends/{friendId}',
          method: 'GET',
        },
      },
    ];

    expect(() => awsCompileApigEvents.compileResources()).to.throw(
      Error,
      'Resource ID for path users is required'
    );
  });

  it('should named all method paths if all resources are predefined', () => {
    awsCompileApigEvents.serverless.service.provider.apiGateway = {
      restApiId: '6fyzt1pfpk',
      restApiRootResourceId: 'z5d4qh4oqi',
      restApiResources: {
        'users/friends': 'fcasdoojp1',
        'users/friends/{id}': 'fcasdoojp1',
      },
    };

    awsCompileApigEvents.validated.events = [
      {
        http: {
          path: 'users/friends',
          method: 'GET',
        },
      },
      {
        http: {
          path: 'users/friends',
          method: 'POST',
        },
      },
      {
        http: {
          path: 'users/friends',
          method: 'DELETE',
        },
      },
      {
        http: {
          path: 'users/friends/{id}',
          method: 'GET',
        },
      },
      {
        http: {
          path: 'users/friends/{id}',
          method: 'POST',
        },
      },
    ];

    return awsCompileApigEvents.compileResources().then(() => {
      expect(
        Object.keys(
          awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources
        ).every(
          k => ['ApiGatewayMethodundefinedGet', 'ApiGatewayMethodundefinedPost'].indexOf(k) === -1
        )
      ).to.equal(true);
    });
  });
});
