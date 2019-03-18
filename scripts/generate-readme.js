'use strict';

/**
 * adds content to the repos README.md file
 */
const path = require('path');
const _ = require('lodash');
const mdTable = require('markdown-table');
const parseGithubURL = require('parse-github-url');
const mdLink = require('markdown-link');
const markdownMagic = require('markdown-magic');
const remoteRequest = require('markdown-magic/lib/utils/remoteRequest');

function getExamplesList() {
  const examplesUrl = 'https://raw.githubusercontent.com/serverless/examples/master/community-examples.json';
  const remoteContent = remoteRequest(examplesUrl);

  return JSON.parse(remoteContent);
}

function getPluginsList() {
  const pluginUrl = 'https://raw.githubusercontent.com/serverless/plugins/master/plugins.json';
  const remoteContent = remoteRequest(pluginUrl);

  return JSON.parse(remoteContent).sort((a, b) =>  // eslint-disable-line
    a.name < b.name ? -1 : 1
  );
}

function getTableRow(name, description, url) {
  const { owner } = parseGithubURL(url);
  const profileURL = `http://github.com/${owner}`;

  return [
    `**${mdLink(_.startCase(name), url)}** <br/> ${description}`,
    `${mdLink(owner, profileURL)}`,
  ];
}

function getReadmeTable(rowsData, columns) {
  const mdTableData = [columns];

  rowsData.forEach(({ name, description, githubUrl }) => {
    const tableRow = getTableRow(name, description, githubUrl);
    mdTableData.push(tableRow);
  });

  return mdTable(mdTableData, {
    align: ['l', 'c'],
    pad: false,
  });
}

const config = {
  transforms: {
    GENERATE_SERVERLESS_EXAMPLES_TABLE(content, options) { // eslint-disable-line
      const examplesList = getExamplesList();

      return getReadmeTable(examplesList, ['Project Name', 'Author']);
    },
    GENERATE_SERVERLESS_PLUGIN_TABLE(content, options) { // eslint-disable-line
      const pluginsList = getPluginsList();

      return getReadmeTable(pluginsList, ['Plugin', 'Author']);
    },
  },
};

const markdownPath = path.join(__dirname, '..', 'README.md');
// const markdownPath = path.join(__dirname, '..', 'test/fixtures/test.md')
markdownMagic(markdownPath, config, () => {
  console.log(`${markdownPath} updated!`); // eslint-disable-line
});
