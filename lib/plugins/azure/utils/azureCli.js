'use strict';

function createResourceGroup(name, location) {
  spawn(`azure group create  --json -n "${name}" -l "${location}"`);
}

function deleteResourceGroup(name) {
  spawn(`azure group delete --json -f ${name}`);
}

function deployResourceGroup(templatePath, parametersPath, resourceGroup, deploymentName) {
  spawn(`azure group deployment create  --json -f ${templatePath} -e ${parametersPath} ${resourceGroup} ${deploymentName}`);
}

function showResourceGroup(name) {
  spawn(`azure group show --json ${name}`)
}

function setMode(mode) {
  spawn(`azure config mode ${mode}`)
}

module.exports = {
    createResourceGroup,
    deleteResourceGroup,
    deployResourceGroup,
    showResourceGroup,
    setMode
};