'use strict';

const expect = require('chai').expect;
const AwsCompileApigEvents = require('../awsCompileApigEvents');
const Serverless = require('../../../Serverless');

describe('#awsCompilePermissions()', () => {
  let serverless;
  let awsCompileApigEvents;

  beforeEach(() => {
    serverless = new Serverless();
    serverless.init();
    serverless.service.resources = { aws: { Resources: {} } };
    awsCompileApigEvents = new AwsCompileApigEvents(serverless);
    awsCompileApigEvents.resourcePaths = ['foo/bar', 'bar/foo'];
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

  it('should compile to the correct CF resources', () => awsCompileApigEvents
    .compilePermissions().then(() => {
      expect(awsCompileApigEvents.serverless.service.resources.aws.Resources
        .ApigPermissionPost0.Properties.FunctionName['Fn::GetAtt'][0]).to.equal('hello');
      expect(awsCompileApigEvents.serverless.service.resources.aws.Resources
        .ApigPermissionPost0.Properties.SourceArn['Fn::GetAtt'][0]).to.equal('PostMethodApigEvent0');
      expect(awsCompileApigEvents.serverless.service.resources.aws.Resources
        .ApigPermissionGet1.Properties.FunctionName['Fn::GetAtt'][0]).to.equal('hello');
      expect(awsCompileApigEvents.serverless.service.resources.aws.Resources
        .ApigPermissionGet1.Properties.SourceArn['Fn::GetAtt'][0]).to.equal('GetMethodApigEvent1');
    }));
});
