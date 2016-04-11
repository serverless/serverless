'use strict';

let assert      = require('chai').assert,
    fse         = require('fs-extra'),
    os          = require('os'),
    testUtils   = require('../../test_utils'),
    testConfig  = require('../../config'),
    Serverless  = require('../../../lib/Serverless.js'),
    ProviderAws = require('../../../lib/ProviderAws.js'),
    regions = [
        'us-east-1',      // California
        'us-west-2',      // Oregon
        'eu-central-1',   // Frankfurt
        'eu-west-1',      // Ireland
        'ap-northeast-1'  // Tokyo
    ],
    stages = [
        'dev',
        'test',
        'perf',
        'prod'
    ],
    profileEnvVariableSuffix = 'PROFILE',
    profilePrefixEnvVariable = 'AWS_PROFILE_PREFIX',
    profilePrefixEnvValue = 'PREFIX',
    environmentPrefixes = [
        'AWS',
        'SERVERLESS_ADMIN_AWS'
    ],
    environmentSuffixes = [
        'ACCESS_KEY_ID',
        'SECRET_ACCESS_KEY',
        'SESSION_TOKEN'
    ],
    valueSuffix = 'VALUE',
    configCredentials = {
        awsAdminKeyId:          'AWS_ADMIN_ACCESS_KEY_ID_' + valueSuffix,
        awsAdminSecretKey:      'AWS_ADMIN_SECRET_ACCESS_KEY_' + valueSuffix,
        awsAdminSessionToken:   'AWS_ADMIN_SESSION_TOKEN_' + valueSuffix
    },
    awsCredentials = {
        accessKeyId:            'ACCESS_KEY_ID_' + valueSuffix,
        secretAccessKey:        'SECRET_ACCESS_KEY_' + valueSuffix,
        sessionToken:           'SESSION_TOKEN_' + valueSuffix
    },
    profileCredentials = {
        aws_access_key_id:      'ACCESS_KEY_ID_' + valueSuffix,
        aws_secret_access_key:  'SECRET_ACCESS_KEY_' + valueSuffix,
        aws_session_token:      'SESSION_TOKEN_' + valueSuffix,
        aws_security_token:     'SECURITY_TOKEN_' + valueSuffix
    },
    // ENV VARIABLES
    buildEnvVariableName = function(prefix, suffix) {
        return prefix + '_' + suffix;
    },
    buildEnvCredentialValue = function(variable) {
        return '[' + variable + ']';
    },
    buildExpectedEnvCredentials = function(prefix) {
        return {
            accessKeyId:        buildEnvCredentialValue(prefix + '_' + awsCredentials.accessKeyId),
            secretAccessKey:    buildEnvCredentialValue(prefix + '_' + awsCredentials.secretAccessKey),
            sessionToken:       buildEnvCredentialValue(prefix + '_' + awsCredentials.sessionToken)
        }
    },
    alterEnvVariables = function(prefix, alter) {
        for(let suffixIdx in environmentSuffixes) {
            let suffix = environmentSuffixes[suffixIdx];
            let varName = buildEnvVariableName(prefix, suffix);
            alter(varName);
        }
    },
    addEnvironmentVariables = function(target, prefix) {
        alterEnvVariables(prefix, function(varName) {
            target[varName] = buildEnvCredentialValue(varName + '_' + valueSuffix);
        });
    },
    removeEnvVariables = function(target, prefix) {
        alterEnvVariables(prefix, function(varName) {
            delete target[varName];
        });
    },
    // PROFILES
    getCredentialsFilePath = function() {
        return os.homedir() + '/.aws/credentials'; // TODO get the platform appropriate AWS credentials file path
    },
    getCredentialsBackupFilePath = function() {
        let backup = os.homedir() + '/.aws/credentials.backup', // TODO get the platform appropriate AWS credentials file backup path
            stat = null;
        try {
            stat = fse.statSync(backup);
        } catch(ex) {
            // desired
        }
        if(stat !== null) {
            throw new Error('~/.aws/credentials.backup already exists.  profile tests aborted.');
        }
        else {
            return backup;
        }
    },
    /**
     * Profile Environment Variable Names:
     *      AWS_PROFILE         | SERVERLESS_ADMIN_AWS_PROFILE          | [PREFIX]_AWS_PROFILE         | [PREFIX]_SERVERLESS_ADMIN_AWS_PROFILE
     *      AWS_[STAGE]_PROFILE | SERVERLESS_ADMIN_AWS_[STAGE]_PROFILE  | [PREFIX]_AWS_[STAGE]_PROFILE | [PREFIX]_SERVERLESS_ADMIN_AWS_[STAGE]_PROFILE
     * Profile Name Examples:
     *      aws-profile         | serverless_admin_aws-profile          | [prefix]-aws-profile         | [prefix]-serverless_admin_aws-profile
     *      aws-[stage]-profile | serverless_admin_aws-[stage]-profile  | [prefix]-aws-[stage]-profile | [prefix]-serverless_admin_aws-[stage]-profile
     * Profile Value Examples:
     *      AWS_[VALUE-TYPE]_VALUE           | SERVERLESS_ADMIN_AWS_[VALUE-TYPE]_VALUE          | [PREFIX]_AWS_[VALUE-TYPE]_VALUE           | [PREFIX]_SERVERLESS_ADMIN_AWS_[VALUE-TYPE]_VALUE
     *      AWS_[STAGE]_[VALUE-TYPE]_VALUE   | SERVERLESS_ADMIN_AWS_[STAGE]_[VALUE-TYPE]_VALUE  | [PREFIX]_AWS_[STAGE]_[VALUE-TYPE]_VALUE   | [PREFIX]_SERVERLESS_ADMIN_AWS_[STAGE]_[VALUE-TYPE]_VALUE
     */
    getProfileEnvironmentVariableName = function(prefix, stage) {
        let profileEnvVariable = '';
        if(process.env[profilePrefixEnvVariable]) {
            profileEnvVariable += process.env[profilePrefixEnvVariable];
            profileEnvVariable += '_';
        }
        if(prefix) {
            profileEnvVariable += prefix;
            profileEnvVariable += '_';
        }
        if(stage) {
            profileEnvVariable += stage;
            profileEnvVariable += '_';
        }
        profileEnvVariable +=  profileEnvVariableSuffix;
        return profileEnvVariable.toUpperCase();
    },
    setProfileEnvironmentVariable = function(prefix, stage) {
        let profileEnvVariable = getProfileEnvironmentVariableName(prefix, stage);
        process.env[profileEnvVariable] = buildExpectedProfileName(prefix, stage);
    },
    setProfilePrefixEnvVariable = function(value) {
        if (value) {
            process.env[profilePrefixEnvVariable] = value;
        } else if (process.env[profilePrefixEnvVariable]) {
            delete process.env[profilePrefixEnvVariable];
        }
    },
    createProfileCredential = function(profile) {
        let ret =   '[' + profile.name + ']' + os.EOL +
                    'aws_access_key_id=' + profile.accessKeyId + os.EOL +
                    'aws_secret_access_key=' + profile.secretAccessKey + os.EOL;
        if(profile.sessionToken) {
            ret +=  'aws_session_token=' + profile.sessionToken + os.EOL + // TODO test case where only one of these is set?
                    'aws_security_token=' + profile.sessionToken + os.EOL;
        }
        return ret + os.EOL;
    },
    buildExpectedProfileName = function(prefix, stage) {
        let ret = '';
        if(process.env[profilePrefixEnvVariable]) {
            ret += process.env[profilePrefixEnvVariable];
            ret += '-';
        }
        if(prefix) {
            ret += prefix;
            ret += '-';
        }
        if(stage) {
            ret += stage;
            ret += '-';
        }
        ret += 'profile';
        return ret.toLowerCase();
    },
    buildExpectedProfileCredential = function(prefix, stage, suffix) {
        let ret = '[';
        if(process.env[profilePrefixEnvVariable]) {
            ret += process.env[profilePrefixEnvVariable];
            ret += '_';
        }
        if (prefix) {
            ret += prefix;
            ret += '_';
        }
        if (stage) {
            ret += stage;
            ret += '_';
        }
        ret += suffix;
        ret += ']';
        return ret.toUpperCase();
    },
    buildExpectedProfileCredentials = function(prefix, stage) {
        return {
            name: buildExpectedProfileName(prefix, stage),
            accessKeyId: buildExpectedProfileCredential(prefix, stage, profileCredentials.aws_access_key_id),
            secretAccessKey: buildExpectedProfileCredential(prefix, stage, profileCredentials.aws_secret_access_key),
            sessionToken: buildExpectedProfileCredential(prefix, stage, profileCredentials.aws_security_token)
        };
    },
    buildCredentialsFileProfileEntry = function(prefix, stage) {
        let profile = buildExpectedProfileCredentials(prefix, stage);
        return createProfileCredential(profile);
    },
    prepareCredentialsFile = function() {
        let credsPath = getCredentialsFilePath(),
            credsPathBackup = getCredentialsBackupFilePath(),
            originalContent,
            newContent = createProfileCredential({
                name: 'default',
                accessKeyId: '<defaultAccessKeyId>',
                secretAccessKey: '<defaultSecretAccessKey>'
            });
        for(let prefixIdx in environmentPrefixes) { // without a profile prefix
            let prefix = environmentPrefixes[prefixIdx];
            newContent += buildCredentialsFileProfileEntry(prefix, null);
            for (let stageIdx in stages) {
                let stage = stages[stageIdx];
                newContent += buildCredentialsFileProfileEntry(prefix, stage);
            }
        }
        setProfilePrefixEnvVariable(profilePrefixEnvValue);
        for(let prefixIdx in environmentPrefixes) { // with a profile prefix
            let prefix = environmentPrefixes[prefixIdx];
            newContent += buildCredentialsFileProfileEntry(prefix, null);
            for (let stageIdx in stages) {
                let stage = stages[stageIdx];
                newContent += buildCredentialsFileProfileEntry(prefix, stage);
            }
        }
        setProfilePrefixEnvVariable();
        // set aside the existing ~/.aws/credentials file
        originalContent = fse.readFileSync(credsPath);
        fse.writeFileSync(credsPathBackup, originalContent);
        // Write the temporary testing replacement ~/.aws/credentials
        fse.writeFileSync(credsPath, newContent);
        return { // return the paths so that this action can be reversed.
            credsPath: credsPath,
            credsPathBackup: credsPathBackup
        };
    },
    revertCredentialsFile = function(files) {
        let originalContent = fse.readFileSync(files.credsPathBackup);
        fse.writeFileSync(files.credsPath, originalContent);
        fse.removeSync(files.credsPathBackup);
    },
    // VERIFICATION
    DOES_NOT_EXIST = null,
    /**
     * Check the credentials object for having the given expected values.  Use [null] to indicate that an attribute is 
     * expected to not exist and [undefined] to indicate an attribute is expected to have been explicitly set to undefined
     * @param credentials The credentials object to test
     * @param accessKeyId The expected accessKeyId value or null if it should not exist.
     * @param secretAccessKey The expected secretAccessKey value or null if it should not exist.
     * @param sessionToken The expected sessionToken value or null if it should not exist.
     */
    checkResults = function(credentials, accessKeyId, secretAccessKey, sessionToken) {
        // exists
        assert.equal(true, ('accessKeyId' in credentials)       === (accessKeyId !== DOES_NOT_EXIST));
        assert.equal(true, ('secretAccessKey' in credentials)   === (secretAccessKey !== DOES_NOT_EXIST));
        assert.equal(true, ('sessionToken' in credentials)      === (sessionToken !== DOES_NOT_EXIST));
        // has the same value
        if (accessKeyId !== DOES_NOT_EXIST) {
            assert.equal(true, credentials.accessKeyId === accessKeyId);
        }
        if (secretAccessKey !== DOES_NOT_EXIST) {
            assert.equal(true, credentials.secretAccessKey === secretAccessKey);
        }
        if (sessionToken !== DOES_NOT_EXIST) {
            assert.equal(true, credentials.sessionToken === sessionToken);
        }
    };

describe('Test Serverless ProviderAws Class', function() {
    let serverless,
        provider,
        credentials,
        config,
        environmentVars,
        credentialsFiles;
    this.timeout(0);

    before(() => {
        environmentVars = JSON.stringify(process.env); // save for later - be sure not to disrupt existing environment
        credentialsFiles = prepareCredentialsFile();
        return testUtils.createTestProject(testConfig)
            .then(projectPath => {
                process.chdir(projectPath);
                serverless = new Serverless({
                    projectPath,
                    interactive: false
                });
                return serverless.init()
                    .then(function() {
                        provider = serverless.getProvider();
                    });
            });
    });
    after(function(){
        if(credentialsFiles) {
            revertCredentialsFile(credentialsFiles);
        }
        if(environmentVars) {
            process.env = JSON.parse(environmentVars);
        }
    });

    describe('Configuration Credentials Tests', function() {
        it('Extracts credentials in AWS format from the project configuration', function() {
            credentials = {};
            config = {
                awsAdminKeyId:          configCredentials.awsAdminKeyId,
                awsAdminSecretKey:      configCredentials.awsAdminSecretKey,
                awsAdminSessionToken:   configCredentials.awsAdminSessionToken
            };
            provider.addConfigurationCredentials(credentials, config);
            checkResults(credentials, configCredentials.awsAdminKeyId, configCredentials.awsAdminSecretKey, configCredentials.awsAdminSessionToken);
        });
        it('Extracts session token in AWS format from the project configuration only if it exists', function() {
            credentials = {};
            config = {
                awsAdminKeyId:          configCredentials.awsAdminKeyId,
                awsAdminSecretKey:      configCredentials.awsAdminSecretKey
            };
            provider.addConfigurationCredentials(credentials, config);
            checkResults(credentials, configCredentials.awsAdminKeyId, configCredentials.awsAdminSecretKey, DOES_NOT_EXIST);
        });
        it('Ignores project configuration credentials that are not validly set', function () {
            credentials = {};
            config = {};
            provider.addConfigurationCredentials(credentials, config);
            checkResults(credentials, DOES_NOT_EXIST, DOES_NOT_EXIST, DOES_NOT_EXIST);
        });
    });
    describe('Environment Variable Credentials Tests', function() {
        for(let prefixIdx in environmentPrefixes) {
            let prefix = environmentPrefixes[prefixIdx];
            it('Extracts Credentials from the environment with prefix "' + prefix + '"', function () {
                let expected = buildExpectedEnvCredentials(prefix);
                credentials = {};
                addEnvironmentVariables(process.env, prefix);
                provider.addEnvironmentCredentials(credentials, prefix);
                removeEnvVariables(process.env, prefix);
                checkResults(credentials, expected.accessKeyId, expected.secretAccessKey, expected.sessionToken);
            });
        }
    });
    describe('Profile Credentials Tests', function() {
        for(let prefixIdx in environmentPrefixes) {

            let prefix = environmentPrefixes[prefixIdx].toUpperCase();

            it('Loads the credentials of the profile extracted from the environment using variable prefix "' + prefix + '"', () => {
                let expected = buildExpectedProfileCredentials(prefix, null);
                credentials = {};
                setProfileEnvironmentVariable(prefix, null);

                return provider.addProfileCredentials(credentials, prefix).then(() => {
                  checkResults(credentials, expected.accessKeyId, expected.secretAccessKey, expected.sessionToken);
                });

            });

            for(let stageIdx in stages) {

                let stage = stages[stageIdx].toUpperCase();

                it('Loads the credentials of the profile extracted from the environment using variable prefix "' + prefix + '" and the stage modifier "' + stage + '"', function() {
                    let expected = buildExpectedProfileCredentials(prefix, stage);
                    credentials = {};

                    setProfileEnvironmentVariable(prefix, stage);

                    return provider.addProfileCredentials(credentials, prefix + '_' + stage).then(() => {
                        checkResults(credentials, expected.accessKeyId, expected.secretAccessKey, expected.sessionToken);
                    });
                });
            }
        }

        setProfilePrefixEnvVariable(profilePrefixEnvValue);

        for(let prefixIdx in environmentPrefixes) {

            let prefix = environmentPrefixes[prefixIdx].toUpperCase();

            it('Loads the credentials of the "' + profilePrefixEnvValue + '" prefixed profile extracted from the environment using variable prefix "' + prefix + '"', function() {
                let expected = buildExpectedProfileCredentials(prefix, null);
                credentials = {};
                setProfileEnvironmentVariable(prefix, null);

                return provider.addProfileCredentials(credentials, prefix).then(() => {
                    checkResults(credentials, expected.accessKeyId, expected.secretAccessKey, expected.sessionToken);
                });
            });

            for(let stageIdx in stages) {

                let stage = stages[stageIdx].toUpperCase();

                it('Loads the credentials of the "' + profilePrefixEnvValue + '" prefixed profile extracted from the environment using variable prefix "' + prefix + '" and the stage modifier "' + stage + '"', function() {
                    let expected = buildExpectedProfileCredentials(prefix, stage);
                    credentials = {};
                    setProfileEnvironmentVariable(prefix, stage);

                    return provider.addProfileCredentials(credentials, prefix + '_' + stage).then(() => {
                        checkResults(credentials, expected.accessKeyId, expected.secretAccessKey, expected.sessionToken);
                    });
                });
            }
        }
        setProfilePrefixEnvVariable();
    });
    describe('Credentials Overriding Tests', function() {
        it('[EXPLAIN]', function() {
        });
    });
    /*
     this.addConfigurationCredentials(credentials, this._S.config);                      // use the given configuration credentials if they are the only available credentials.
     // first from environment
     this.addEnvironmentCredentials(credentials, 'AWS');                                 // allow for Amazon standard credential environment variable prefix.
     this.addEnvironmentCredentials(credentials, 'SERVERLESS_ADMIN_AWS');                // but override with more specific credentials if these are also provided.
     this.addEnvironmentCredentials(credentials, 'AWS_' + stage);                        // and also override these with the Amazon standard *stage specific* credential environment variable prefix.
     this.addEnvironmentCredentials(credentials, 'SERVERLESS_ADMIN_AWS_' + stage);       // finally override all prior with Serverless prefixed *stage specific* credentials if these are also provided.
     // next from profile
     this.addProfileCredentials(credentials, 'AWS');                                     // allow for generic Amazon standard prefix based profile declaration
     this.addProfileCredentials(credentials, 'SERVERLESS_ADMIN_AWS');                    // allow for generic Serverless standard prefix based profile declaration
     this.addProfileCredentials(credentials, 'AWS_' + stage);                            // allow for *stage specific* Amazon standard prefix based profile declaration
     this.addProfileCredentials(credentials, 'SERVERLESS_ADMIN_AWS_' + stage);           // allow for *stage specific* Serverless standard prefix based profile declaration
     */
});
