'use strict';

const expect = require('chai').expect;
const OpenWhiskCompileFunctions = require('../index');
const Serverless = require('../../../../../../Serverless');

describe('OpenWhiskCompileFunctions', () => {
  let serverless;
  let openwhiskCompileFunctions;

  /*
  const functionsObjectMock = {
    first: {
      name_template: 'name-template-name',
      handler: 'first.function.handler',
      provider: {
        ow: {
          timeout: 6,
          memorySize: 1024,
          runtime: 'nodejs4.3',
        },
      },
    },
    second: {
      name_template: 'name-template-name',
      handler: 'second.function.handler',
      provider: {
        ow: {
          timeout: 6,
          memorySize: 1024,
          runtime: 'nodejs4.3',
        },
      },
    },
  };

  const serviceResourcesOpenWhiskResourcesObjectMock = {
    Resources: {
      first: {
        Type: 'AWS::Lambda::Function',
        Properties: {
          Code: {
            S3Bucket: 'new-service-dev-us-east-1',
            S3Key: '',
          },
          FunctionName: 'new-service-dev-first',
          Handler: 'first.function.handler',
          MemorySize: 1024,
          Role: { 'Fn::GetAtt': ['IamRoleLambda', 'Arn'] },
          Runtime: 'nodejs4.3',
          Timeout: 6,
        },
      },
      second: {
        Type: 'AWS::Lambda::Function',
        Properties: {
          Code: {
            S3Bucket: 'new-service-dev-us-east-1',
            S3Key: '',
          },
          FunctionName: 'new-service-dev-second',
          Handler: 'second.function.handler',
          MemorySize: 1024,
          Role: { 'Fn::GetAtt': ['IamRoleLambda', 'Arn'] },
          Runtime: 'nodejs4.3',
          Timeout: 6,
        },
      },
    },
  };

 */
  beforeEach(() => {
    serverless = new Serverless();
    const options = {
      stage: 'dev',
      region: 'us-east-1',
    };
    openwhiskCompileFunctions = new OpenWhiskCompileFunctions(serverless, options);
    serverless.service.resources = {};
    //openwhiskCompileFunctions.serverless.service.functions = functionsObjectMock;
    //owCompileFunctions.serverless.service.service = 'new-service';
  });


  describe('#setup()', () => {
    it('should create empty in-memory function store', () => {
      openwhiskCompileFunctions.setup()
      expect(openwhiskCompileFunctions.serverless.service.resources.openwhisk).to.have.property('functions')
    })
  });

  describe('#compileFunctions()', () => {
    it('should throw an error if the resource section is not available', () => {
      openwhiskCompileFunctions.serverless.service.resources.openwhisk = false;
      expect(() => openwhiskCompileFunctions.compileFunctions()).to.throw(Error);
    });

    /*
    it('should create corresponding function resources', () => {
      owCompileFunctions.compileFunctions();

      expect(
        owCompileFunctions.serverless.service.resources.Resources
      ).to.deep.equal(
        serviceResourcesOpenWhiskResourcesObjectMock.Resources
      );
    });
    */
  });
});
