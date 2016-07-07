'use strict';

const path = require('path');
const BbPromise = require('bluebird');
const fs = require('fs-extra')

const ENV_PARAMS = ['OW_APIHOST', 'OW_AUTH', 'OW_NAMESPACE'];

function getWskPropsFile () {
  const Home = process.env[(process.platform == 'win32') ? 'USERPROFILE' : 'HOME'];
  return path.format({dir: Home, base: '.wskprops'});
};

function readWskPropsFile () {
    const path = getWskPropsFile()

    return new Promise((resolve, reject) => {
      fs.readFile(path, 'utf8', (err, data) => {
        if (err) data = "";
        resolve(data);
      });
    })
};

function getWskProps () {
  return readWskPropsFile().then(data => {
    if (!data) return {}

    return data.trim().split('\n')
    .map(line => line.split('='))
    .reduce((params, key_value) => {
      params[key_value[0].toLowerCase()] = key_value[1]; 
      return params
    }, {})
  })
};

function getWskEnvProps () {
  const envProps = {};
  ENV_PARAMS.forEach((envName) => {
    if (process.env[envName]) envProps[envName.slice(3).toLowerCase()] = process.env[envName]
  })
  return envProps
};

module.exports = {
  getWskProps: function () {
    return getWskProps()
      .then(props => Object.assign(props, getWskEnvProps()))
  }
}
