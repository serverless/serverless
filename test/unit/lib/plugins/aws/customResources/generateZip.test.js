'use strict';

const path = require('path');
const globby = require('globby');
const { listZipFiles } = require('../../../../../utils/fs');
const { expect } = require('chai');
const generateZip = require('../../../../../../lib/plugins/aws/customResources/generateZip');

// The directory that holds the files that generateZip zips up
const resourcesDir = path.resolve(
  __dirname,
  '../../../../../../lib/plugins/aws/customResources/resources/'
);

describe('test/unit/lib/plugins/aws/customResources/generateZip.test.js', () => {
  describe('when generating a zip file', () => {
    it('should generate a zip file with the contents of the resources directory', async () => {
      const zipFilePath = await generateZip();

      // List the files in the zip to make sure it is valid
      const filesInZip = await listZipFiles(zipFilePath);

      const filesInResourceDirAbsolute = await globby(path.join(resourcesDir, '**'));
      // Globby returns absolute paths to CWD so we need to convert them to relative to compare with the zip file
      const filesInResourceDirRelative = filesInResourceDirAbsolute.map((p) =>
        path.relative(resourcesDir, p)
      );
      expect(filesInZip).to.have.all.members(filesInResourceDirRelative);
    });
  });
});
