'use strict';

const expect = require('chai').expect;
const AwsCompileApigEvents = require('../index');
const Serverless = require('../../../../../../../Serverless');

describe('#awsCompilePermissions()', () => {
  let serverless;
  let awsCompileApigEvents;

  beforeEach(() => {
    serverless = new Serverless();
    serverless.service.resources = { Resources: {} };
    serverless.service.functions = {
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
    awsCompileApigEvents = new AwsCompileApigEvents(serverless);
    awsCompileApigEvents.resourcePaths = ['foo/bar', 'bar/foo'];
  });

  it('should create permission resources when http events are given', () => awsCompileApigEvents
    .compilePermissions().then(() => {
      expect(awsCompileApigEvents.serverless.service.resources.Resources
        .PostPermissionApigEvent0.Properties.FunctionName['Fn::GetAtt'][0]).to.equal('first');
      expect(awsCompileApigEvents.serverless.service.resources.Resources
        .GetPermissionApigEvent1.Properties.FunctionName['Fn::GetAtt'][0]).to.equal('first');
    })
  );

  it('should not create permission resources when http events are not given', () => {
    awsCompileApigEvents.serverless.service.functions = {
      first: {
        events: [],
      },
    };

    return awsCompileApigEvents.compilePermissions().then(() => {
      expect(
        awsCompileApigEvents.serverless.service.resources.Resources
      ).to.deep.equal({});
    });
  });
});
