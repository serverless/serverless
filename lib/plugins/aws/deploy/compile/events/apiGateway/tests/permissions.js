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
            http: {
              path: 'bar/foo',
              method: 'GET',
            },
          },
        ],
      },
    };
    awsCompileApigEvents = new AwsCompileApigEvents(serverless);
    awsCompileApigEvents.resourcePaths = ['foo/bar', 'bar/foo'];
  });

  it('should compile to the correct CloudFormation resources', () => awsCompileApigEvents
    .compilePermissions().then(() => {
      expect(awsCompileApigEvents.serverless.service.resources.Resources
        .PostPermissionApigEvent0.Properties.FunctionName['Fn::GetAtt'][0]).to.equal('first');
      expect(awsCompileApigEvents.serverless.service.resources.Resources
        .GetPermissionApigEvent1.Properties.FunctionName['Fn::GetAtt'][0]).to.equal('first');
    })
  );
});
