// Sanity tests that confirms a happy path interactive setup flow e2e way

'use strict';

const spawn = require('child-process-ext/spawn');
const path = require('path');

const serverlessPath = path.resolve(__dirname, '../../../../../scripts/serverless.js');
const fixturesPath = path.resolve(__dirname, '../../../../fixtures/programmatic');

describe('test/unit/lib/cli/interactive-setup/index.test.js', () => {
  it('should configure interactive setup flow', async () => {
    const slsProcessPromise = spawn(
      'node',
      [serverlessPath, '--template-path', path.join(fixturesPath, 'aws')],
      {
        env: {
          ...process.env,
          SLS_INTERACTIVE_SETUP_ENABLE: '1',
          SLS_INTERACTIVE_SETUP_TEST: '1',
          BROWSER: 'none',
        },
      }
    );
    const slsProcess = slsProcessPromise.child;
    let output = '';
    const program = [
      // service
      {
        instructionString: 'What do you want to call this project?',
        input: 'interactive-setup-test',
      },

      // dashboard-login
      {
        instructionString: 'Do you want to login/register to Serverless Dashboard?',
        input: 'n', // Move cursor down by one line
      },

      // aws-credentials
      {
        instructionString: 'No AWS credentials found, what credentials do you want to use?',
      },
      { instructionString: 'AWS account', input: 'Y' },
      { instructionString: 'press [Enter]' },
      {
        instructionString: 'AWS Access Key Id',
        input: 'AKIAIOSFODNN7EXAMPLE',
      },
      {
        instructionString: 'AWS Secret Access Key',
        input: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
      },

      // deploy
      { instructionString: 'Do you want to deploy now?', input: 'n' },
    ];
    slsProcess.stdout.on('data', (data) => {
      output += data;
      const programItem = program[0];
      if (!programItem) return;
      if (output.includes(programItem.instructionString)) {
        program.shift();
        output = '';
        slsProcess.stdin.write(`${programItem.input || ''}\n`);
      }
    });
    slsProcess.stdout.pipe(process.stdout);
    slsProcess.stderr.pipe(process.stderr);

    await slsProcessPromise;
  });
});
