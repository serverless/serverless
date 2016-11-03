'use strict';

const BbPromise = require('bluebird');
const chalk = require('chalk');

module.exports = {
  setupGatheredDataObject() {
    const gatheredData = {};

    return BbPromise.resolve(gatheredData);
  },

  getGeneralInfo(gatheredData) {
    const service = this.serverless.service.service;
    const project = process.env.GCLOUD_PROJECT;
    const stage = this.options.stage;
    const region = this.options.region;

    const updatedGatheredData = gatheredData;

    updatedGatheredData.general = {
      service,
      project,
      stage,
      region,
    };

    return BbPromise.resolve(updatedGatheredData);
  },

  getDeployedFunctionsInfo(gatheredData) {
    const project = process.env.GCLOUD_PROJECT;
    const region = this.options.region;

    const params = {
      location: `projects/${project}/locations/${region}`,
    };

    return this.provider.request('functions', 'list', params)
      .then((result) => {
        const deployedFunctions = [];

        if (result.functions) {
          result.functions.forEach((func) => {
            const funcObject = {};

            funcObject.name = func.name.split('/').pop();

            funcObject.events = [];
            // extract all the used events
            const keys = Object.keys(func);
            keys.forEach((key) => {
              if (key.match('Trigger')) {
                let type = '';
                let entryPoint = '';

                // TODO: update this part so that it supports multiple events of the same type
                if (key === 'httpsTrigger') {
                  type = 'http';
                  entryPoint = func[key].url;
                } else if (key === 'pubsubTrigger') {
                  type = 'pubSub';
                  entryPoint = func[key].split('/').pop();
                } else if (key === 'gcsTrigger') {
                  type = 'bucket';
                  entryPoint = func[key];
                }

                const event = {
                  type,
                  entryPoint,
                };
                funcObject.events.push(event);
              }
            });

            deployedFunctions.push(funcObject);
          });
        }

        const updatedGatheredData = gatheredData;
        updatedGatheredData.deployedFunctions = deployedFunctions;

        return updatedGatheredData;
      });
  },

  display(gatheredData) {
    const general = gatheredData.general;
    const deployedFunctions = gatheredData.deployedFunctions;

    let message = '';

    // get all the service related information
    message += `${chalk.yellow.underline('Service Information')}\n`;
    message += `${chalk.yellow('service:')} ${general.service}\n`;
    message += `${chalk.yellow('project:')} ${general.project}\n`;
    message += `${chalk.yellow('stage:')} ${general.stage}\n`;
    message += `${chalk.yellow('region:')} ${general.region}\n`;

    message += '\n';

    // get all the function information
    message += `${chalk.yellow.underline('Deployed functions')}\n`;
    if (deployedFunctions.length) {
      deployedFunctions.forEach((func) => {
        message += `${chalk.yellow(func.name)}\n`;
        if (func.events.length) {
          func.events.forEach((event) => {
            message += `  ${event.type}: ${event.entryPoint}\n`;
          });
        } else {
          message += '  No events defined\n';
        }
      });
    } else {
      message += 'There are no functions deployed yet\n';
    }

    this.serverless.cli.consoleLog(message);

    return BbPromise.resolve();
  },

  displayServiceInfo() {
    return BbPromise.bind(this)
      .then(this.setupGatheredDataObject)
      .then(this.getGeneralInfo)
      .then(this.getDeployedFunctionsInfo)
      .then(this.display);
  },
};
