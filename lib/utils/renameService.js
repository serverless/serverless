const path = require('path');
const fse = require('fs-extra');

const fileExistsSync = require('./fs/fileExistsSync');
const readFileSync = require('./fs/readFileSync');
const writeFileSync = require('./fs/writeFileSync');
const ServerlessError = require('../classes/Error').ServerlessError;

function renameService(name, servicePath) {
  const serviceFile = path.join(servicePath, 'serverless.yml');
  const packageFile = path.join(servicePath, 'package.json');

  if (!fileExistsSync(serviceFile)) {
    const errorMessage = [
      'serverless.yml not found in',
      ` ${servicePath}`,
    ].join('');
    throw new ServerlessError(errorMessage);
  }

  const serverlessYml =
    fse.readFileSync(serviceFile, 'utf-8')
      .replace(/service\s*:.+/gi, (match) => {
        const fractions = match.split('#');
        fractions[0] = `service: ${name}`;
        return fractions.join(' #');
      });

  fse.writeFileSync(serviceFile, serverlessYml);

  if (fileExistsSync(packageFile)) {
    const json = readFileSync(packageFile);
    writeFileSync(packageFile, Object.assign(json, { name }));
  }

  return name;
}

module.exports.renameService = renameService;
