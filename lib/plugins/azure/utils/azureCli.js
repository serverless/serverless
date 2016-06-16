'use strict';

const spawn = require('./spawn');

function createResourceGroup(name, location) {
  return spawn(`azure group create  --json -n "${name}" -l "${location}"`);
}

function deleteResourceGroup(name) {
  return spawn(`azure group delete ${name} --json -q`);
}

function deployResourceGroup(templatePath, parametersPath, resourceGroup, deploymentName) {
  return spawn(`azure group deployment create  --json -f ${templatePath} -e ${parametersPath} ${resourceGroup} ${deploymentName}`);
}

function showResourceGroup(name) {
  return spawn(`azure group show --json ${name}`);
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