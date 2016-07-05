'use strict';

const path = require('path');
const BbPromise = require('bluebird');

const getWskPropsFile = () => {
  const Home = process.env[(process.platform == 'win32') ? 'USERPROFILE' : 'HOME'];

  return path.format({
    dir: Home,
    base: '.wskprops'
  });
};

const readWskPropsFile = () => {
  const path = getWskPropsFile()

  return new Promise((resolve, reject) => {
    fs.readFile(path, (err, data) => {
      if (err) throw err;
      console.log(data);
    });
  })
}

module.exports = {
  initializeResources() {

    

    this.serverless.service.resources.openwhisk = {
      namespace: '',
      endpoint: '',
      auth: ''
    };

    return BbPromise.resolve();
  },
};
