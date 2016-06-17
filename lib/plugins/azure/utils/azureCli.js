'use strict';

const BbPromise = require('bluebird');
const spawn = require('./spawn');

const SUCCEEDED = "Succeeded";
const STATUS_CHANGE_WAIT_TIME = 5 * 1000; // ms
const STATUS_START_TTL = 30;

function createResourceGroup(resourceGroup, location) {
  return spawn(`azure group create --json -n "${resourceGroup}" -l "${location}"`).then(JSON.parse);
}

function deleteResourceGroup(resourceGroup) {
  return spawn(`azure group delete ${resourceGroup} --json -q`).then(() => {
    return waitForResourceGroupDeleted(resourceGroup, STATUS_START_TTL);
  });
}

function deployResourceGroup(templatePath, parametersPath, resourceGroup, deploymentName) {
  return spawn(`azure group deployment create  --json -f ${templatePath} -e ${parametersPath} ${resourceGroup} ${deploymentName}`).then((result) => {
    console.log('deploy finished');
    return waitForResourceGroupSucceeded(resourceGroup, STATUS_START_TTL);
  });
}

function showResourceGroup(resourceGroup) {
  return spawn(`azure group show ${resourceGroup} --json`).then(JSON.parse);
}

function setMode(mode) {
  return spawn(`azure config mode ${mode}`);
}

function waitForResourceGroupSucceeded(resourceGroup, ttl) {
  return new BbPromise((resolve, reject) => {
    showResourceGroup(resourceGroup).then( (result) => {
      if (result.properties.provisioningState === SUCCEEDED) {
        resolve(result);
      } else {
        if (ttl > 0) {
          return setTimeout( () => waitForResourceGroupSucceeded(resourceGroup, ttl - 1), STATUS_CHANGE_WAIT_TIME);
        } else {
          reject(result);
        }
      }
    }).catch( () => {
      return setTimeout( () => waitForResourceGroupSucceeded(resourceGroup, ttl - 1), STATUS_CHANGE_WAIT_TIME);
    });
  });
}

function waitForResourceGroupDeleted(resourceGroup, ttl) {
  return new BbPromise((resolve, reject) => {
    showResourceGroup(resourceGroup).then(JSON.parse).then( (result) => {
      return setTimeout( () => waitForResourceGroupDeleted(resourceGroup), STATUS_CHANGE_WAIT_TIME);
    }).catch( () => {
      resolve();
    });
  });
}

module.exports = {
  createResourceGroup,
  deleteResourceGroup,
  deployResourceGroup,
  showResourceGroup,
  setMode
};
