# Changelog

All notable changes to this project will be documented in this file. See [standard-version](https://github.com/conventional-changelog/standard-version) for commit guidelines.

### [7.2.0](https://github.com/serverless/dashboard-plugin/compare/v7.1.0...v7.2.1) (2023-11-16)

### Bug Fixes

- Bump platform-client version for axios ([#737](https://github.com/serverless/dashboard-plugin/issues/737)) ([a0700f9](https://github.com/serverless/dashboard-plugin/commit/a0700f97762c60cc38e1e3756e391b3fae3c5652))

## [7.1.0](https://github.com/serverless/dashboard-plugin/compare/v7.0.5...v7.1.0) (2023-10-20)

### Features

- Remove stackman dependency to enable use of the native Node solution ([#734](https://github.com/serverless/dashboard-plugin/issues/734)) ([1b62a2a](https://github.com/serverless/dashboard-plugin/commit/1b62a2a96db4164c9c98178e7867f4efcb5af0d1))

### [7.0.5](https://github.com/serverless/dashboard-plugin/compare/v7.0.4...v7.0.5) (2023-09-27)

### Bug Fixes

- Use clearer error message for credential resolution ([#732](https://github.com/serverless/dashboard-plugin/issues/732)) ([1a17de3](https://github.com/serverless/dashboard-plugin/commit/1a17de357ab7e3742e7925100c62bbac54821c30))

### [7.0.4](https://github.com/serverless/dashboard-plugin/compare/v7.0.3...v7.0.4) (2023-09-25)

### Bug Fixes

- Remove wrapped error logic that was breaking Dashboard V2 error reporting ([#730](https://github.com/serverless/dashboard-plugin/issues/730)) ([4ae5260](https://github.com/serverless/dashboard-plugin/commit/4ae5260798ae13e79b6d245abb58f26cce00cb51))

### [7.0.3](https://github.com/serverless/dashboard-plugin/compare/v7.0.2...v7.0.3) (2023-09-19)

### [7.0.2](https://github.com/serverless/dashboard-plugin/compare/v7.0.1...v7.0.2) (2023-09-16)

### Bug Fixes

- Adjust copy ([#725](https://github.com/serverless/dashboard-plugin/issues/725)) ([04e3d12](https://github.com/serverless/dashboard-plugin/commit/04e3d12560c31b278f545e554ac8af4130b91082))

### [7.0.1](https://github.com/serverless/dashboard-plugin/compare/v7.0.0...v7.0.1) (2023-09-15)

### Bug Fixes

- Only setup monitoringIntegrationService when logged into dashboard ([#723](https://github.com/serverless/dashboard-plugin/issues/723)) ([f0ad3ba](https://github.com/serverless/dashboard-plugin/commit/f0ad3bac37995c5a38fe54dcae37e5c3c5b75c3c))

## [7.0.0](https://github.com/serverless/dashboard-plugin/compare/v6.4.0...v7.0.0) (2023-09-15)

### Features

- Move dashboard onboarding into plugin ([#720](https://github.com/serverless/dashboard-plugin/issues/720)) ([647b217](https://github.com/serverless/dashboard-plugin/commit/647b21771ce7bd6d9ab7e9562a19bb5347093fd2))

### Bug Fixes

- MonitoringIntegrationService must be configured last in init ([#721](https://github.com/serverless/dashboard-plugin/issues/721)) ([be2567f](https://github.com/serverless/dashboard-plugin/commit/be2567f7414e3a4da7c6a828507b6449116b9f4f))

## [6.4.0](https://github.com/serverless/dashboard-plugin/compare/v6.3.0...v6.4.0) (2023-09-14)

### Features

- Remove Dashboard Monitoring Logline ([#716](https://github.com/serverless/dashboard-plugin/issues/716)) ([7257403](https://github.com/serverless/dashboard-plugin/commit/725740397275b6ed6d22844b1b610ce91a2ad5e6))
- Remove Log Subscription setup ([#718](https://github.com/serverless/dashboard-plugin/issues/718)) ([a657f42](https://github.com/serverless/dashboard-plugin/commit/a657f427936092e9545c3eb12104f95ef585e695))

## [6.3.0](https://github.com/serverless/dashboard-plugin/compare/v6.2.3...v6.3.0) (2023-09-13)

### Features

- Add support to disable wrapping manually, automatically disable or ESM projects, and for python projects with 3.11 ([#712](https://github.com/serverless/dashboard-plugin/issues/712)) ([287875f](https://github.com/serverless/dashboard-plugin/commit/287875f5d394d4116ae1033066dc96b7c76cc84e))

### [6.2.3](https://github.com/serverless/dashboard-plugin/compare/v6.2.2...v6.2.3) (2023-01-26)

### Maintenance Improvements

- Use `patterns` instead of `include` ([#694](https://github.com/serverless/dashboard-plugin/issues/694)) ([47374d4](https://github.com/serverless/dashboard-plugin/commit/47374d460e0a5455ce81d68610b577e996c9438c))

### [6.2.2](https://github.com/serverless/dashboard-plugin/compare/v6.2.1...v6.2.2) (2022-04-20)

### Maintenance Improvements

- Add detailed error message for params resolution ([#690](https://github.com/serverless/dashboard-plugin/pull/690)) ([c588286](https://github.com/serverless/dashboard-plugin/commit/c5882863a0e0f4d9311c1d275640cb35710cfbcc)) ([pgrzesik](https://github.com/pgrzesik))

### [6.2.1](https://github.com/serverless/dashboard-plugin/compare/v6.2.0...v6.2.1) (2022-04-01)

### Maintenance Improvements

- Clarify unsupported runtimes warning message ([#687](https://github.com/serverless/dashboard-plugin/pull/687)) ([193cd0f](https://github.com/serverless/dashboard-plugin/commit/193cd0f187ea530db34278a8e19b22737dbd7353)) ([pgrzesik](https://github.com/pgrzesik))

## [6.2.0](https://github.com/serverless/dashboard-plugin/compare/v6.1.6...v6.2.0) (2022-03-24)

### Features

- Support providers with explicitly disabled dashboard ([#685](https://github.com/serverless/enterprise-plugin/pull/685)) ([ecbef10](https://github.com/serverless/dashboard-plugin/commit/ecbef10dd81021f94f5c3b4e03fc531488c9c28a)) ([Mariusz Nowak](https://github.com/medikoo))

### Maintenance Improvements

- Generalize dashboard setup validation ([#685](https://github.com/serverless/enterprise-plugin/pull/685)) ([dc19abd](https://github.com/serverless/dashboard-plugin/commit/dc19abd838825fecb73104ab93dce480ff96e444)) ([Mariusz Nowak](https://github.com/medikoo))

### [6.1.6](https://github.com/serverless/dashboard-plugin/compare/v6.1.5...v6.1.6) (2022-03-18)

### Bug Fixes

- Update dependency on `simple-git` to avoid security vulnerability ([#683](https://github.com/serverless/enterprise-plugin/pull/683)) ([168b168](https://github.com/serverless/dashboard-plugin/commit/168b1684b8cfc55fe23e9284eda2704845695733)) ([pgrzesik](https://github.com/pgrzesik))

### [6.1.5](https://github.com/serverless/dashboard-plugin/compare/v6.1.4...v6.1.5) (2022-03-02)

### Maintenance Improvements

- Add information about Console during login ([#680](https://github.com/serverless/dashboard-plugin/pull/680)) ([3d07925](https://github.com/serverless/dashboard-plugin/commit/3d0792553a467844aba326500b7b73f874803bdb)) ([Piotr Grzesik](https://github.com/pgrzesik))
- Improve logout messagging ([#680](https://github.com/serverless/dashboard-plugin/pull/680)) ([ccbcc5f](https://github.com/serverless/dashboard-plugin/commit/ccbcc5fb56359ab655fd774baa44d94193f3aada)) ([Piotr Grzesik](https://github.com/pgrzesik))

### [6.1.4](https://github.com/serverless/dashboard-plugin/compare/v6.1.3...v6.1.4) (2022-03-01)

### Maintenance Improvements

- Improve wording during console login ([#678](https://github.com/serverless/dashboard-plugin/pull/678)) ([3c6ec71](https://github.com/serverless/dashboard-plugin/commit/3c6ec716640cfb1fb5b1f12c0a46de71af39bc69)) ([Piotr Grzesik](https://github.com/pgrzesik))

### [6.1.3](https://github.com/serverless/dashboard-plugin/compare/v6.1.2...v6.1.3) (2022-03-01)

### Maintenance Improvements

- Support `login` with `console` ([#676](https://github.com/serverless/dashboard-plugin/pull/676)) ([f80fdee](https://github.com/serverless/dashboard-plugin/commit/f80fdee70fd32d50d7d88b87943bdcbb56a90075)) ([Piotr Grzesik](https://github.com/pgrzesik))

### [6.1.2](https://github.com/serverless/dashboard-plugin/compare/v6.1.1...v6.1.2) (2022-02-25)

### Bug Fixes

- Fix handling of `app` setting when `console: true` ([806888e](https://github.com/serverless/dashboard-plugin/commit/806888e5204879e9653e75c0de68e79a20a7681a)) ([Mariusz Nowak](https://github.com/medikoo))

### [6.1.1](https://github.com/serverless/dashboard-plugin/compare/v6.1.0...v6.1.1) (2022-02-25)

### Bug Fixes

- Fix conditional in notification resolver ([#674](https://github.com/serverless/dashboard-plugin/pull/674)) ([0402e86](https://github.com/serverless/dashboard-plugin/commit/0402e86352117a0e6a7a687fda79cc3bff058a3b)) ([Mariusz Nowak](https://github.com/medikoo))

### Maintenance Improvements

- Unify `isDashboardEnabled` resolution ([#674](https://github.com/serverless/dashboard-plugin/pull/674)) ([30c0b89](https://github.com/serverless/dashboard-plugin/commit/30c0b89cbc36b02f3e49f7b73a7fd69e159c7c5a)) ([Mariusz Nowak](https://github.com/medikoo))

## [6.1.0](https://github.com/serverless/dashboard-plugin/compare/v6.0.0...v6.1.0) (2022-02-18)

### Features

- Deprecate `test` command ([#667](https://github.com/serverless/dashboard-plugin/pull/667)) ([dd221cd](https://github.com/serverless/dashboard-plugin/commit/dd221cd9666c0a874d4c67f63960baf5020821f3)) ([Piotr Grzesik](https://github.com/pgrzesik))
- Support for CLI options during `param` variable resolution ([#670](https://github.com/serverless/dashboard-plugin/pull/670)) ([b8281c7](https://github.com/serverless/dashboard-plugin/commit/b8281c79178d9d05a8d04e23ca5df171aafd0c75)) ([Piotr Grzesik](https://github.com/pgrzesik))

### Bug Fixes

- Fix support for custom service level package artifacts ([#669](https://github.com/serverless/dashboard-plugin/issues/669)) ([8e51da1](https://github.com/serverless/dashboard-plugin/commit/8e51da18ccc6ec5e010f073d915eb19598684c7d)) ([Sam Chung](https://github.com/samchungy))

### Maintenance Improvements

- Use `main` when downloading Framework ([#666](https://github.com/serverless/dashboard-plugin/pull/666))([73f4e7c](https://github.com/serverless/dashboard-plugin/commit/73f4e7c60e147413dc8332beae74eccb920841c6)) ([Piotr Grzesik](https://github.com/pgrzesik))

## [6.0.0](https://github.com/serverless/dashboard-plugin/compare/v5.5.4...v6.0.0) (2022-01-27)

### ⚠ BREAKING CHANGES

- Old Framework variables resolver is no longer supported
- Deployment profile based params are no longer resolved
- `tenant` will no longer be recognized. Use `org` instead
- `studio` command is removed
- Internal setup of dashboard related interactive CLI steps is removed
- Node.js version 12 or later is required (dropped support for v10)

### Features

- Support new `params` configuration ([#648](https://github.com/serverless/dashboard-plugin/pull/648) & [#655](https://github.com/serverless/dashboard-plugin/pull/655)) ([ad0ba91](https://github.com/serverless/dashboard-plugin/commit/ad0ba918ddb0fd12d3f8ea26a6d80d990adea3d8)) ([Mariusz Nowak](https://github.com/medikoo))
- Drop support for deployment profile based params ([#648](https://github.com/serverless/dashboard-plugin/pull/648)) ([c4ef4ff](https://github.com/serverless/dashboard-plugin/commit/c4ef4ff7e8a893ecf8416bf366ca4772990f51f7)) ([Mariusz Nowak](https://github.com/medikoo))
- Drop support for old framework variables resolver ([#648](https://github.com/serverless/dashboard-plugin/pull/648)) ([3677ffd](https://github.com/serverless/dashboard-plugin/commit/3677ffd4b5ebedf51d109b830138d9e3e58eb1c3)) ([Mariusz Nowak](https://github.com/medikoo))
- Drop support for `tenant` ([#656](https://github.com/serverless/dashboard-plugin/pull/656)) ([765169e](https://github.com/serverless/dashboard-plugin/commit/765169e82f00226332a9120056be27107f4af150)) ([Mariusz Nowak](https://github.com/medikoo))
- Remove _legacy_ logs ([#657](https://github.com/serverless/dashboard-plugin/pull/657)) ([2775471](https://github.com/serverless/dashboard-plugin/commit/277547117cc10ffe817545b774583eb533236ad2)) ([Piotr Grzesik](https://github.com/pgrzesik))
- Remove `studio` command ([#638](https://github.com/serverless/dashboard-plugin/pull/638)) ([8220a32](https://github.com/serverless/dashboard-plugin/commit/8220a32a7ac7ff04d5b455e1ff5f52a75bbdf53e)) ([Piotr Grzesik](https://github.com/pgrzesik))

### Maintenance Improvements

- Drop support for Node.js versions below v12 ([#641](https://github.com/serverless/dashboard-plugin/pull/641)) ([bd2a1e4](https://github.com/serverless/dashboard-plugin/commit/bd2a1e40d05a9eb8e63c946d7187c6320ffb8f42)) ([Mariusz Nowak](https://github.com/medikoo))
- Remove check for `serviceOutputs` ([#663](https://github.com/serverless/dashboard-plugin/pull/663)) ([3cdcb47](https://github.com/serverless/dashboard-plugin/commit/3cdcb47a7f0ccacebb188aa4d49b637215fa086d)) ([Piotr Grzesik](https://github.com/pgrzesik))
- Remove checks related to vars resolution ([#663](https://github.com/serverless/dashboard-plugin/pull/6)) ([7a2fb7f](https://github.com/serverless/dashboard-plugin/commit/7a2fb7fb928d4af803de42fece580cca5b92a96c)) ([Piotr Grzesik](https://github.com/pgrzesik))
- Expose param meta in `resolveParams` response ([#648](https://github.com/serverless/dashboard-plugin/pull/648)) ([647cfdd](https://github.com/serverless/dashboard-plugin/commit/647cfdd9ef3c81c3e04c083c95e33184a4383e12)) ([Mariusz Nowak](https://github.com/medikoo))
- Remove no longer used, interactive setup related modules ([#656](https://github.com/serverless/dashboard-plugin/pull/656)) ([2423e13](https://github.com/serverless/dashboard-plugin/commit/2423e131218dfa7c795ab2e4655ff39cc0657f60)) ([Mariusz Nowak](https://github.com/medikoo))
- Unify file naming convention ([#661](https://github.com/serverless/dashboard-plugin/pull/6)) ([Mariusz Nowak](https://github.com/medikoo))

### [5.5.4](https://github.com/serverless/dashboard-plugin/compare/v5.5.3...v5.5.4) (2022-01-19)

### Maintenance Improvements

- Remove direct use of `@serverless/utils/log` ([#658](https://github.com/serverless/dashboard-plugin/pull/658)) ([1363594](https://github.com/serverless/dashboard-plugin/commit/1363594915257d84155f96f3f5f667ac83d65cda)) ([Piotr Grzesik](https://github.com/pgrzesik))

### [5.5.3](https://github.com/serverless/dashboard-plugin/compare/v5.5.2...v5.5.3) (2022-01-03)

### Bug Fixes

- Support nested paths for Python handlers ([#652](https://github.com/serverless/dashboard-plugin/pull/652)) ([7f84a76](https://github.com/serverless/dashboard-plugin/commit/7f84a76b89b28a786a0e3bc0a44abb8f5f1e8739)) ([Piotr Grzesik](https://github.com/pgrzesik))

### [5.5.2](https://github.com/serverless/dashboard-plugin/compare/v5.5.1...v5.5.2) (2021-12-27)

### Bug Fixes

- Fix variable resolution of nested output structure ([#647](https://github.com/serverless/dashboard-plugin/pull/647)) ([450a512](https://github.com/serverless/dashboard-plugin/commit/450a51273d675f9e3cf2c913b4cd5f5047bf1f26)) ([Mariusz Nowak](https://github.com/medikoo))
- Fix definition of `custom.enterprise.disableFrameworksInstrumentation` ([#649](https://github.com/serverless/dashboard-plugin/pull/649)) ([cbdb7cf](https://github.com/serverless/dashboard-plugin/commit/cbdb7cfdbac788d3d1e5abd4b86dbabe1210cddd)) ([Mariusz Nowak](https://github.com/medikoo))
- Fix resolution of default runtime ([#649](https://github.com/serverless/dashboard-plugin/pull/649)) ([e9be679](https://github.com/serverless/dashboard-plugin/commit/e9be679313adccecf8253ae0b1f7659b6595f738)) ([Mariusz Nowak](https://github.com/medikoo))

### Maintenance Improvements

- **CLI New Logs:**
  - Refactor `sls.cli` based logs to modern logs ([#642](https://github.com/serverless/dashboard-plugin/pull/642)) ([af281e2](https://github.com/serverless/dashboard-plugin/commit/af281e2747bf277e3d70f78c8de1d750299b2305)) ([Mariusz Nowak](https://github.com/medikoo))
  - Use namespaced logger ([#642](https://github.com/serverless/dashboard-plugin/pull/642)) ([9ecbe9f](https://github.com/serverless/dashboard-plugin/commit/9ecbe9f18b9d2271b2164ed21e00b6cc31ac28ed)) ([Mariusz Nowak](https://github.com/medikoo))
- Move variable resolvers to variables module ([#647](https://github.com/serverless/dashboard-plugin/pull/647)) ([6b878e5](https://github.com/serverless/dashboard-plugin/commit/6b878e5fbd0d127dcd29a5b1af7008f18e5e4646)) ([Mariusz Nowak](https://github.com/medikoo))

### [5.5.1](https://github.com/serverless/dashboard-plugin/compare/v5.5.0...v5.5.1) (2021-11-03)

### Maintenance Improvements

- Use internal `serviceOutputs` handler ([#634](https://github.com/serverless/dashboard-plugin/pull/634)) ([8d8b965](https://github.com/serverless/dashboard-plugin/commit/8d8b965d690f6865e3e3b3c0c5f03b37e705d272)) ([Mariusz Nowak](https://github.com/medikoo))

## [5.5.0](https://github.com/serverless/dashboard-plugin/compare/v5.4.8...v5.5.0) (2021-10-19)

### Features

- Introduce `getDashboardProvidersUrl` util ([#632](https://github.com/serverless/dashboard-plugin/pull/632)) ([6adcd3a](https://github.com/serverless/dashboard-plugin/commit/6adcd3afc0358ad9281ad1c71375839741566797)) ([Piotr Grzesik](https://github.com/pgrzesik))

### Maintenance Improvements

- Expose `dashboardProviderAlias` on credentials ([#632](https://github.com/serverless/dashboard-plugin/pull/632)) ([d790b59](https://github.com/serverless/dashboard-plugin/commit/d790b59b7c4dec5b469da7e5de50755121feed8a)) ([Piotr Grzesik](https://github.com/pgrzesik))

### [5.4.8](https://github.com/serverless/dashboard-plugin/compare/v5.4.7...v5.4.8) (2021-10-15)

### Maintenance Improvements

- **CLI New logs (experimental):**
  - Convert `console.log` logs ([#630](https://github.com/serverless/dashboard-plugin/pull/630)) ([c9dcd8b](https://github.com/serverless/dashboard-plugin/commit/c9dcd8b6cc3c050fda9976bdf2807ed408d1e7e6)) ([Mariusz Nowak](https://github.com/medikoo))
  - Ensure to list dashboard url also in `info` command ([#630](https://github.com/serverless/dashboard-plugin/pull/630)) ([5e04892](https://github.com/serverless/dashboard-plugin/commit/5e04892feff05bed31e2cd3dbc33ac4cc5c5f54d)) ([Mariusz Nowak](https://github.com/medikoo))

### [5.4.7](https://github.com/serverless/dashboard-plugin/compare/v5.4.6...v5.4.7) (2021-10-13)

### Maintenance Improvements

- Modern logs for `test` command ([#628](https://github.com/serverless/dashboard-plugin/pull/628)) ([48f59ec](https://github.com/serverless/dashboard-plugin/commit/48f59ec3c5813271c5ddf556beb6a0391f1eb3e5)) ([Piotr Grzesik](https://github.com/pgrzesik))

### [5.4.6](https://github.com/serverless/dashboard-plugin/compare/v5.4.5...v5.4.6) (2021-10-08)

### Maintenance Improvements

- **CLI: New logs (experimental):**
  - `dashboard` command ([#626](https://github.com/serverless/dashboard-plugin/pull/626)) ([b0e2397](https://github.com/serverless/dashboard-plugin/commit/b0e239797f424056b6effe647ad0615b99757364)) ([Piotr Grzesik](https://github.com/pgrzesik))
  - AWS creds resolution ([#625](https://github.com/serverless/dashboard-plugin/pull/625)) ([662f809](https://github.com/serverless/dashboard-plugin/commit/662f809a2b4b64949a3ac0c714d851b4bacd7689)) ([Mariusz Nowak](https://github.com/medikoo))

### [5.4.5](https://github.com/serverless/dashboard-plugin/compare/v5.4.4...v5.4.5) (2021-09-29)

### Maintenance Improvements

- **CLI: New logs (experimental):**
  - Modern logs for `deploy` command ([#622](https://github.com/serverless/dashboard-plugin/pull/622)) ([2548eb2](https://github.com/serverless/dashboard-plugin/commit/2548eb2ef06f418d75f243a0910a0841dd7ee6df)) ([Mariusz Nowak](https://github.com/medikoo))
  - Modern logs for `login` command ([#621](https://github.com/serverless/dashboard-plugin/pull/621)) ([ae1c254](https://github.com/serverless/dashboard-plugin/commit/ae1c2548c5771d0564ca82de207b75b5b111168e)) ([Mariusz Nowak](https://github.com/medikoo))
  - Modern logs for `logout` command ([bf30bd8](https://github.com/serverless/dashboard-plugin/commit/bf30bd8fa56c574238242ee4131d4b8312fdde46))([#621](https://github.com/serverless/dashboard-plugin/pull/621)) ([Mariusz Nowak](https://github.com/medikoo))
  - Modern logs for `output get` command ([#621](https://github.com/serverless/dashboard-plugin/pull/621)) ([9e872a3](https://github.com/serverless/dashboard-plugin/commit/9e872a3b74f0c453cb8d8722727b699ffc5814b3)) ([Mariusz Nowak](https://github.com/medikoo))
  - Modern logs for `output list` command ([#621](https://github.com/serverless/dashboard-plugin/pull/621)) ([62dccc2](https://github.com/serverless/dashboard-plugin/commit/62dccc2ef91a159b93e5e2c518722369efc10930)) ([Mariusz Nowak](https://github.com/medikoo))
  - Modern logs for `param get` command ([#621](https://github.com/serverless/dashboard-plugin/pull/621)) ([63bd89f](https://github.com/serverless/dashboard-plugin/commit/63bd89facbe6ce9e46e85c833ff9a41694678ede)) ([Mariusz Nowak](https://github.com/medikoo))
  - Modern logs for `param list` command ([#621](https://github.com/serverless/dashboard-plugin/pull/621)) ([c2b8c4b](https://github.com/serverless/dashboard-plugin/commit/c2b8c4bf999fa5bdcfef81e51f02d9f7ddac6272)) ([Mariusz Nowak](https://github.com/medikoo))
  - Modern logs for interactive setup ([#622](https://github.com/serverless/dashboard-plugin/pull/622)) ([bf4aa84](https://github.com/serverless/dashboard-plugin/commit/bf4aa84518d9af11b6eaaaa234475bf7f8f87932)) ([Mariusz Nowak](https://github.com/medikoo))
- Rely on native `Object.entries` ([#621](https://github.com/serverless/dashboard-plugin/pull/621)) ([8ebbbbb](https://github.com/serverless/dashboard-plugin/commit/8ebbbbb56ca88de0ae24227652e6e73f98d8e7d2)) ([Mariusz Nowak](https://github.com/medikoo))
- Rely on native `Object.entries` ([#621](https://github.com/serverless/dashboard-plugin/pull/621)) ([138375d](https://github.com/serverless/dashboard-plugin/commit/138375da06d554b35b51e1427baea7e734ee85f4)) ([Mariusz Nowak](https://github.com/medikoo))

### [5.4.4](https://github.com/serverless/dashboard-plugin/compare/v5.4.3...v5.4.4) (2021-08-25)

### Bug Fixes

- Ensure `dashboard` command redirects to service page or displays correct message ([#615](https://github.com/serverless/dashboard-plugin/pull/615)) ([2aa66ac](https://github.com/serverless/dashboard-plugin/commit/2aa66ac8163ff2225747cf9809da7376633f3255)) ([Piotr Grzesik](https://github.com/pgrzesik))
- Recognize if user is not in service context in onboarding flow ([#609](https://github.com/serverless/dashboard-plugin/pull/609)) ([8a86187](https://github.com/serverless/dashboard-plugin/commit/8a86187c23ef1f6296e84ef5ca9e17fef10a9266)) ([Piotr Grzesik](https://github.com/pgrzesik))

### [5.4.3](https://github.com/serverless/dashboard-plugin/compare/v5.4.2...v5.4.3) (2021-06-29)

### Maintenance Improvements

- Improve formatting of org setup messaging ([#607](https://github.com/serverless/dashboard-plugin/pull/607)) ([bfd328c](https://github.com/serverless/dashboard-plugin/commit/bfd328c8da537ffa5e84134ffa24c3b5763aa9cf)) ([Piotr Grzesik](https://github.com/pgrzesik))

### [5.4.2](https://github.com/serverless/dashboard-plugin/compare/v5.4.1...v5.4.2) (2021-06-23)

### Maintenance Improvements

- Export `configuredQuestions` in interactive steps ([#604](https://github.com/serverless/dashboard-plugin/pull/604)) ([1673f4a](https://github.com/serverless/dashboard-plugin/commit/1673f4a7c329dcbe8260d008a7f31e3d38cf320e)) ([Piotr Grzesik](https://github.com/pgrzesik))

## [5.4.1](https://github.com/serverless/dashboard-plugin/compare/v5.4.0...v5.4.1) (2021-06-21)

### Maintenance Improvements

- Ensure to record `inapplicabilityReasonCode` for not applicable onboarding steps ([#602](https://github.com/serverless/dashboard-plugin/pull/602)) ([f2a9c9a](https://github.com/serverless/dashboard-plugin/commit/f2a9c9a025b0202af20f3ebb858e694752fce158)) ([Piotr Grzesik](https://github.com/pgrzesik))

## [5.4.0](https://github.com/serverless/dashboard-plugin/compare/v5.3.0...v5.4.0) (2021-06-16)

### Features

- Add telemetry to interactive flow steps ([#598](https://github.com/serverless/dashboard-plugin/pull/598)) ([aa32f56](https://github.com/serverless/dashboard-plugin/commit/aa32f566264ebe9f7513b71dab836d9904307e9a)) ([Piotr Grzesik](https://github.com/pgrzesik))

### Maintenance Improvements

- Fix logging output for `login/register` interactive step ([a294a6e](https://github.com/serverless/dashboard-plugin/commit/a294a6eb49764ef8126e4706af256f17b32f12ef))
- Use `confirm` prompt in `login/register` question ([f786583](https://github.com/serverless/dashboard-plugin/commit/f786583cb1a1f7771fee01a25cb7e691a21396ff))

## [5.3.0](https://github.com/serverless/dashboard-plugin/compare/v5.2.0...v5.3.0) (2021-06-08)

### Maintenance Improvements

- Improve message formatting for `dashboard-set-org` step ([#593](https://github.com/serverless/dashboard-plugin/pull/593)) ([41c6daa](https://github.com/serverless/dashboard-plugin/commit/41c6daa95db8707ad999d918e7f92f1658193aec)) ([Piotr Grzesik](https://github.com/pgrzesik))
- Add `getDashboardInteractUrl` util ([#593](https://github.com/serverless/dashboard-plugin/pull/593)) [0182e87](https://github.com/serverless/dashboard-plugin/commit/0182e8764dbac17ce4e70326408b1ba35a4e96c6)) ([Piotr Grzesik](https://github.com/pgrzesik))
- Add `resolveProviderCredentials` util ([#594](https://github.com/serverless/dashboard-plugin/pull/594)) ([478f7b4](https://github.com/serverless/dashboard-plugin/commit/478f7b42576060c05bec0e15b74fd0194d595091)) ([Piotr Grzesik](https://github.com/pgrzesik))

## [5.2.0](https://github.com/serverless/dashboard-plugin/compare/v5.1.4...v5.2.0) (2021-06-02)

### Features

- Always ask for `org` in CLI when invoked for existing service ([#589](https://github.com/serverless/dashboard-plugin/pull/589)) ([16b58d0](https://github.com/serverless/dashboard-plugin/commit/16b58d0ddc016b446d7c15c78ecafd1816bacbdf)) ([Piotr Grzesik](https://github.com/pgrzesik))
- Support `SERVERLESS_ACCESS_KEY` in interactive flow ([#589](https://github.com/serverless/dashboard-plugin/pull/589)) ([1de3131](https://github.com/serverless/dashboard-plugin/commit/1de31317af09980dce5cd09926afc1266691120c)) ([Piotr Grzesik](https://github.com/pgrzesik))

### Maintenance Improvements

- Do not rely on `variablesSyntax` ([#590](https://github.com/serverless/dashboard-plugin/pull/590)) ([ea662fc](https://github.com/serverless/dashboard-plugin/commit/ea662fcf03e8f2f5c1f435d24249c72025a24dbf)) ([Mariusz Nowak](https://github.com/medikoo))

### [5.1.4](https://github.com/serverless/dashboard-plugin/compare/v5.1.3...v5.1.4) (2021-05-27)

### Maintenance Improvements

- Improve messaging for org setup step in interactive flow ([#587](https://github.com/serverless/dashboard-plugin/pull/587)) ([8aafaa2](https://github.com/serverless/dashboard-plugin/commit/8aafaa2b351027e4f8f4f2ff8d35c1cbc3f9defd)) ([Piotr Grzesik](https://github.com/pgrzesik))
- Strip prefix and remove color in `login` logs in interactive flow ([#587](https://github.com/serverless/dashboard-plugin/pull/587)) ([423574d](https://github.com/serverless/dashboard-plugin/commit/423574d78c8c0ee326e79044e4d8e60e4314d5ed)) ([Piotr Grzesik](https://github.com/pgrzesik))

### [5.1.3](https://github.com/serverless/dashboard-plugin/compare/v5.1.2...v5.1.3) (2021-05-20)

### Maintenance Improvements

- Ensure error code ([#582](https://github.com/serverless/dashboard-plugin/pull/584)) ([e8234a1](https://github.com/serverless/dashboard-plugin/commit/e8234a135ea9ee8d1db2f7957cd15434e908fc67)) ([Mariusz Nowak](https://github.com/medikoo))

### [5.1.2](https://github.com/serverless/dashboard-plugin/compare/v5.1.1...v5.1.2) (2021-05-19)

### Bug Fixes

- Ensure to communicate user errors with `ServerlessError` ([#582](https://github.com/serverless/dashboard-plugin/pull/582)) ([9e21582](https://github.com/serverless/dashboard-plugin/commit/9e215821f81b714e1e4f19af9fe6d2a17824ce65)) ([Mariusz Nowak](https://github.com/medikoo))

### Maintenance Improvements

- Pass through original error ([caf4a7d](https://github.com/serverless/dashboard-plugin/commit/caf4a7ddb3ca8124e52e158f64b10d7255989cfa))

### [5.1.1](https://github.com/serverless/dashboard-plugin/compare/v5.1.0...v5.1.1) (2021-05-19)

### Bug Fixes

- Ensure compatibility by always allowing to skip during `org` selection if `context.history` missing in interactive flow ([#580](https://github.com/serverless/dashboard-plugin/pull/580)) ([9f3cc44](https://github.com/serverless/dashboard-plugin/commit/9f3cc44785c03a324ef5b390ad6b40024d1cbfeb)) ([Piotr Grzesik](https://github.com/pgrzesik))

## [5.1.0](https://github.com/serverless/dashboard-plugin/compare/v5.0.0...v5.1.0) (2021-05-17)

### Features

- Always redirect to dashboard for `login/register` ([#574](https://github.com/serverless/dashboard-plugin/pull/574)) ([75a9b74](https://github.com/serverless/dashboard-plugin/commit/75a9b74a6d6a001ce2a81bb5adb5ce77baa9f846)) ([Piotr Grzesik](https://github.com/pgrzesik))
- Create default app if needed during interactive flow ([#575](https://github.com/serverless/dashboard-plugin/pull/575)) ([0ad1aa2](https://github.com/serverless/dashboard-plugin/commit/0ad1aa21cf5dfa2a9ba02fac4cfb6006b3d1e260)) ([Piotr Grzesik](https://github.com/pgrzesik))

### Maintenance Improvements

- Remove `enable` step from interactive CLI ([#574](https://github.com/serverless/dashboard-plugin/pull/574)) ([1cf06bb](https://github.com/serverless/dashboard-plugin/commit/1cf06bb4582a35b293ac490852d48e89d7f56a1e)) ([Piotr Grzesik](https://github.com/pgrzesik))
- Do not create/assign `deployProfiles` to apps in interactive flow ([#576](https://github.com/serverless/dashboard-plugin/pull/576)) ([62b79ec](https://github.com/serverless/dashboard-plugin/commit/62b79ec0d4f5bbb50e5d492206c789376a09bf04)) ([Piotr Grzesik](https://github.com/pgrzesik))
- Allow skipping interactive setup during org selection ([#577](https://github.com/serverless/dashboard-plugin/pull/577)) ([093e5a4](https://github.com/serverless/dashboard-plugin/commit/093e5a4f584ef1276091a459d72d3cfaceebc8b9)) ([Piotr Grzesik](https://github.com/pgrzesik))

## [5.0.0](https://github.com/serverless/dashboard-plugin/compare/v4.6.0...v5.0.0) (2021-05-11)

### ⚠ BREAKING CHANGES

- Rename from `@serverless/enterprise-plugin` to `@serverless/dashboard-plugin`
- Unconditionally depend on `serviceDir` and `configurationFilename` as exposed by the Framework
- Internals now depend unconditionally on CLI commands schemas configured in context of `serverless` package
- **CLI:** Interactive CLI setup steps are not longer configured into lifecycle engine, but exposed as a standalone utils to be required directly by the Framework

### Features

- Rename to `@serverless/dashboard-plugin` ([#570](https://github.com/serverless/enterprise-plugin/pull/570)) ([b2507a2](https://github.com/serverless/dashboard-plugin/commit/b2507a2a412f518429326b2eb1faaafe105d11b9)) ([Mariusz Nowak](https://github.com/medikoo))

### Bug Fixes

- **CLI:** Output url expected to be opened in a browser ([#565](https://github.com/serverless/enterprise-plugin/pull/565)) ([8de558e](https://github.com/serverless/dashboard-plugin/commit/8de558ea1dd75bb34f78e522bc7c1e6baf6462af)) ([Mariusz Nowak](https://github.com/medikoo))
- **CLI Onboarding:** Do not show, unexpected in this context, interactive onboarding invitation ([#565](https://github.com/serverless/enterprise-plugin/pull/565)) ([#565](https://github.com/serverless/enterprise-plugin/pull/565)) ([1b4e9b7](https://github.com/serverless/dashboard-plugin/commit/1b4e9b7990627915f7b78a6009b766ee6a60a310)) ([Mariusz Nowak](https://github.com/medikoo))
- **CLI Onboarding:** Do not present login & set org steps when `SERVERLESS_ACCESS_KEY` is provided ([#565](https://github.com/serverless/enterprise-plugin/pull/565)) ([fa99403](https://github.com/serverless/dashboard-plugin/commit/fa99403adbbfdd8f58d8a347ea636bc07816ba65)) ([Mariusz Nowak](https://github.com/medikoo))

### Maintenance Improvements

- **CLI:** Seclude interactive CLI configuration from internals ([#565](https://github.com/serverless/enterprise-plugin/pull/565)) ([85c7f85](https://github.com/serverless/dashboard-plugin/commit/85c7f85a5b96c9f51940ac0d3609b6bbd7e0e9e8)) ([Mariusz Nowak](https://github.com/medikoo))
- **CLI Onboarding:** Make login testable offline ([#565](https://github.com/serverless/enterprise-plugin/pull/565)) ([82c0556](https://github.com/serverless/dashboard-plugin/commit/82c0556de4fd69f72b7013ded95e8b98c133c93d)) ([Mariusz Nowak](https://github.com/medikoo))
- Depend unconditionally on external CLI command schemas (([#570](https://github.com/serverless/enterprise-plugin/pull/570)) [e1d86ac](https://github.com/serverless/dashboard-plugin/commit/e1d86acb27cec4d1f636b312146fcd5fcee24fed)) ([Mariusz Nowak](https://github.com/medikoo))
- Rely on @serverless/utils/log ([#565](https://github.com/serverless/enterprise-plugin/pull/565)) ([1961078](https://github.com/serverless/dashboard-plugin/commit/1961078fd4c22f55d5aa6459fe443c6728326cca)) ([Mariusz Nowak](https://github.com/medikoo))
- Remove internal serverless file path resolution ([#570](https://github.com/serverless/enterprise-plugin/pull/570)) ([4c7b4fe](https://github.com/serverless/dashboard-plugin/commit/4c7b4fe095c82889aa2e9b41bcfd166602535543)) ([Mariusz Nowak](https://github.com/medikoo))
- Remove obsolete interactive CLI constructs ([#570](https://github.com/serverless/enterprise-plugin/pull/570)) ([c7ed50f](https://github.com/serverless/dashboard-plugin/commit/c7ed50fd90b379b05ddacb2f234cd945bfb2c4cb)) ([Mariusz Nowak](https://github.com/medikoo))
- Remove refactor leftover, unused `default` module export ([#570](https://github.com/serverless/enterprise-plugin/pull/570)) ([96d965e](https://github.com/serverless/dashboard-plugin/commit/96d965e83222af8ec6b5ef706040d717d6020cfc)) ([Mariusz Nowak](https://github.com/medikoo))
- Remove unused CLI command schema setting ([#570](https://github.com/serverless/enterprise-plugin/pull/570)) ([7d7305e](https://github.com/serverless/dashboard-plugin/commit/7d7305eee15d4afb7dc17ec2541c405c8757bbbd)) ([Mariusz Nowak](https://github.com/medikoo))

### [4.6.0](https://github.com/serverless/enterprise-plugin/compare/v4.5.3...v4.6.0) (2021-05-11)

### Features

- Expose `areProvidersUsed` boolean on deployment data ([#557](https://github.com/serverless/enterprise-plugin/pull/557)) ([de7ecf9](https://github.com/serverless/enterprise-plugin/commit/de7ecf9d295a6f728d21b1b9d16bfbeaccb7964b)) ([AJ Stuyvenberg](https://github.com/astuyve))

### Bug Fixes

- Ensure dashboard logs are flushed before invocation is closed ([#568](https://github.com/serverless/enterprise-plugin/pull/568)) ([ed4e12e](https://github.com/serverless/enterprise-plugin/commit/ed4e12e6bcb87adfd6f156f3f5ed254d00f82eee)) ([Mariusz Nowak](https://github.com/medikoo))
- Ensure dashboard logs do not leak to next invocation in case of unresolved invocations ([#568](https://github.com/serverless/enterprise-plugin/pull/568)) ([5cd0356](https://github.com/serverless/enterprise-plugin/commit/5cd03564760af5ecdb127554e54ba316f958ad82)) ([Mariusz Nowak](https://github.com/medikoo))

### [4.5.3](https://github.com/serverless/enterprise-plugin/compare/v4.5.2...v4.5.3) (2021-03-30)

### Maintenance Improvements

- Update to resolve variables with a new resolver ([#558](https://github.com/serverless/enterprise-plugin/pull/558)) ([2aa0040](https://github.com/serverless/enterprise-plugin/commit/2aa0040241ffd3f3193908add3b9709b72a5209c)) ([Mariusz Nowak](https://github.com/medikoo))
- Upgrade `js-yaml` to v4 ([#559](https://github.com/serverless/enterprise-plugin/pull/559)) ([17e5b3f](https://github.com/serverless/enterprise-plugin/commit/17e5b3fc77edbdc7def5d4caa306dcd67122835d)) ([Mariusz Nowak](https://github.com/medikoo))

### [4.5.2](https://github.com/serverless/enterprise-plugin/compare/v4.5.1...v4.5.2) (2021-03-19)

### Maintenance Improvements

- Recognize `user_uid` during `login` and `register` command and persist it in local config file ([#555](https://github.com/serverless/enterprise-plugin/pull/555)) ([1fdf9ba](https://github.com/serverless/enterprise-plugin/commit/1fdf9bae4429f69b6b6b6b8c478ad8aed111a25b)) ([Piotr Grzesik](https://github.com/pgrzesik))

### [4.5.1](https://github.com/serverless/enterprise-plugin/compare/v4.5.0...v4.5.1) (2021-03-15)

### Bug Fixes

- Fix error handling in `sls test` command ([#551](https://github.com/serverless/enterprise-plugin/pull/551)) ([3fbcdb1](https://github.com/serverless/enterprise-plugin/commit/3fbcdb1c352251ef257bf0a0ba3baba3a97d14e0)) ([Mariusz Nowak](https://github.com/medikoo))

### Maintenance Improvements

- Adapt to commands schema as configured in `serverless` ([#552](https://github.com/serverless/enterprise-plugin/pull/552)) ([0a703fe](https://github.com/serverless/enterprise-plugin/commit/0a703fe5b49e783748a3f220f0d30b698561da06)) ([Mariusz Nowak](https://github.com/medikoo))
- Recognize container commands ([#552](https://github.com/serverless/enterprise-plugin/pull/552)) ([c263f2f](https://github.com/serverless/enterprise-plugin/commit/c263f2f1f4a347bd33dc4b3daf717d56b83dfc33)) ([Mariusz Nowak](https://github.com/medikoo))

### [4.5.0](https://github.com/serverless/enterprise-plugin/compare/v4.4.3...v4.5.0) (2021-03-04)

### Features

- Support `--use-local-credentials` flag to skip provider resolution ([#539](https://github.com/serverless/enterprise-plugin/pull/539)) ([c6048d1](https://github.com/serverless/enterprise-plugin/commit/c6048d162597441f0ad3e2c35509a3f00805c20e)) ([AJ Stuyvenberg](https://github.com/astuyve))

### Bug fixes

- Properly use namespaced `events` module ([#548](https://github.com/serverless/enterprise-plugin/pull/548)) ([72019bd](https://github.com/serverless/enterprise-plugin/commit/72019bd3d2657f3a558972d37772d0fc4379d9fa)) ([AJ Stuyvenberg](https://github.com/astuyve))

### Maintenance

- Drop dependency on `@serverless/platform-sdk` by replacing it with corresponding `@serverless/platform-client` methods ([#546](https://github.com/serverless/enterprise-plugin/pull/546)) ([924360f](https://github.com/serverless/enterprise-plugin/pull/546/commits/924360f7067d713bb6678af58709ee0cc1a4d9ab)) ([Piotr Grzesik](https://github.com/pgrzesik))

### [4.4.3](https://github.com/serverless/enterprise-plugin/compare/v4.4.2...v4.4.3) (2021-02-09)

### Maintenance

- Migrate `@serverless/platform-sdk` methods to corresponding `@serverless/utils` methods ([#536](https://github.com/serverless/enterprise-plugin/pull/536)) ([4416651](https://github.com/serverless/enterprise-plugin/commit/4416651c965c4d5a0ef98db41032fc87c8539852)) ([Piotr Grzesik](https://github.com/pgrzesik))
- Remove deprecated use of `git.silent` ([#537](https://github.com/serverless/enterprise-plugin/pull/537)) ([fab4f50](https://github.com/serverless/enterprise-plugin/commit/fab4f50733aa9ccbd90c4b4cc2d51d0843ac3be2)) ([Piotr Grzesik](https://github.com/pgrzesik))

### [4.4.2](https://github.com/serverless/enterprise-plugin/compare/v4.4.1...v4.4.2) (2021-01-07)

### Bug Fixes

- Update dependency on `@serverless/platform-client` to avoid security vulnerability of `axios` ([#528](https://github.com/serverless/enterprise-plugin/pull/528)) ([d7b6ac8](https://github.com/serverless/enterprise-plugin/pull/528/commits/d7b6ac8175dd13cf8134225b11031367a52fb165)) ([pgrzesik](https://github.com/pgrzesik))

### [4.4.1](https://github.com/serverless/enterprise-plugin/compare/v4.4.0...v4.4.1) (2020-12-30)

### Bug Fixes

- Fix handling of deploymentProfile resolution ([#526](https://github.com/serverless/enterprise-plugin/issues/526)) ([61a872b](https://github.com/serverless/enterprise-plugin/commit/61a872b2f3010905187b665b61d6236663948e35)) ([AJ Stuyvenberg](https://github.com/astuyve))

## [4.4.0](https://github.com/serverless/enterprise-plugin/compare/v4.3.0...v4.4.0) (2020-12-30)

### Features

- Support Parameters, override Profiles with Providers/Parameters ([#520](https://github.com/serverless/enterprise-plugin/issues/520)) ([5c56e2d](https://github.com/serverless/enterprise-plugin/commit/5c56e2d266d726abd5897739fe3f2825dde3cfb5)) ([AJ Stuyvenberg](https://github.com/astuyve))
- Deprecate variables usage in core properties ([#524](https://github.com/serverless/enterprise-plugin/issues/524)) ([697d701](https://github.com/serverless/enterprise-plugin/commit/697d701041dff5fd154de3e4d641851aa02d3e99)) ([AJ Stuyvenberg](https://github.com/astuyve))

### Bug Fixes

- Remove safeguards traces to not collide with safeguards-plugin ([#522](https://github.com/serverless/enterprise-plugin/issues/522)) ([28cf1ec](https://github.com/serverless/enterprise-plugin/commit/28cf1ecbfe24c69b2510a885ee732db7a1046797)) ([Martin Litvaj](https://github.com/Kamahl19))

## [4.3.0](https://github.com/serverless/enterprise-plugin/compare/v4.2.0...v4.3.0) (2020-12-15)

### Bug Fixes

- Support API Gateway event payload format version 2.0 ([#518](https://github.com/serverless/enterprise-plugin/pull/518)) ([37ff190](https://github.com/serverless/enterprise-plugin/commit/37ff190caaaa19c5fa922858e0b39f178e64e792)) ([Sandesh Devaraju](https://github.com/scouredimage))

## [4.2.0](https://github.com/serverless/enterprise-plugin/compare/v4.1.2...v4.2.0) (2020-12-04)

### Features

- Recognize lambdas referencing ECR images ([#517](https://github.com/serverless/enterprise-plugin/issues/517) ([b95f6aa](https://github.com/serverless/enterprise-plugin/commit/b95f6aa9b59f23c149f0377af8ba03664e514c19)) ([Mariusz Nowak](https://github.com/medikoo))

### [4.1.2](https://github.com/serverless/enterprise-plugin/compare/v4.1.1...v4.1.2) (2020-11-06)

### Bug Fixes

- Ensure `test` command exits with non zero code on fail ([#516](https://github.com/serverless/enterprise-plugin/issues/516)) ([8f217db](https://github.com/serverless/enterprise-plugin/commit/8f217dbbeab0e982b2b9ed17ff8f62911fd92f0a)) ([Mariusz Nowak](https://github.com/medikoo))
- Fix internal processes handling in `studio` commmand ([#515](https://github.com/serverless/enterprise-plugin/issues/515)) ([465ea01](https://github.com/serverless/enterprise-plugin/commit/465ea0141ca6ba621c8fe7452b1c3963e39735be)) ([Steve Willard](https://github.com/stevewillard))

### [4.1.1](https://github.com/serverless/enterprise-plugin/compare/v4.1.0...v4.1.1) (2020-10-15)

### Bug Fixes

- Includes a fix to encodeURI for instanceUIDs which may not be URI safe ([cb412b1](https://github.com/serverless/enterprise-plugin/commit/cb412b11f217772453679be57f3e29885af7762c)) ([AJ Stuyvenberg](https://github.com/astuyve))
- Major upgrade of platform-client which moves to namespaced SDK methods ([20b375f](https://github.com/serverless/enterprise-plugin/commit/20b375fd9ef935cf4aab44bff84d7daaeaa55f00)) ([AJ Stuyvenberg](https://github.com/astuyve))
- Expose SDK method to fetch dashboard url for current transaction ([5feba87](https://github.com/serverless/enterprise-plugin/commit/5feba8703eed6e41a76d9085135928bad91f7765)) ([Sandesh Devaraju](https://github.com/scouredimage))

### [4.1.0](https://github.com/serverless/enterprise-plugin/compare/v4.0.4...v4.1.0) (2020-10-13)

### Features

- Support retrieving provider credentials from backend dashboard service ([10a2abb](https://github.com/serverless/enterprise-plugin/commit/10a2abb23a198352171055f6a181ae5494f06e27)) ([AJ Stuyvenberg](https://github.com/astuyve))
- `sdk.getTransactionId` method for retrieving transaction id ([c8ade1c](https://github.com/serverless/enterprise-plugin/commit/c8ade1cdc8c8736de907207c55e9988114cec671)) ([Sandesh Devaraju](https://github.com/scouredimage))

### Bug Fixes

- **Fix `outputs` schema:**
  - Ensure to not convert output strings to arrays ([3bcd0bd](https://github.com/serverless/enterprise-plugin/commit/3bcd0bdcb17e51f35cf2eb454ced2882264ba368)) ([Mariusz Nowak](https://github.com/medikoo))
  - Fix schema for property names ([689e9b2](https://github.com/serverless/enterprise-plugin/commit/689e9b2c22e80e8708e603628ad669b2c59c2b35)) ([Mariusz Nowak](https://github.com/medikoo))

### [4.0.4](https://github.com/serverless/enterprise-plugin/compare/v4.0.3...v4.0.4) (2020-09-17)

### Bug Fixes

- Ensure to resolve git remote url for `vcs.originUrl` deployment data ([#502](https://github.com/serverless/enterprise-plugin/issues/502)) ([5fa5539](https://github.com/serverless/enterprise-plugin/commit/5fa553945120e02318379d4640978283815daca4)) ([Mariusz Nowak](https://github.com/medikoo))

### [4.0.3](https://github.com/serverless/enterprise-plugin/compare/v4.0.2...v4.0.3) (2020-09-16)

### Bug Fixes

- Fix request resolution in Python SDK ([#496](https://github.com/serverless/enterprise-plugin/issues/496)) ([5b1a07a](https://github.com/serverless/enterprise-plugin/commit/5b1a07a68309aa774478872de0f01e161e80174b)) ([Sandesh Devaraju](https://github.com/scouredimage))

### [4.0.2](https://github.com/serverless/enterprise-plugin/compare/v4.0.1...v4.0.2) (2020-09-09)

### Bug Fixes

- Configure missing "outputs" schema ([#494](https://github.com/serverless/enterprise-plugin/issues/494)) ([ec4552c](https://github.com/serverless/enterprise-plugin/commit/ec4552c8e7a154db155caaa298727279f54cd086)) ([Mariusz Nowak](https://github.com/medikoo))
- Fix handling of lack of API Gateway request headers ([#495](https://github.com/serverless/enterprise-plugin/issues/495)) ([4ba389b](https://github.com/serverless/enterprise-plugin/commit/4ba389bbd01db631bdb7df14a3e8ac0ab843f580)) ([Mariusz Nowak](https://github.com/medikoo))

### [4.0.1](https://github.com/serverless/enterprise-plugin/compare/v4.0.0...v4.0.1) (2020-09-03)

### Bug Fixes

- Fix schema config for safeguards ([e7b1b4a](https://github.com/serverless/enterprise-plugin/commit/e7b1b4a2a010ddd85c6a528c05e205e9eb2c0354))([Mariusz Nowak](https://github.com/medikoo))

### Maintanance improvements

- Remove new plugin version notifications ([#488](https://github.com/serverless/enterprise-plugin/issues/488)) ([c8e85c0](https://github.com/serverless/enterprise-plugin/commit/c8e85c0db5d6416445ad89d959a39afd89b67b5c)) ([Mariusz Nowak](https://github.com/medikoo))

## [4.0.0](https://github.com/serverless/enterprise-plugin/compare/v3.8.1...v4.0.0) (2020-08-28)

### ⚠ BREAKING CHANGES

- At least Node.js v10 is required (dropped support for v6 and v8)
- Safeguards validation functionality has been removed from the core.Use [@serverless/safeguards](https://github.com/serverless/safeguards-plugin) plugin instead
- `dev` command was removed (Use `studio` instead)

### Features

- **New dashboard ([app.serverless.com](https://app.serverless.com/)):**

  - Switch login/logout to new dashboard ([#477](https://github.com/serverless/enterprise-plugin/issues/477)) ([29dcc76](https://github.com/serverless/enterprise-plugin/commit/29dcc765b161869c420eb81dfea0a8bb9a49034b)) ([Mariusz Nowak](https://github.com/medikoo))
  - Update dashboard link to point new one ([#477](https://github.com/serverless/enterprise-plugin/issues/477)) ([eb68551](https://github.com/serverless/enterprise-plugin/commit/eb68551887d2c7a23830f0f67c041d99520b7441)) ([Mariusz Nowak](https://github.com/medikoo))

- Remove Safeguards implementation ([#483](https://github.com/serverless/enterprise-plugin/issues/483)) ([3e26d29](https://github.com/serverless/enterprise-plugin/commit/3e26d299fb63d2216325d467336938c825ddeccc)) ([Mariusz Nowak](https://github.com/medikoo))
- Drop support for Node.js versions lower than v10 ([#480](https://github.com/serverless/enterprise-plugin/issues/480)) ([e08f549](https://github.com/serverless/enterprise-plugin/commit/e08f549e711547dd9d1b86e373079046100f20e5)) ([Mariusz Nowak](https://github.com/medikoo))
- Remove `dev` command ([#484](https://github.com/serverless/enterprise-plugin/issues/484)) ([e3a4261](https://github.com/serverless/enterprise-plugin/commit/e3a4261e543cdea674506fee60b99f283c2d14fd)) ([Mariusz Nowak](https://github.com/medikoo))

### Bug Fixes

- Fix browser window openning issues ([#477](https://github.com/serverless/enterprise-plugin/issues/477)) ([345411e](https://github.com/serverless/enterprise-plugin/commit/345411ecf49e1eafa22eb1956418231eaaa1b377)) ([Mariusz Nowak](https://github.com/medikoo))
- Remove enforced process.exit ([#477](https://github.com/serverless/enterprise-plugin/issues/477)) ([9682a97](https://github.com/serverless/enterprise-plugin/commit/9682a97ed38da9ea1ae5d8f4266760773ce8d5ce)) ([Mariusz Nowak](https://github.com/medikoo))

### [3.8.4](https://github.com/serverless/enterprise-plugin/compare/v3.8.3...v3.8.4) (2020-09-09)

### Bug Fixes

- Configure missing "outputs" schema ([#494](https://github.com/serverless/enterprise-plugin/issues/494)) ([11d31fe](https://github.com/serverless/enterprise-plugin/commit/11d31fe74a1e332a1e62730c216d8de92805846a)) ([Mariusz Nowak](https://github.com/medikoo))
- Fix handling of lack of API Gateway request headers ([#495](https://github.com/serverless/enterprise-plugin/issues/495)) ([574fca7](https://github.com/serverless/enterprise-plugin/commit/574fca79f0b9ad8569cb9f829481e055b87914b6)) ([Mariusz Nowak](https://github.com/medikoo))

### [3.8.3](https://github.com/serverless/enterprise-plugin/compare/v3.8.2...v3.8.3) (2020-09-03)

### Maintanance improvements

- Remove new plugin version notifications ([#488](https://github.com/serverless/enterprise-plugin/issues/488)) ([1bbca1d](https://github.com/serverless/enterprise-plugin/commit/1bbca1db47843be6ccc8cef38d09fda86b757f98)) ([Mariusz Nowak](https://github.com/medikoo))

### [3.8.2](https://github.com/serverless/enterprise-plugin/compare/v3.8.1...v3.8.2) (2020-09-01)

### Bug Fixes

- Fix Safeguards config schema definition ([#488](https://github.com/serverless/enterprise-plugin/issues/488)) ([acd47e3](https://github.com/serverless/enterprise-plugin/commit/acd47e37a0a014738625f6a0323b57207ec6ee67)) ([Mariusz Nowak](https://github.com/medikoo))

### [3.8.1](https://github.com/serverless/enterprise-plugin/compare/v3.8.0...v3.8.1) (2020-08-28)

### Bug Fixes

- Ensure to extend schema only for supported providers ([79e5535](https://github.com/serverless/enterprise-plugin/commit/79e55353251fdd08dc1067d27e685962a1c3432e)) ([Mariusz Nowak](https://github.com/medikoo))
- Notify of new version only on patch and minor update ([#485](https://github.com/serverless/enterprise-plugin/issues/485)) ([d5fdc36](https://github.com/serverless/enterprise-plugin/commit/d5fdc363f67ef009b9aed20f604507ec63435df3)) ([Mariusz Nowak](https://github.com/medikoo))

## [3.8.0](https://github.com/serverless/enterprise-plugin/compare/v3.7.1...v3.8.0) (2020-08-27)

### Features

- Deprecate safeguards ([#478](https://github.com/serverless/enterprise-plugin/issues/478)) ([056d1d9](https://github.com/serverless/enterprise-plugin/commit/056d1d9afed31ed0af3c759c06f27d87a433e40f)) ([Mariusz Nowak](https://github.com/medikoo))

### Bug Fixes

- Ensure schema for "custom.enterprise.safeguards" ([#478](https://github.com/serverless/enterprise-plugin/issues/478)) ([0aba76c](https://github.com/serverless/enterprise-plugin/commit/0aba76c6f6a7ac78583ae9da6cfba8caf159a45c)) ([Mariusz Nowak](https://github.com/medikoo))

### [3.7.1](https://github.com/serverless/enterprise-plugin/compare/v3.7.0...v3.7.1) (2020-08-19)

### Bug Fixes

- Ensure to not write meta log with local invocation ([#467](https://github.com/serverless/enterprise-plugin/issues/467)) ([7fd2504](https://github.com/serverless/enterprise-plugin/commit/7fd2504868e4e44cffec8868ed9e80cd95067656)) ([Mariusz Nowak](https://github.com/medikoo))
- Mark "dashboard", "help" and "plugin" as unconditional commands ([#465](https://github.com/serverless/enterprise-plugin/issues/465)) ([2ec2172](https://github.com/serverless/enterprise-plugin/commit/2ec21728eafbe682a5c2d0619ee7f4c581616b03)) ([Mariusz Nowak](https://github.com/medikoo))
- Report unsupported region meaningfully ([#466](https://github.com/serverless/enterprise-plugin/issues/466)) ([d4eedb8](https://github.com/serverless/enterprise-plugin/commit/d4eedb8ccbee41bb3bde7d51db8faa200d5c84c7)) ([Mariusz Nowak](https://github.com/medikoo))

## [3.7.0](https://github.com/serverless/enterprise-plugin/compare/v3.6.18...v3.7.0) (2020-08-03)

### Features

- Configure validation schemas for plugin specific properties ([#460](https://github.com/serverless/enterprise-plugin/issues/460)) ([f83eadf](https://github.com/serverless/enterprise-plugin/commit/f83eadf4a95f8918f4f882f43c17b6b8deccb65f)) ([Mariusz Nowak](https://github.com/medikoo))

### [3.6.18](https://github.com/serverless/enterprise-plugin/compare/v3.6.17...v3.6.18) (2020-07-27)

### Bug Fixes

- Fix support for TypeScript config files ([#456](https://github.com/serverless/enterprise-plugin/issues/456)) ([d858fb0](https://github.com/serverless/enterprise-plugin/commit/d858fb0ffba17ba516490a5e9ea925a5b6599be0)) ([Rob Burger](https://github.com/robburger))

### [3.6.17](https://github.com/serverless/enterprise-plugin/compare/v3.6.16...v3.6.17) (2020-07-23)

### Bug Fixes

- Replace dependencies resolver with Node.js dedidated version (previous choice bundled various transpilers which attributed to significant increase in size of standalone bundle) ([#453](https://github.com/serverless/enterprise-plugin/pull/453)) ([50d63a7](https://github.com/serverless/enterprise-plugin/commit/50d63a7e9efca1faf3f267785cc2190057069951)) ([Mariusz Nowak](https://github.com/medikoo))

### [3.6.16](https://github.com/serverless/enterprise-plugin/compare/v3.6.15...v3.6.16) (2020-07-15)

### Bug Fixes

- Hide and deprecate `dev` command ([53d68a6](https://github.com/serverless/enterprise-plugin/commit/53d68a606717a9b20f326c5252a71603d5f9e580))
- Upgrade `@serverles/platform-client` to v1 ([6e78d23](https://github.com/serverless/enterprise-plugin/commit/6e78d2376276972e1e5d02e1a273a9b6c53b0652)), which fixes issues with websocket connection handling when using `sls studio`

### [3.6.15](https://github.com/serverless/enterprise-plugin/compare/v3.6.14...v3.6.15) (2020-06-30)

### Minor improvements

- Return callback result in SDK span [#443](https://github.com/serverless/enterprise-plugin/pull/443) ([Sandesh Devaraju](https://github.com/scouredimage))

### Bug fixes

- Simplify Flask instrumentation [#444](https://github.com/serverless/enterprise-plugin/pull/444) ([Sandesh Devaraju](https://github.com/scouredimage))
