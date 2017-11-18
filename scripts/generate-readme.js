'use strict';

/**
 * adds content to the repos README.md file
 */
const path = require('path');
const _ = require('lodash');
const ghRepoToUser = require('gh-repo-to-user');
const markdownMagic = require('markdown-magic');
const remoteRequest = require('markdown-magic/lib/utils/remoteRequest');

const config = {
  transforms: {
    GENERATE_SERVERLESS_EXAMPLES_TABLE(content, options) { // eslint-disable-line
      const examplesUrl = 'https://raw.githubusercontent.com/serverless/examples/master/community-examples.json';
      const remoteContent = remoteRequest(examplesUrl);
      var md = '| Project Name | Author |\n'; // eslint-disable-line
      md += '|:-------------|:------:|\n';

      JSON.parse(remoteContent).forEach((data) => {
        const userName = ghRepoToUser(data.githubUrl);
        const profileURL = `http://github.com/${userName}`;
        md += `| **[${_.startCase(data.name)}](${data.githubUrl})** <br/>`;
        md += ` ${data.description} | [${userName}](${profileURL}) | \n`;
      });

      return md.replace(/^\s+|\s+$/g, '');
    },
    GENERATE_SERVERLESS_PLUGIN_TABLE(content, options) { // eslint-disable-line
      const pluginUrl = 'https://raw.githubusercontent.com/serverless/plugins/master/plugins.json';
      const remoteContent = remoteRequest(pluginUrl);
      var md = '| Plugin | Author |\n'; // eslint-disable-line
      md += '|:-------|:------:|\n';

      JSON.parse(remoteContent).sort((a, b) =>  // eslint-disable-line
         a.name < b.name ? -1 : 1
      ).forEach((data) => {
        const userName = ghRepoToUser(data.githubUrl);
        const profileURL = `http://github.com/${userName}`;
        md += `| **[${_.startCase(data.name)}](${data.githubUrl})** <br/>`;
        md += ` ${data.description} | [${userName}](${profileURL}) | \n`;
      });

      return md.replace(/^\s+|\s+$/g, '');
    },
  },
};

const markdownPath = path.join(__dirname, '..', 'README.md');
// const markdownPath = path.join(__dirname, '..', 'test/fixtures/test.md')
markdownMagic(markdownPath, config, () => {
  console.log(`${markdownPath} updated!`); // eslint-disable-line
});
