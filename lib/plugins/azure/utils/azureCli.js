'use strict';

const BbPromise = require('bluebird');
const spawn = require('./spawn');

const SUCCEEDED = 'Succeeded';
const STATUS_CHANGE_WAIT = 5 * 1000; // ms
const STATUS_START_TTL = 30;

function showResourceGroup(resourceGroup) {
  return spawn(`azure group show ${resourceGroup} --json`)
    .then(JSON.parse);
}

function waitForGroupSucccess(group, ttl) {
  return new BbPromise((resolve, reject) => {
    showResourceGroup(group).then(result => {
      if (result.properties.provisioningState === SUCCEEDED) {
        return resolve(result);
      }

      if (ttl > 0) {
        return setTimeout(() => waitForGroupSucccess(group, ttl - 1), STATUS_CHANGE_WAIT);
      }

      return reject(result);
    })
    .catch(() => setTimeout(() => waitForGroupSucccess(group, ttl - 1), STATUS_CHANGE_WAIT));
  });
}

function waitForGroupDeleted(resourceGroup) {
  return new BbPromise(resolve => {
    showResourceGroup(resourceGroup)
      .then(() => setTimeout(() => waitForGroupDeleted(resourceGroup), STATUS_CHANGE_WAIT))
      .catch(() => resolve());
  });
}

function createResourceGroup(resourceGroup, location) {
  return spawn(`azure group create --json -n "${resourceGroup}" -l "${location}"`)
    .then(JSON.parse);
}

function deleteResourceGroup(resourceGroup) {
  return spawn(`azure group delete ${resourceGroup} --json -q`)
    .then(() => waitForGroupDeleted(resourceGroup, STATUS_START_TTL));
}

function deployResourceGroup(templatePath, parametersPath, resourceGroup, deploymentName) {
  const params = `-f ${templatePath} -e ${parametersPath} ${resourceGroup} ${deploymentName}`;
  const cmd = `azure group deployment create --json ${params}`;
  return spawn(cmd)
    .then(() => waitForGroupSucccess(resourceGroup, STATUS_START_TTL));
}

function setMode(mode) {
  return spawn(`azure config mode ${mode}`);
}

module.exports = {
  createResourceGroup,
  deleteResourceGroup,
  deployResourceGroup,
  showResourceGroup,
  setMode,
};
