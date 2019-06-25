'use strict';

const { join } = require('path');
const { readFile, writeFile } = require('fs');
const os = require('os');
const BbPromise = require('bluebird');

const homedir = os.homedir();
const credentialsFilePath = homedir ? join(homedir, '.aws/credentials') : null;

const profileNameRe = /^\[([^\]]+)]\s*$/;
const settingRe = /^([a-zA-Z0-9_]+)\s*=\s*([^\s]+)\s*$/;
const settingMap = new Map([
  ['aws_access_key_id', 'accessKeyId'],
  ['aws_secret_access_key', 'secretAccessKey'],
]);
const parseFileProfiles = content => {
  const profiles = new Map();
  let currentProfile;
  for (const line of content.split(/[\n\r]+/)) {
    const profileNameMatches = line.match(profileNameRe);
    if (profileNameMatches) {
      currentProfile = {};
      profiles.set(profileNameMatches[1], currentProfile);
      continue;
    }
    if (!currentProfile) continue;
    const settingMatches = line.match(settingRe);
    if (!settingMatches) continue;
    let [, settingAwsName] = settingMatches;
    settingAwsName = settingAwsName.toLowerCase();
    const settingName = settingMap.get(settingAwsName);
    if (settingName) currentProfile[settingName] = settingMatches[2];
  }
  for (const [profileName, profileData] of profiles) {
    if (!profileData.accessKeyId || !profileData.secretAccessKey) profiles.delete(profileName);
  }
  return profiles;
};

module.exports = {
  resolveFileProfiles() {
    return new BbPromise((resolve, reject) => {
      if (!credentialsFilePath) {
        resolve(new Map());
        return;
      }
      readFile(credentialsFilePath, { encoding: 'utf8' }, (error, content) => {
        if (error) {
          if (error.code === 'ENOENT') {
            resolve(new Map());
            return;
          }
          reject(error);
          return;
        }
        resolve(parseFileProfiles(content));
      });
    });
  },

  resolveEnvCredentials() {
    if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) return null;
    return {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    };
  },

  saveFileProfiles(profiles) {
    return new BbPromise((resolve, reject) => {
      if (!credentialsFilePath) throw new Error('Could not resolve path to user credentials file');
      const content = `${Array.from(profiles)
        .map(
          ([name, data]) =>
            `[${name}]\naws_access_key_id=${data.accessKeyId}\n` +
            `aws_secret_access_key=${data.secretAccessKey}\n`
        )
        .join('\n')}`;
      writeFile(credentialsFilePath, content, error => {
        if (error) reject(error);
        else resolve();
      });
    });
  },
};
