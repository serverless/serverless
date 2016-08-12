'use strict';

const path = require('path');
const expect = require('chai').expect;
const AwsDeploy = require('../index');
const Serverless = require('../../../../Serverless');

describe('#initializeResources()', () => {
  let serverless;
  let awsDeploy;

  beforeEach(() => {
    serverless = new Serverless();
    awsDeploy = new AwsDeploy(serverless);
  });

  it('should create an empty customProviderResources object for the service', () => awsDeploy
    .initializeResources().then(() => {
      expect(awsDeploy.serverless.service.customProviderResources).to.deep.equal({});
    })
  );

  it('should save the custom provider resources the user has entered', () => {
    const customProviderResourcesMock = {
      fakeResource1: {
        foo: 'bar',
      },
      fakeResource2: {
        baz: 'qux',
      },
    };

    awsDeploy.serverless.service.resources.Resources = customProviderResourcesMock;

    return awsDeploy.initializeResources().then(() => {
      expect(awsDeploy.serverless.service.customProviderResources.Resources)
        .to.deep.equal(customProviderResourcesMock);
    });
  });

  it('should attach the core CloudFormation template to the services resources section', () => {
    const cloudFormationTemplate = awsDeploy.serverless.utils.readFileSync(
      path.join(__dirname,
        '..',
        'lib',
        'core-cloudformation-template.json')
    );

    return awsDeploy.initializeResources().then(() => {
      expect(awsDeploy.serverless.service.resources).to.deep.equal(cloudFormationTemplate);
    });
  });
});
