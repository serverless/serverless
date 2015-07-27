'use strict';

module.exports = function (grunt) {

    require('time-grunt')(grunt);

    grunt.initConfig({
        browserify: {
            browser: {
                src: [ require('./package.json').main ],
                dest: './browser/shortid.js'
            },
            tests: {
                src: [
                    './test/**/*.test.js'
                ],
                dest: './browser/shortid.test.js'
            }
        },

        open: {
            test: {
                path: './test/index.html',
                app: 'Google Chrome'
            }
        },

        mochaTest: {
            notify: {
                src: 'test/**/*.test.js',
                options: {
                    reporter: 'spec',
                    timeout: 50000
                }
            }
        },

        jshint: {
            options: {
                jshintrc: '.jshintrc'
            },
            all: [
                'Gruntfile.js',
                'lib/**/*.js',
                'tests/*'
            ]
        }

    });
    require('load-grunt-tasks')(grunt);

    grunt.registerTask('build', [
        'browserify'
    ]);

    grunt.registerTask('test', [
        'jshint',
        'mochaTest'
    ]);

    grunt.registerTask('default', [
        'build',
        'test'
    ]);
};
