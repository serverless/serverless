'use strict';

const path = require('path');
const fs = require('fs');

class Tests {
  constructor() {
    this.commands = {
      test: {
        commands: {
          integration: {
            usage: 'Command for integration testing.',
            lifeCycleEvents: [
              'createFile',
            ],
          },
        },
      },
    };

    this.hooks = {
      'test:integration:createFile': this.createFile,
    };
  }

  createFile() {
    const filePath = path.join(__dirname, '.integration-test');

    // check if file already exists (and remove it)
    try {
      if (fs.statSync(filePath).isFile()) {
        fs.unlinkSync(filePath);
      }
    } catch (exception) {
      // fail silently
    }

    fs.writeFileSync(filePath, 'success', { encoding: 'utf8', flag: 'a' });

    console.log(`file ${filePath} created. Please clean up if not executed inside a test`);

    return true;
  }
}

module.exports = Tests;
