'use strict';

const path = require('path');
const globby = require('globby');
const requireUncached = require('ncjsm/require-uncached');
const { listZipFiles } = require('../../../../../utils/fs');
const { expect } = require('chai');

// The directory that holds the files that generateZip zips up
const resourcesDir = path.resolve(
  __dirname,
  '../../../../../../lib/plugins/aws/custom-resources/resources/'
);

describe('test/unit/lib/plugins/aws/customResources/generateZip.test.js', () => {
  describe('when generating a zip file', () => {
    it('should generate a zip file with the contents of the resources directory', async () => {
      const zipFilePath = await requireUncached(async () =>
        require('../../../../../../lib/plugins/aws/custom-resources/generate-zip')()
      );

      // List the files in the zip to make sure it is valid
      const filesInZip = await listZipFiles(zipFilePath);

      const filesInResourceDir = await globby('**', { cwd: resourcesDir });
      expect(filesInZip).to.have.all.members(filesInResourceDir);
    });
  });
});
