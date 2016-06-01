'use strict';

const AwsDeploy = require('../awsDeploy');
const Serverless = require('../../../Serverless');
const os = require('os');
const path = require('path');

const tmpDirPath = path.join(os.tmpdir(), (new Date).getTime().toString());

const serverless = new Serverless();
serverless.service.service = `service-${(new Date).getTime().toString()}`;
serverless.config.servicePath = tmpDirPath;
const options = {
  stage: 'dev',
  region: 'us-east-1',
};
const serverlessEnvYamlPath = path.join(tmpDirPath, 'serverless.env.yaml');
const serverlessEnvYaml = {
  vars: {},
  stages: {
    dev: {
      vars: {},
      regions: {
        aws_useast1: {
          vars: {},
        },
      },
    },
  },
};
serverless.utils.writeFileSync(serverlessEnvYamlPath, serverlessEnvYaml);

const awsDeploy = new AwsDeploy(serverless, options);

describe('test', () => {
  this.timeout(0);
  after((done) => {
    done();
  });
  it('test case', (done) => {
    this.timeout(0);
    awsDeploy.deployCore().then(() => serverless.yamlParser.parse(serverlessEnvYamlPath))
      .then((yaml) => {
        console.log(yaml);
        done();
      });
  });
});
