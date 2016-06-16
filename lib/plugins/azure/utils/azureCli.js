'use strict';

const spawn = require('./spawn');

function createResourceGroup(name, location) {
  return spawn(`azure group create --json -n "${name}" -l "${location}"`).then(JSON.parse);
}

function deleteResourceGroup(name) {
  return spawn(`azure group delete ${name} --json -q`);
}

function deployResourceGroup(templatePath, parametersPath, resourceGroup, deploymentName) {
  return spawn(`azure group deployment create  --json -f ${templatePath} -e ${parametersPath} ${resourceGroup} ${deploymentName}`).then(JSON.parse);
}

function showResourceGroup(name) {
  return spawn(`azure group show ${name} --json`).then(JSON.parse);
}

function setMode(mode) {
  return spawn(`azure config mode ${mode}`);
}

module.exports = {
  createResourceGroup,
  deleteResourceGroup,
  deployResourceGroup,
  showResourceGroup,
  setMode
};