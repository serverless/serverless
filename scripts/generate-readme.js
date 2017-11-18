'use strict';

/**
 * adds content to the repos README.md file
 */
const path = require('path');
const _ = require('lodash');
const ghRepoToUser = require('gh-repo-to-user');
const mdTable = require('markdown-table');
const markdownMagic = require('markdown-magic');
const remoteRequest = require('markdown-magic/lib/utils/remoteRequest');

const config = {
  transforms: {
    GENERATE_SERVERLESS_EXAMPLES_TABLE(content, options) { // eslint-disable-line
      const examplesUrl = 'https://raw.githubusercontent.com/serverless/examples/master/community-examples.json';
      const remoteContent = remoteRequest(examplesUrl);
      const mdTableData = [
        ['Project Name', 'Author'],
      ];

      JSON.parse(remoteContent).forEach((data) => {
        const userName = ghRepoToUser(data.githubUrl);
        const profileURL = `http://github.com/${userName}`;

        mdTableData.push([
          `**[${_.startCase(data.name)}](${data.githubUrl})** <br/> ${data.description}`,
          `[${userName}](${profileURL})`,
        ]);
      });

      return mdTable(mdTableData, {
        align: ['l', 'c'],
        pad: false,
      });
    },
    GENERATE_SERVERLESS_PLUGIN_TABLE(content, options) { // eslint-disable-line
      const pluginUrl = 'https://raw.githubusercontent.com/serverless/plugins/master/plugins.json';
      const remoteContent = remoteRequest(pluginUrl);
      const mdTableData = [
        ['Plugin', 'Author'],
      ];

      JSON.parse(remoteContent).sort((a, b) =>  // eslint-disable-line
         a.name < b.name ? -1 : 1
      ).forEach((data) => {
        const userName = ghRepoToUser(data.githubUrl);
        const profileURL = `http://github.com/${userName}`;

        mdTableData.push([
          `**[${_.startCase(data.name)}](${data.githubUrl})** <br/> ${data.description}`,
          `[${userName}](${profileURL})`,
        ]);
      });

      return mdTable(mdTableData, {
        align: ['l', 'c'],
        pad: false,
      });
    },
  },
};

const markdownPath = path.join(__dirname, '..', 'README.md');
// const markdownPath = path.join(__dirname, '..', 'test/fixtures/test.md')
markdownMagic(markdownPath, config, () => {
  console.log(`${markdownPath} updated!`); // eslint-disable-line
});
