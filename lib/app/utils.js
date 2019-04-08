/* eslint-disable no-use-before-define */

const traverse = require('traverse');
const { DepGraph } = require('dependency-graph');

const walkDirSync = require('../utils/fs/walkDirSync');
const readFileSync = require('../utils/fs/readFileSync');

function findServerlessFiles() {
  const paths = walkDirSync(process.cwd());
  // TODO: extend so that other serverless files are detected as well
  return paths.filter(p => p.includes('serverless.yml'));
}

function createDag(serverlessFilePaths) {
  const dag = new DepGraph();

  if (serverlessFilePaths.length) {
    // add all files to the DAG
    serverlessFilePaths.forEach(p => dag.addNode(p));

    // check for innder-dependencies based on state retrieval
    serverlessFilePaths.forEach(currPath => {
      const content = readFileSync(currPath);
      traverse(content).forEach((x) => {
        if (typeof x === 'string') {
          if (x.match(/\$\{state/)) {
            const service = extractServiceFromStateVar(x);
            const dependencyPath = serverlessFilePaths
              .filter(p => p.match(new RegExp(service))).shift();
            dag.addDependency(currPath, dependencyPath);
          }
        }
      });
    });
  }

  return dag;
}

function extractServiceFromStateVar(variable) {
  // removing `${state` and `}`
  variable = variable.slice(8, -1); // eslint-disable-line no-param-reassign
  const splitted = variable.split('.');
  return splitted[2];
}

module.exports = {
  findServerlessFiles,
  createDag,
  extractServiceFromStateVar,
};
