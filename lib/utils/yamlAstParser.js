'use strict';
const yaml = require('yaml-ast-parser');
const fs = require('fs');
const _ = require('lodash');
const os = require('os');

const astObject = {};
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

const parseAST = (ymlAstContent) => {
  if (ymlAstContent.mappings && _.isArray(ymlAstContent.mappings)) {
    _.forEach(ymlAstContent.mappings, (v) => {
      if (v.key.kind === 0 && v.value.kind === 0) {
        astObject[findKeyChain(v)] = v.value;
      } else if (v.key.kind === 0 && v.value.kind === 2) {
        parseAST(v.value);
      } else if (v.key.kind === 0 && v.value.kind === 3) {
        astObject[findKeyChain(v)] = v.value;
        parseAST(v.value);
      }
    });
  } else if (ymlAstContent.items && _.isArray(ymlAstContent.items)) {
    _.forEach(ymlAstContent.items, (v, i) => {
      if (v.kind === 0) {
        const key = `${findKeyChain(ymlAstContent.parent)}[${i}]`;
        astObject[key] = v;
      }
    });
  }
};

const addNewArrayItem = (ymlFile, pathInYml, newValue) => {
  const yamlContent = fs.readFileSync(ymlFile, 'utf8');
  const yamlAST = yaml.load(yamlContent);
  parseAST(yamlAST, astObject);

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

    const beginning = yamlContent.substring(0, astObject[pathInYml].parent.key.startPosition);
    const end = yamlContent.substring(astObject[pathInYml].endPosition, yamlContent.length);
    fs.writeFileSync(ymlFile, `${beginning}${yaml.dump(JSON.parse(newObject))}${end}`);
  } else {
    const pathInYmlArrray = pathInYml.split('.');
    let newObject;
    _.forEach(pathInYmlArrray.reverse(), (v) => {
      newObject = `{"${v}":["${newValue}"]}`;
    });

    const beginning = yamlContent.substring(0, yamlContent.length);
    fs.writeFileSync(ymlFile, `${beginning}${os.EOL}${yaml.dump(JSON.parse(newObject))}`);
  }
};

const removeExistingArrayItem = (ymlFile, pathInYml, removeValue) => {
  const yamlContent = fs.readFileSync(ymlFile, 'utf8');
  const yamlAST = yaml.load(yamlContent);
  parseAST(yamlAST, astObject);

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

    const beginning = yamlContent.substring(0, astObject[pathInYml].parent.key.startPosition);
    const end = yamlContent.substring(astObject[pathInYml].endPosition, yamlContent.length);
    fs.writeFileSync(ymlFile, `${beginning}${newText}${end}`);
  }
};

module.exports = {
  addNewArrayItem,
  removeExistingArrayItem,
};
