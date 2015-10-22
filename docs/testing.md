# Testing

## Logging

`JawsUtils.jawsDebug()` offers the ability for writing debug logs to stdout.  You can control the namespaces that get logged by setting the `DEBUG` env var per the [https://github.com/visionmedia/debug](npm debug) rules.  If you want to see all namespaces set `DEBUG=*`

## Running test cases

1.  Set env var `JAWS_ADMIN_AWS_PROFILE`
1.  Set env vars defined in `tests/config.js`. By default if you do not set `TEST_JAWS_EXE_CF` no AWS resources will be created.
    1.  If you are going to run the tests that create aws resources, you will need to create a unit test project (via normal `jaws project create`).  Take the iam roles from `project.json` and set the `TEST_JAWS_*_ROLE` env vars defined in `config.js` 
1.  Make sure you have run `npm install` from the jaws project root
1.  Run the mocha test from the CLI (`mocha tests/all.js`) or setup mocha test from your IDE.  WebStorm allows you to run a debugger in the IDE for your test cases which is really handy to track down issues.