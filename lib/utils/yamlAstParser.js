'use strict';

const yaml = require('yaml-ast-parser');
const BbPromise = require('bluebird');
const fs = BbPromise.promisifyAll(require('fs'));
const _ = require('lodash');
const os = require('os');
const chalk = require('chalk');
const log = require('./log/serverlessLog');

const findKeyChain = (astContent) => {
  let content = astContent;
  const chain = [
    content.key.value,
  ];
  while (content.parent) {
    content = content.parent;
    if (content.key) {
      chain.push(content.key.value);
    }
  }
  return chain.reverse().join('.');
};

const parseAST = (ymlAstContent, astObject) => {
  let newAstObject = astObject || {};
  if (ymlAstContent.mappings && _.isArray(ymlAstContent.mappings)) {
    _.forEach(ymlAstContent.mappings, (v) => {
      if (!v.value) {
        const errorMessage = [
          'Serverless: ',
          `${chalk.red('Your serverless.yml has an invalid value with key:')} `,
          `${chalk.red(`"${v.key.value}"`)}`,
        ].join('');
        log(errorMessage);
        return;
      }

      if (v.key.kind === 0 && v.value.kind === 0) {
        newAstObject[findKeyChain(v)] = v.value;
      } else if (v.key.kind === 0 && v.value.kind === 2) {
        newAstObject[findKeyChain(v)] = v.value;
        newAstObject = parseAST(v.value, newAstObject);
      } else if (v.key.kind === 0 && v.value.kind === 3) {
        newAstObject[findKeyChain(v)] = v.value;
        newAstObject = parseAST(v.value, newAstObject);
      }
    });
  } else if (ymlAstContent.items && _.isArray(ymlAstContent.items)) {
    _.forEach(ymlAstContent.items, (v, i) => {
      if (v.kind === 0) {
        const key = `${findKeyChain(ymlAstContent.parent)}[${i}]`;
        newAstObject[key] = v;
      }
    });
  }

  return newAstObject;
};

const addNewArrayItem = (ymlFile, pathInYml, newValue) =>
fs.readFileAsync(ymlFile, 'utf8').then(yamlContent => {
  const astObject = parseAST(yaml.load(yamlContent));

  if (astObject[pathInYml] && astObject[pathInYml].items) {
    let newArray = [];
    _.forEach(astObject[pathInYml].items, (v) => {
      newArray.push(v.value);
    });
    newArray = _.union(newArray, [newValue]);

    const pathInYmlArrray = pathInYml.split('.');
    let newObject = JSON.stringify(newArray);
    _.forEach(pathInYmlArrray.reverse(), (v) => {
      newObject = `{"${v}":${newObject}}`;
    });

    const beginning = yamlContent.substring(0, astObject[_.head(_.split(pathInYml, '.'))]
      .parent.key.startPosition);
    const end = yamlContent.substring(astObject[pathInYml].endPosition, yamlContent.length);
    return fs.writeFileAsync(ymlFile, `${beginning}${yaml.dump(JSON.parse(newObject))}${end}`);
  }
  const pathInYmlArrray = pathInYml.split('.');
  let newObject = JSON.stringify([newValue]);
  _.forEach(pathInYmlArrray.reverse(), (v) => {
    newObject = `{"${v}":${newObject}}`;
  });
  const beginning = yamlContent.substring(0, yamlContent.length);
  return fs.writeFileAsync(ymlFile, `${beginning}${os.EOL}${yaml.dump(JSON.parse(newObject))}`);
});

const removeExistingArrayItem = (ymlFile, pathInYml, removeValue) =>
fs.readFileAsync(ymlFile, 'utf8').then(yamlContent => {
  const astObject = parseAST(yaml.load(yamlContent));

  if (astObject[pathInYml] && astObject[pathInYml].items) {
    const newArray = [];
    let newText = '';
    _.forEach(astObject[pathInYml].items, (v) => {
      newArray.push(v.value);
    });
    _.pull(newArray, removeValue);

    if (!_.isEmpty(newArray)) {
      const pathInYmlArrray = pathInYml.split('.');
      let newObject = JSON.stringify(newArray);
      _.forEach(pathInYmlArrray.reverse(), (v) => {
        newObject = `{"${v}":${newObject}}`;
      });
      newText = yaml.dump(JSON.parse(newObject));
    }

    const beginning = yamlContent.substring(0, astObject[_.head(_.split(pathInYml, '.'))]
      .parent.key.startPosition);
    const end = yamlContent.substring(astObject[pathInYml].endPosition, yamlContent.length);
    return fs.writeFileAsync(ymlFile, `${beginning}${newText}${end}`);
  }
  return BbPromise.resolve();
});

module.exports = {
  addNewArrayItem,
  removeExistingArrayItem,
};
