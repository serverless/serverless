'use strict';

const path = require('path');
const fs = require('fs');
const gql = require('graphql-tag');
const jwtDecode = require('jwt-decode');
const fsExtra = require('../../utils/fs/fse');
// const userStats = require('../../utils/userStats');
const fetch = require('node-fetch');
const configUtils = require('../../utils/config');
const functionInfoUtils = require('../../utils/functionInfoUtils');
const createApolloClient = require('../../utils/createApolloClient');

// TODO... patching globals is very very bad. Needed for apollo to work

global.fetch = fetch;

// TODO move elsewhere
function addReadme(attributes, readmePath) {
  if (fs.existsSync(readmePath)) {
    const readmeContent = fsExtra.readFileSync(readmePath).toString('utf8');
    attributes.readme = readmeContent; // eslint-disable-line
  }
  return attributes;
}

// TODO move elsewhere
function publishService(service, client) {
  return client
    .mutate({
      mutation: gql`
      mutation publishService($service: ServicePublishInputType!) {
        publishService(service: $service) {
          name
        }
      }
    `,
      variables: {
        service,
      },
    })
    .then(response => response.data);
}

// TODO move elsewhere
const config = {
  PLATFORM_FRONTEND_BASE_URL: 'https://platform.serverless.com/',
  GRAPHQL_ENDPOINT_URL: 'https://graphql.serverless.com/graphql',
};

// TODO move elsewhere
function fetchEndpoint(provider, stage, region) {
  return provider
    .request(
      'CloudFormation',
      'describeStacks',
      { StackName: provider.naming.getStackName(stage) },
      stage,
      region
    )
    .then(result => {
      let endpoint = null;

      if (result) {
        result.Stacks[0].Outputs
          .filter(x =>
            // eslint-disable-line
            x.OutputKey.match(provider.naming.getServiceEndpointRegex())
          )
          .forEach(x => {
            endpoint = x.OutputValue;
          });
      }

      return endpoint;
    });
}

class Platform {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options;

    this.hooks = {
      'after:deploy:deploy': this.publishService.bind(this),
    };
  }
  publishService() {
    this.serverless.cli.log('Publish service to Serverless Platform...');
    const userConfig = configUtils.getConfig();
    const currentId = userConfig.userId;
    const globalConfig = configUtils.getGlobalConfig();
    let authToken;
    if (globalConfig.users && globalConfig.users[currentId] && globalConfig.users[currentId].auth) {
      authToken = globalConfig.users[currentId].auth.id_token;
    }
    // console.log('authToken', authToken)
    if (!authToken) {
      console.log('no auth token found for', currentId); // eslint-disable-line
      return undefined;
    }

    const clientWithAuth = createApolloClient(config.GRAPHQL_ENDPOINT_URL, authToken);

    const provider = this.serverless.getProvider('aws');
    const region = this.serverless.service.provider.region;
    const stage = this.serverless.processedInput.options.stage;

    return provider.getAccountId().then(accountId => {
      fetchEndpoint(provider, stage, region).then(endpoint => {
        const funcs = this.serverless.service.getAllFunctions().map(key => {
          const arnName = functionInfoUtils.getArnName(key, this.serverless);
          let funcAttributes = {
            name: key,
            runtime: functionInfoUtils.getRuntime(key, this.serverless),
            memory: functionInfoUtils.getMemorySize(key, this.serverless),
            timeout: functionInfoUtils.getTimeout(key, this.serverless),
            provider: this.serverless.service.provider.name,
            originId: `arn:aws:lambda:${region}:${accountId}:function:${arnName}`,
            endpoints: functionInfoUtils.getEndpoints(key, this.serverless, endpoint),
          };
          if (this.serverless.service.functions[key].readme) {
            funcAttributes = addReadme(
              funcAttributes,
              this.serverless.service.functions[key].readme
            ); // eslint-disable-line
          }
          if (this.serverless.service.functions[key].description) {
            funcAttributes.description = this.serverless.service.functions[key].description;
          }
          return funcAttributes;
        });

        const serviceData = {
          name: this.serverless.service.service,
          stage: this.serverless.processedInput.options.stage,
          functions: funcs,
        };
        if (this.serverless.service.serviceObject.description) {
          serviceData.description = this.serverless.service.serviceObject.description;
        }
        if (this.serverless.service.serviceObject.license) {
          serviceData.license = this.serverless.service.serviceObject.license;
        }
        if (this.serverless.service.serviceObject.bugs) {
          serviceData.bugs = this.serverless.service.serviceObject.bugs;
        }
        if (this.serverless.service.serviceObject.repository) {
          serviceData.repository = this.serverless.service.serviceObject.repository;
        }
        if (this.serverless.service.serviceObject.homepage) {
          serviceData.homepage = this.serverless.service.serviceObject.homepage;
        }

        // TODO make sure it caputures multiple variations of readme file name
        const readmePath = path.join(this.serverless.config.servicePath, 'README.md');
        const serviceDataWithReadme = addReadme(serviceData, readmePath);

        // write to manifests.json file

        // publish to platform
        publishService(serviceDataWithReadme, clientWithAuth)
          .then(() => {
            const username = jwtDecode(authToken).nickname;
            const serviceName = this.serverless.service.service;
            const url = `${config.PLATFORM_FRONTEND_BASE_URL}services/${username}/${serviceName}`;
            this.serverless.cli.log(`Your service is available at ${url}`);
          })
          .catch(error => {
            this.serverless.cli.log(
              "Couldn't publish this deploy information to the Serverless Platform due: \n",
              error
            );
          });
      });
    });
  }
}

module.exports = Platform;
