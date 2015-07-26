2.2.1 / 2015-06-25
------------------
- fixed regression when passing in string as encoding for options in `writeFile()` and `writeFileSync()`. See: https://github.com/jprichardson/node-jsonfile/issues/28

2.2.0 / 2015-06-25
------------------
- added `options.spaces` to `writeFile()` and `writeFileSync()`

2.1.2 / 2015-06-22
------------------
- fixed if passed `readFileSync(file, 'utf8')`. See: https://github.com/jprichardson/node-jsonfile/issues/25

2.1.1 / 2015-06-19
------------------
- fixed regressions if `null` is passed for options. See: https://github.com/jprichardson/node-jsonfile/issues/24

2.1.0 / 2015-06-19
------------------
- cleanup: JavaScript Standard Style, rename files, dropped terst for assert
- methods now support JSON revivers/replacers

2.0.1 / 2015-05-24
------------------
- update license attribute https://github.com/jprichardson/node-jsonfile/pull/21

2.0.0 / 2014-07-28
------------------
* added `\n` to end of file on write. [#14](https://github.com/jprichardson/node-jsonfile/pull/14)
* added `options.throws` to `readFileSync()`
* dropped support for Node v0.8

1.2.0 / 2014-06-29
------------------
* removed semicolons
* bugfix: passed `options` to `fs.readFile` and `fs.readFileSync`. This technically changes behavior, but
changes it according to docs. #12

1.1.1 / 2013-11-11
------------------
* fixed catching of callback bug (ffissore / #5)

1.1.0 / 2013-10-11
------------------
* added `options` param to methods, (seanodell / #4)

1.0.1 / 2013-09-05
------------------
* removed `homepage` field from package.json to remove NPM warning

1.0.0 / 2013-06-28
------------------
* added `.npmignore`, #1
* changed spacing default from `4` to `2` to follow Node conventions

0.0.1 / 2012-09-10
------------------
* Initial release.
