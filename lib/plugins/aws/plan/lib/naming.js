'use strict';

function getStackName(plugin) {
  return plugin.provider.naming.getStackName();
}

function getChangeSetName(plugin) {
  return plugin.changeSetName;
}

function getS3BucketName(plugin) {
  return plugin.bucketName;
}

function getChangeSetS3FolderPath(plugin) {
  return plugin.serverless.service.package.artifactDirectoryName;
}

function getChangeSetS3FolderUrl(plugin) {
  const bucketName = getS3BucketName(plugin);
  const s3Folder = getChangeSetS3FolderPath(plugin);
  return `https://s3.amazonaws.com/${bucketName}/${s3Folder}`;
}

function getChangeSetS3CompiledTemplateUrl(plugin) {
  const s3FolderUrl = getChangeSetS3FolderUrl(plugin);
  const compiledTemplateFileName = plugin.provider.naming.getCompiledTemplateS3Suffix();
  return `${s3FolderUrl}/${compiledTemplateFileName}`;
}

module.exports = {
  getStackName,
  getChangeSetName,
  getS3BucketName,
  getChangeSetS3FolderPath,
  getChangeSetS3FolderUrl,
  getChangeSetS3CompiledTemplateUrl,
};
