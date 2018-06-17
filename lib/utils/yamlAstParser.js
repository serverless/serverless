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

const constructPlainObject = (ymlAstContent, branchObject) => {
  const newbranchObject = branchObject || {};
  if (ymlAstContent.mappings && _.isArray(ymlAstContent.mappings)) {
    _.forEach(ymlAstContent.mappings, (v) => {
      if (!v.value) {
        // no need to log twice, parseAST will log errors
        return;
      }

      if (v.key.kind === 0 && v.value.kind === 0) {
        newbranchObject[v.key.value] = v.value.value;
      } else if (v.key.kind === 0 && v.value.kind === 2) {
        newbranchObject[v.key.value] = constructPlainObject(v.value, {});
      } else if (v.key.kind === 0 && v.value.kind === 3) {
        const plainArray = [];
        _.forEach(v.value.items, (c) => {
          plainArray.push(c.value);
        });
        newbranchObject[v.key.value] = plainArray;
      }
    });
  }

  return newbranchObject;
};

const addNewArrayItem = (ymlFile, pathInYml, newValue) =>
fs.readFileAsync(ymlFile, 'utf8').then(yamlContent => {
  const rawAstObject = yaml.load(yamlContent);
  const astObject = parseAST(rawAstObject);
  const plainObject = constructPlainObject(rawAstObject);
  const pathInYmlArray = pathInYml.split('.');

  let currentNode = plainObject;
  for (let i = 0; i < pathInYmlArray.length - 1; i++) {
    const propertyName = pathInYmlArray[i];
    const property = currentNode[propertyName];
    if (_.isUndefined(property) || _.isObject(property)) {
      currentNode[propertyName] = property || {};
      currentNode = currentNode[propertyName];
    } else {
      throw new Error(`${property} can only be undefined or an object!`);
    }
  }

  const arrayPropertyName = _.last(pathInYmlArray);
  let arrayProperty = currentNode[arrayPropertyName];
  if (_.isUndefined(arrayProperty) || _.isArray(arrayProperty)) {
    arrayProperty = arrayProperty || [];
  } else {
    throw new Error(`${arrayProperty} can only be undefined or an array!`);
  }
  currentNode[arrayPropertyName] = _.union(arrayProperty, [newValue]);

  const branchToReplaceName = _.head(pathInYmlArray);
  const newObject = {};
  newObject[branchToReplaceName] = plainObject[branchToReplaceName];
  const newText = yaml.dump(newObject);
  if (astObject[branchToReplaceName]) {
    const beginning = yamlContent
      .substring(0, astObject[branchToReplaceName].parent.key.startPosition);
    const end = yamlContent
      .substring(astObject[branchToReplaceName].endPosition, yamlContent.length);
    return fs.writeFileAsync(ymlFile, `${beginning}${newText}${end}`);
  }
  return fs.writeFileAsync(ymlFile, `${yamlContent}${os.EOL}${newText}`);
});

const removeExistingArrayItem = (ymlFile, pathInYml, removeValue) =>
fs.readFileAsync(ymlFile, 'utf8').then(yamlContent => {
  const rawAstObject = yaml.load(yamlContent);
  const astObject = parseAST(rawAstObject);

  if (astObject[pathInYml] && astObject[pathInYml].items) {
    const plainObject = constructPlainObject(rawAstObject);
    const pathInYmlArray = pathInYml.split('.');

    let currentNode = plainObject;
    const pathInObjectTree = [];
    for (let i = 0; i < pathInYmlArray.length - 1; i++) {
      pathInObjectTree.push(currentNode);
      currentNode = currentNode[pathInYmlArray[i]];
    }
    const arrayPropertyName = _.last(pathInYmlArray);
    const arrayProperty = currentNode[arrayPropertyName];
    _.pull(arrayProperty, removeValue);

    if (_.isEmpty(arrayProperty)) {
      _.unset(currentNode, arrayPropertyName);
      pathInObjectTree.push(currentNode);
      for (let i = pathInObjectTree.length - 1; i > 0; i--) {
        if (_.keys(pathInObjectTree[i]).length > 0) {
          break;
        }
        _.unset(pathInObjectTree[i - 1], pathInYmlArray[i - 1]);
      }
    }

    const headObjectPath = _.head(pathInYmlArray);
    let newText = '';

    if (plainObject[headObjectPath]) {
      const newObject = {};
      newObject[headObjectPath] = plainObject[headObjectPath];
      newText = yaml.dump(newObject);
    }
    const beginning = yamlContent.substring(0, astObject[headObjectPath].parent.key.startPosition);
    const end = yamlContent.substring(astObject[pathInYml].endPosition, yamlContent.length);
    return fs.writeFileAsync(ymlFile, `${beginning}${newText}${end}`);
  }
  return BbPromise.resolve();
});

module.exports = {
  addNewArrayItem,
  removeExistingArrayItem,
};
