'use strict'

const path = require('path')
const fs = require('fs')
const fse = require('fs-extra')
const crypto = require('crypto')
const yaml = require('js-yaml')
const JSZip = require('jszip')

const tmpDirCommonPath = require('@serverless/test/process-tmp-dir')

function getTmpDirPath() {
  return path.join(tmpDirCommonPath, crypto.randomBytes(8).toString('hex'))
}

function getTmpFilePath(fileName) {
  return path.join(getTmpDirPath(), fileName)
}

function createTmpDir() {
  const dirPath = getTmpDirPath()
  fse.ensureDirSync(dirPath)
  return dirPath
}

function createTmpFile(name) {
  const filePath = getTmpFilePath(name)
  fse.ensureFileSync(filePath)
  return filePath
}

function replaceTextInFile(filePath, subString, newSubString) {
  const fileContent = fs.readFileSync(filePath).toString()
  fs.writeFileSync(filePath, fileContent.replace(subString, newSubString))
}

function readYamlFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8')
  return yaml.load(content)
}

function writeYamlFile(filePath, content) {
  const data = yaml.dump(content)
  fs.writeFileSync(filePath, data)
  return data
}

function listZipFiles(filename) {
  return new JSZip()
    .loadAsync(fs.readFileSync(filename))
    .then((zip) => Object.keys(zip.files))
}

async function listFileProperties(filename) {
  const zip = await new JSZip().loadAsync(fs.readFileSync(filename))
  return zip.files
}

module.exports = {
  tmpDirCommonPath,
  getTmpDirPath,
  getTmpFilePath,
  createTmpDir,
  createTmpFile,
  replaceTextInFile,
  readYamlFile,
  writeYamlFile,
  listZipFiles,
  listFileProperties,
}
