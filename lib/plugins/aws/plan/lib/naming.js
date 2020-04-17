'use strict';
const getS3EndpointForRegion = require('../../utils/getS3EndpointForRegion');

function getStackName(plugin) {
  return plugin.provider.naming.getStackName();
}

function getChangeSetS3FolderPath(plugin) {
  return plugin.serverless.service.package.artifactDirectoryName;
}

function getChangeSetS3FolderUrl(plugin) {
  const s3Endpoint = getS3EndpointForRegion(plugin.provider.getRegion());
  const bucketName = plugin.bucketName;
  const s3Folder = getChangeSetS3FolderPath(plugin);
  return `https://${s3Endpoint}/${bucketName}/${s3Folder}`;
}

function getChangeSetS3CompiledTemplateUrl(plugin) {
  const s3FolderUrl = getChangeSetS3FolderUrl(plugin);
  const compiledTemplateFileName = plugin.provider.naming.getCompiledTemplateS3Suffix();
  return `${s3FolderUrl}/${compiledTemplateFileName}`;
}

module.exports = {
  getStackName,
  getChangeSetS3FolderPath,
  getChangeSetS3FolderUrl,
  getChangeSetS3CompiledTemplateUrl,
};
