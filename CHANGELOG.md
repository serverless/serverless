# Changelog

All notable changes to this project will be documented in this file. See [standard-version](https://github.com/conventional-changelog/standard-version) for commit guidelines.

## [2.59.0](https://github.com/serverless/serverless/compare/v2.58.0...v2.59.0) (2021-09-14)

### Features

- **CLI Onboarding:** Switch to `httpApi`-based templates ([#9954](https://github.com/serverless/serverless/pull/9954)) ([12216db](https://github.com/serverless/serverless/commit/12216db579f7f2d055410f1ea9449825628631b7)) ([Piotr Grzesik](https://github.com/pgrzesik))
- **CLI:** First iteration of support for `verbose` mode in `deploy` with modern logs ([#9952](https://github.com/serverless/serverless/pull/9952)) ([fbdd124](https://github.com/serverless/serverless/commit/fbdd124029d10ef029ee5446777db44f907e026c)) ([Piotr Grzesik](https://github.com/pgrzesik))

### Bug Fixes

- **AWS API Gateway:** Ensure consistent default for `cors` conf ([#9909](https://github.com/serverless/serverless/issues/9909)) ([7cd3966](https://github.com/serverless/serverless/commit/7cd3966897fa4432caf3f2bda0037df0c76e382b)) ([Seungchan Ahn](https://github.com/issea1015))

### Maintenance Improvements

- Replace `_.pick` with native property assignment ([#9937](https://github.com/serverless/serverless/issues/9937)) ([6087fa3](https://github.com/serverless/serverless/commit/6087fa3400b508092a5113d40e4b2c4fd8ec22a7)) ([Jonas Matos](https://github.com/JonasMatos0))

## [2.58.0](https://github.com/serverless/serverless/compare/v2.57.0...v2.58.0) (2021-09-13)

### Features

- **AWS API Gateway:** Support `enabled` for `apiKeys` config ([#9918](https://github.com/serverless/serverless/pull/9918)) ([1107763](https://github.com/serverless/serverless/commit/1107763df8fb07a40ec45529f77d99e5a0f6d4d6)) ([Piotr Grzesik](https://github.com/pgrzesik))
- **AWS CloudFront:** Support `behavior.CachePolicyId` ([#9895](https://github.com/serverless/serverless/issues/9895)) ([3abc2f0](https://github.com/serverless/serverless/commit/3abc2f06428b72d964aa8683c34cdcf1d761d140)) ([Seungchan Ahn](https://github.com/issea1015))
- **AWS EventBridge:** Support `deadLetterQueue` and `retryPolicy` ([#9903](https://github.com/serverless/serverless/pull/9903)) ([130fb38](https://github.com/serverless/serverless/commit/130fb3838fd3ea382caabffad74fde8a4041d4fc)) ([Eve](https://github.com/evemontalvao) & [JP Bochi](https://github.com/jpbochi))
- **AWS ActiveMQ:** Add support for `activemq` event ([#8840](https://github.com/serverless/serverless/issues/8840)) ([cacb529](https://github.com/serverless/serverless/commit/cacb529925ed2b2c591984f48bc52cf31f88e698)) ([lewgordon](https://github.com/lewgordon) & [Piotr Grzesik](https://github.com/pgrzesik))
- **AWS Schedule:** Allow multiple `rate` expressions in single event ([#9892](https://github.com/serverless/serverless/pull/9892)) ([9f0bc68](https://github.com/serverless/serverless/commit/9f0bc689cc2ac3e53b4db665b899e1446ac37456)) ([Federico Jasson](https://github.com/federicojasson))
- **CLI:**
  - Configure log writing with new (experimental) log engine ([#9923](https://github.com/serverless/serverless/pull/9923)) ([ec93174](https://github.com/serverless/serverless/commit/ec93174b8ccfe1715ce3615dcb2223b145ad0f31)) ([Mariusz Nowak](https://github.com/medikoo))
  - Introduce first iteration of modern logs for `deploy` ([#9934](https://github.com/serverless/serverless/issues/9934)) ([171897d](https://github.com/serverless/serverless/commit/171897d60e5adaa590be1f08c99ab2cc76e89ee4)) ([Piotr Grzesik](https://github.com/pgrzesik))
- Do not retry AWS requests if the token has expired ([#9914](https://github.com/serverless/serverless/issues/9914)) ([b0ca237](https://github.com/serverless/serverless/commit/b0ca2376bbfb543d98db1585c3a20a391e1791c6)) ([Mars Lan](https://github.com/mars-lan))
- Support `error` hook to be triggered on command error ([#9936](https://github.com/serverless/serverless/pull/9936)) ([5c9766c](https://github.com/serverless/serverless/commit/5c9766c085531b04e169aa36a552159755029cca)) ([Mariusz Nowak](https://github.com/medikoo))

### Bug Fixes

- **AWS API Gateway:** Ensure proper `RequestValidator` name ([#9910](https://github.com/serverless/serverless/pull/9910)) ([510b1d1](https://github.com/serverless/serverless/commit/510b1d165924d000aa8e81e74e27c69ac1a2e0b6)) ([Piotr Grzesik](https://github.com/pgrzesik))
- **AWS CloudFront:** Recognize `behavior.TrustedKeyGroups` in schema ([#9884](https://github.com/serverless/serverless/pull/9884)) ([da71df6](https://github.com/serverless/serverless/commit/da71df603295397229589c88dd8366426e06e982)) ([Petr Reshetin](https://github.com/preshetin))
- **AWS Lambda:** Recognize `Fn::If` function for `environment` ([#9905](https://github.com/serverless/serverless/pull/9905)) ([63743ad](https://github.com/serverless/serverless/commit/63743ade31207049eee1811203db5622bc510f1a)) ([Piotr Grzesik](https://github.com/pgrzesik))

### Maintenance Improvements

- **CLI:**
  - Ensure no monkey patching by progress override ([#9923](https://github.com/serverless/serverless/pull/9923)) ([e46ce80](https://github.com/serverless/serverless/commit/e46ce80d99414ff730355efd1636bab71bb1771c)) ([Mariusz Nowak](https://github.com/medikoo))
  - Ensure to clear progress in expected time points ([#9928](https://github.com/serverless/serverless/pull/9928)) ([29aec52](https://github.com/serverless/serverless/commit/29aec529b53d7dd10f4ec61db7c0dc3859995d27)) ([Mariusz Nowak](https://github.com/medikoo))
- Replace `fse.access` with `fs.promises.access` ([#9915](https://github.com/serverless/serverless/issues/9915)) ([5155e01](https://github.com/serverless/serverless/commit/5155e0180e0cd5e3130bc74e308a97c0ea1a5c2b)) ([Sudipto Das](https://github.com/sdas13))
- Replace `fse.readFile` with `fs.promises.readFile` ([#9935](https://github.com/serverless/serverless/issues/9935)) ([f431218](https://github.com/serverless/serverless/commit/f431218790ae31efdc4e0a65a5b17a32605ede3e)) ([Sudipto Das](https://github.com/sdas13))
- Use `getCompiledTemplateS3Suffix` from `provider.naming` ([#9926](https://github.com/serverless/serverless/pull/9926)) ([95d3024](https://github.com/serverless/serverless/commit/95d3024ef55ce80edf20fe27d9c72ffd15bba2bb)) ([Andreas Kohn](https://github.com/ankon))
- Internal API to register service outputs ([#9933](https://github.com/serverless/serverless/pull/9933)) ([b425cf1](https://github.com/serverless/serverless/commit/b425cf1582623c1e796ae9f3d33dc060a9492cb5)) ([Mariusz Nowak](https://github.com/medikoo))
- Register service outputs ([#9933](https://github.com/serverless/serverless/pull/9933)) ([312266e](https://github.com/serverless/serverless/commit/312266e90819866199354183641954636bd5a076)) ([Mariusz Nowak](https://github.com/medikoo))

### Templates

- Remove unnecessary `fmt.Sprintf` in `tencent-go` ([#9847](https://github.com/serverless/serverless/pull/9847)) ([e798c26](https://github.com/serverless/serverless/commit/e798c269df6f456bccf6a1e755015ea1e7631117)) ([kou](https://github.com/kou-pg-0131))

## [2.57.0](https://github.com/serverless/serverless/compare/v2.56.0...v2.57.0) (2021-08-31)

### Features

- **Variables:** Enable `env` variables in `provider.stage` property ([#9896](https://github.com/serverless/serverless/issues/9896)) ([bbb6c6c](https://github.com/serverless/serverless/commit/bbb6c6cd7dea9100af3ff84dd490b2cac1e2971e)) ([Mariusz Nowak](https://github.com/medikoo))

### Bug Fixes

- **AWS API Gateway:**
  - Recognize CF functions at `functions[].events[].http.connectionId` ([#9894](https://github.com/serverless/serverless/issues/9894)) ([3e8858b](https://github.com/serverless/serverless/commit/3e8858b1a8cde32a3659498c6dbdc7d8637e86c6)) ([Piotr Grzesik](https://github.com/pgrzesik))
  - Recognize CF functions at `functions[].events[].http.request.headers[].mappedValue` ([#9894](https://github.com/serverless/serverless/issues/9894)) ([868ac02](https://github.com/serverless/serverless/commit/868ac02fd4d41a893d23a3f29101e3a3b952597b)) ([Piotr Grzesik](https://github.com/pgrzesik))
  - Recognize CF functions at `functions[].events[].http.request.uri` ([#9894](https://github.com/serverless/serverless/issues/9894)) ([13ce56a](https://github.com/serverless/serverless/commit/13ce56ae314dff1c157fc8351fc702bf15573fce)) ([Piotr Grzesik](https://github.com/pgrzesik))
  - Fix request validator triage ([#9887](https://github.com/serverless/serverless/issues/9887)) ([cb109dd](https://github.com/serverless/serverless/commit/cb109dd835ec358bfb1af10fe8f82aa283ffbafe)) ([Mariusz Nowak](https://github.com/medikoo))
- **Variables:** Fix new sources resolution error message at old resolver ([#9888](https://github.com/serverless/serverless/issues/9888)) ([8dece7f](https://github.com/serverless/serverless/commit/8dece7f6c6544f91366a2c8f70389be8b4b659c8)) ([Mariusz Nowak](https://github.com/medikoo))

### Maintenance Improvements

- **Variables:** Enable early `sls:stage` resolution ([#9890](https://github.com/serverless/serverless/issues/9890)) ([56e9423](https://github.com/serverless/serverless/commit/56e9423cd74dc05cc85b176bb1f0502f7ce05139)) ([Mariusz Nowak](https://github.com/medikoo))
- Replace `fse.writeFile` with `fs.promises.writeFile` ([#9870](https://github.com/serverless/serverless/issues/9870)) ([05fff98](https://github.com/serverless/serverless/commit/05fff98a0003b22a66e8932c622c0e10c57bf06b)) ([Sudipto Das](https://github.com/sdas13))
- Upgrade `filesize` to v8 ([#9901](https://github.com/serverless/serverless/issues/9901)) ([9a2511c](https://github.com/serverless/serverless/commit/9a2511cf90c60ba5b67ecea81121328c8dd93702)) ([Mariusz Nowak](https://github.com/medikoo))

## [2.56.0](https://github.com/serverless/serverless/compare/v2.55.0...v2.56.0) (2021-08-25)

### Features

- **AWS EventBridge:** Support disabling a rule ([#9865](https://github.com/serverless/serverless/issues/9865)) ([6193d38](https://github.com/serverless/serverless/commit/6193d3867ec826898d4effbd641e49a35d9efbbc)) ([Jake Scott](https://github.com/jakejscott))
- **AWS HTTP API:** Support `shouldStartNameWithService` option ([#9758](https://github.com/serverless/serverless/issues/9758)) ([ef5a8fa](https://github.com/serverless/serverless/commit/ef5a8faf13a8fbf8564e7c0621e88d1ea5357ea5)) ([Thiago Moraes](https://github.com/thiagomr))
- **CLI Onboarding:** Improve onboarding messaging ([#9877](https://github.com/serverless/serverless/pull/9877)) ([f69a19c](https://github.com/serverless/serverless/commit/f69a19c6804366a34324e7cfcbbdb3f247a12b85)) ([Piotr Grzesik](https://github.com/pgrzesik))

### Bug Fixes

- **AWS HTTP API:** Always allow to define catch-all route ([#9840](https://github.com/serverless/serverless/issues/9840)) ([7e9bfd6](https://github.com/serverless/serverless/commit/7e9bfd63fce56f880a3ad0379fd97fdfce89d91b)) ([Karim Kanso](https://github.com/kazkansouh))
- **CLI:** Mark `dashboard` command with optional service dependency ([#9874](https://github.com/serverless/serverless/pull/9874)) ([9a8e7e4](https://github.com/serverless/serverless/commit/9a8e7e44b44fdcf4c43d6e11c5eefa5051782506)) ([Piotr Grzesik](https://github.com/pgrzesik))
- **AWS Local Invocation:** Support `python3.9` runtime ([#9879](https://github.com/serverless/serverless/issues/9879)) ([ee17ee5](https://github.com/serverless/serverless/commit/ee17ee5aca25af152c2720a55199d92dfab3216d)) ([Shane R. Spencer](https://github.com/whardier))
- **AWS Lambda:** Prevent external subscription filter removal for CloudWatch ([#9839](https://github.com/serverless/serverless/issues/9839)) ([afc9a13](https://github.com/serverless/serverless/commit/afc9a13386479f79b4c9ef64b65af5bbcdfaa68b)) ([Han Sang Hoon (한상훈)](https://github.com/poerty))

### Maintenance Improvements

- Convert `upload` and `rollback` to `async/await` ([#9866](https://github.com/serverless/serverless/issues/9866)) ([0682ba8](https://github.com/serverless/serverless/commit/0682ba8b6a70d27e74c478d6e5fa5de71b9e0070)) ([Remigiusz Orłowski](https://github.com/remi00))

## [2.55.0](https://github.com/serverless/serverless/compare/v2.54.0...v2.55.0) (2021-08-18)

### Features

- **AWS Lambda:** Recognize `python3.9` as valid runtime ([#9854](https://github.com/serverless/serverless/pull/9854)) ([1aa24b8](https://github.com/serverless/serverless/commit/1aa24b8991032ba3fe6f2c4b65bf0e70bc4171dd)) ([Piotr Grzesik](https://github.com/pgrzesik))

### Bug Fixes

- **AWS HTTP API:** Properly handle authorizer function with alias (e.g. with `provisionedConcurrency`) ([#9850](https://github.com/serverless/serverless/pull/9850)) ([0ca6aaa](https://github.com/serverless/serverless/commit/0ca6aaae526b16df2039edff5db166a39bb1de10)) ([Piotr Grzesik](https://github.com/pgrzesik))

### Maintenance Improvements

- **CLI Onboarding:** Adjust summary messages in deploy step ([#9835](https://github.com/serverless/serverless/pull/9835)) ([b751c50](https://github.com/serverless/serverless/commit/b751c505c8050e229edb77d44016925c4e52a05e)) ([Piotr Grzesik](https://github.com/pgrzesik))
- Replace `fse.stat` with `fs.promises.stat` ([#9845](https://github.com/serverless/serverless/issues/9845)) ([bb0484e](https://github.com/serverless/serverless/commit/bb0484e6b54a3cc6aed46ff23100e08c90c995ce)) ([Sudipto Das](https://github.com/sdas13))
- **Telemetry:** Recognize `notificationsMode` ([#9851](https://github.com/serverless/serverless/pull/9851)) ([00fdba1](https://github.com/serverless/serverless/commit/00fdba154655b15b5b2de4b9ceca08f8bfce599e)) ([Piotr Grzesik](https://github.com/pgrzesik))

## [2.54.0](https://github.com/serverless/serverless/compare/v2.53.1...v2.54.0) (2021-08-12)

### Features

- **AWS IAM:** Resign from deprecating old format of IAM settings ([#9778](https://github.com/serverless/serverless/pull/9778)) ([847dd8f](https://github.com/serverless/serverless/commit/847dd8f47503ddf03971122e5700110aa3ff77d1)) ([Mariusz Nowak](https://github.com/medikoo))
- **AWS Lambda:** Add support for multiple subscription filters ([#9760](https://github.com/serverless/serverless/issues/9760)) ([5c9ca56](https://github.com/serverless/serverless/commit/5c9ca56d14a90dfd9aa5c064bd15137504336ed7)) ([Han Sang Hoon (한상훈)](https://github.com/poerty))
- **AWS API Gateway:** Deprecate default for `identitySource` for `request` authorizers with disabled caching ([#9825](https://github.com/serverless/serverless/pull/9825)) ([0e01d9e](https://github.com/serverless/serverless/commit/0e01d9e337860b9d1136586fbfaf0c43ac21cde0)) ([Piotr Grzesik](https://github.com/pgrzesik))
- **CLI:** Deprecate `-v` as alias for `--verbose` ([#9811](https://github.com/serverless/serverless/commit/53b41eb53aeefe22dc29b785a428f3b184906d2c)) ([53b41eb](https://github.com/serverless/serverless/commit/53b41eb53aeefe22dc29b785a428f3b184906d2c)) ([Piotr Grzesik](https://github.com/pgrzesik))

### Bug Fixes

- **AWS Deploy:** Ensure right code for `deploy -f` deprecation ([#9833](https://github.com/serverless/serverless/pull/9833)) ([90877d5](https://github.com/serverless/serverless/commit/90877d575ec9436db30a3a16fc90e5190ea30018)) ([Mariusz Nowak](https://github.com/medikoo))
- **AWS Layers:** Support references to external layers ([#9826](https://github.com/serverless/serverless/pull/9826)) ([dc74f41](https://github.com/serverless/serverless/commit/dc74f41470447c1fab0a646c15284a4eb212ecb6)) ([Piotr Grzesik](https://github.com/pgrzesik))
- **Variables:** Unconditionally deprecate old vars engine extensions ([#9827](https://github.com/serverless/serverless/pull/9827)) ([b7f4e08](https://github.com/serverless/serverless/commit/b7f4e08661cd149a29ae7107241a16928dc606eb)) ([Mariusz Nowak](https://github.com/medikoo))

### [2.53.1](https://github.com/serverless/serverless/compare/v2.53.0...v2.53.1) (2021-08-06)

### Bug Fixes

- **AWS API Gateway:** Ensure `MinimumCompressionSize` can be set to 0 ([#9806](https://github.com/serverless/serverless/issues/9806)) ([f0ae032](https://github.com/serverless/serverless/commit/f0ae032252f88d4d864c2bfe526d70064168231a)) ([Lewis Putz](https://github.com/Putzy))

### Maintenance Improvements

- **CLI:** Change formatting of notifications ([#9807](https://github.com/serverless/serverless/issues/9807)) ([7c51f55](https://github.com/serverless/serverless/commit/7c51f55f5b8af6f853560ba5d757c65b1068a7ab)) ([Piotr Grzesik](https://github.com/pgrzesik))
- Use `async` in `lib/utils` ([#9809](https://github.com/serverless/serverless/issues/9809)) ([48c3d99](https://github.com/serverless/serverless/commit/48c3d990beccef7dc3f4b5d29ec5bc4238fd9cf6)) ([Nyambayar Turbat](https://github.com/nyamba))

## [2.53.0](https://github.com/serverless/serverless/compare/v2.52.1...v2.53.0) (2021-08-04)

### Features

- **Variables:** Accept case-insensitive strings in `strToBool` ([#9770](https://github.com/serverless/serverless/issues/9770)) ([612f668](https://github.com/serverless/serverless/commit/612f668c931013bea21b91f47d9cbfd1c7dbb888)) ([Shane R. Spencer](https://github.com/whardier))

### Bug Fixes

- **AWS API Gateway:** Ensure to attach validator when required parameters are defined ([#9793](https://github.com/serverless/serverless/issues/9793)) ([d275459](https://github.com/serverless/serverless/commit/d2754594c462afd39e1576312e361ca57d4f13f2)) ([Karim Kanso](https://github.com/kazkansouh))
- **Plugins:** Improve error message when a plugin is missing ([#9798](https://github.com/serverless/serverless/issues/9798)) ([5c9df56](https://github.com/serverless/serverless/commit/5c9df56f1bc89af1fd929519f3cf8dac967e514d)) ([Matthieu Napoli](https://github.com/mnapoli))

### Maintenance Improvements

- **Telemetry:** Recognize used variable sources ([#9790](https://github.com/serverless/serverless/pull/9790)) ([60d729b](https://github.com/serverless/serverless/commit/60d729b5d42ae32cc418b9578582da3dc8492754)) ([Piotr Grzesik](https://github.com/pgrzesik))
- Replace `fse.readdir` with `fs.promises.readdir` ([#9780](https://github.com/serverless/serverless/issues/9780)) ([1e00f9e](https://github.com/serverless/serverless/commit/1e00f9edfb5f7618759f9f03d0dad58701a5a27a)) ([Sudipto Das](https://github.com/sdas13))
- Use `async` in `lib/plugins/create` ([#9683](https://github.com/serverless/serverless/issues/9683)) ([4b87497](https://github.com/serverless/serverless/commit/4b87497875a19348e444763eea85671ed2c4f0b7)) ([Nyambayar Turbat](https://github.com/nyamba))
- Use `async` in `lib/plugins/plugin` ([#9680](https://github.com/serverless/serverless/issues/9680)) ([377da09](https://github.com/serverless/serverless/commit/377da097c564778c8d2c42ffe49e38000c520106)) ([Nyambayar Turbat](https://github.com/nyamba))

### [2.52.1](https://github.com/serverless/serverless/compare/v2.52.0...v2.52.1) (2021-07-22)

### Bug Fixes

- **CLI Onboarding:** Ensure credentials resolution is always performed before deploy step ([#9761](https://github.com/serverless/serverless/pull/9761)) ([b85f393](https://github.com/serverless/serverless/commit/b85f3934ed87e9c78494e9ad26163ee1d041599e)) ([Piotr Grzesik](https://github.com/pgrzesik))
- **CLI:**
  - Ensure `processedInput` is properly resolved in local fallback ([#9769](https://github.com/serverless/serverless/pull/9769)) ([464467e](https://github.com/serverless/serverless/commit/464467e2bece1bf3f35fe60041fa170f412087d3)) ([Mariusz Nowak](https://github.com/medikoo))
  - Fix validation of `deprecationNotificationMode` config option ([#9762](https://github.com/serverless/serverless/issues/9762)) ([916c76f](https://github.com/serverless/serverless/commit/916c76f48ca86c3e31b719d2bb655c34d0287cec)) ([frozenbonito](https://github.com/frozenbonito))
- Fix `functions[]` validation (ignore `null` values) ([#9756](https://github.com/serverless/serverless/pull/9756)) ([922ec00](https://github.com/serverless/serverless/commit/922ec0093f0d4ab6f2b2055c6e6f2d5ec1f9d06e)) ([Mariusz Nowak](https://github.com/medikoo))

### Maintenance Improvements

- **CLI Onboarding:**
  - Move `dashboard-login` step from `@serverless/dashboard-plugin` ([#9766](https://github.com/serverless/serverless/pull/9766)) ([adef710](https://github.com/serverless/serverless/commit/adef7102df2958e976445f0c247895f82decebf9)) ([Piotr Grzesik](https://github.com/pgrzesik))
  - Move `dashboard-set-org` from `@serverless/dashboard-plugin` ([#9766](https://github.com/serverless/serverless/pull/9766)) ([afdf77c](https://github.com/serverless/serverless/commit/afdf77c960c990f7daa445532789aebb9dc15a53)) ([Piotr Grzesik](https://github.com/pgrzesik))
- **Telemetry:** Use `prompt-with-history` for onboarding telemetry ([#9768](https://github.com/serverless/serverless/pull/9768)) ([4d56be5](https://github.com/serverless/serverless/commit/4d56be562a4bdaf2588bdc42227a451d098d1420)) ([Piotr Grzesik](https://github.com/pgrzesik))
- Replace `fse.unlink` with `fs.promises.unlink` ([#9754](https://github.com/serverless/serverless/issues/9754)) ([daee1d5](https://github.com/serverless/serverless/commit/daee1d5375efdb748b85b85a2a4675ac3277001f)) ([Sudipto Das](https://github.com/sdas13))

## [2.52.0](https://github.com/serverless/serverless/compare/v2.51.2...v2.52.0) (2021-07-15)

### Features

- **AWS CloudFormation:** Allow to disable default export names ([#9748](https://github.com/serverless/serverless/pull/9748)) ([6f49488](https://github.com/serverless/serverless/commit/6f494888cc01853894ec33859edbd77a06dc9d76)) ([Piotr Grzesik](https://github.com/pgrzesik))
- **CLI:** Automatically expand loaded env variables from `.env` files ([#9615](https://github.com/serverless/serverless/issues/9615)) ([1864969](https://github.com/serverless/serverless/commit/186496922a0c4d69f3101dde0a9f4a0d89995ad0)) ([David Asensio Cañas](https://github.com/d-asensio))

### Bug Fixes

- **CLI:** Do not validate configuration with `plugin ..` commands ([#9741](https://github.com/serverless/serverless/pull/9741)) ([040036d](https://github.com/serverless/serverless/commit/040036d1869ceb207da6dad53f17e1ee1b6ee20a)) ([Mariusz Nowak](https://github.com/medikoo))
- **Variables:** In `ssm` source auto parse only object JSON notation ([#9747](https://github.com/serverless/serverless/pull/9747)) ([8c741d1](https://github.com/serverless/serverless/commit/8c741d1d97f021995f37a61d7340ddfa749cdab9)) ([Mariusz Nowak](https://github.com/medikoo))
- Improve `functions` validation ([#9741](https://github.com/serverless/serverless/pull/9741)) ([3e58d62](https://github.com/serverless/serverless/commit/3e58d628e7b8f4dbc8e14adf94dd98546099f3be)) ([Mariusz Nowak](https://github.com/medikoo))

### Maintenance Improvements

- **Telemetry:** Record initial context for interactive setup ([#9736](https://github.com/serverless/serverless/pull/9736)) ([560aee5](https://github.com/serverless/serverless/commit/560aee5feb9f143e93933f6536e76edc9a3e56bb)) ([Piotr Grzesik](https://github.com/pgrzesik))
- **CLI:** Reuse already imported module ([#9741](https://github.com/serverless/serverless/pull/9741)) ([be441cc](https://github.com/serverless/serverless/commit/be441ccd9157b351fffe6ea21664624aeeeb4b29)) ([Mariusz Nowak](https://github.com/medikoo))
- Add `has-local-credentials` util ([#9736](https://github.com/serverless/serverless/pull/9736)) ([82a35b3](https://github.com/serverless/serverless/commit/82a35b3903ad5d8f761612105036fc11a37e9e55)) ([Piotr Grzesik](https://github.com/pgrzesik))

### [2.51.2](https://github.com/serverless/serverless/compare/v2.51.1...v2.51.2) (2021-07-08)

### Bug Fixes

- **Packaging:** Fix `package.artifact` validation for S3 urls ([#9725](https://github.com/serverless/serverless/issues/9725)) ([ab3c543](https://github.com/serverless/serverless/commit/ab3c543089b0fde4107fc0e579c19f85e0a4ee79)) ([Mariusz Nowak](https://github.com/medikoo))

### [2.51.1](https://github.com/serverless/serverless/compare/v2.51.0...v2.51.1) (2021-07-08)

### Bug Fixes

- **CLI:** Fix `SIGINT` signal handling ([#9712](https://github.com/serverless/serverless/issues/9712)) ([c5a3f69](https://github.com/serverless/serverless/commit/c5a3f6907a115ea2d511b0aa9905a2e762514867)) ([Mariusz Nowak](https://github.com/medikoo))
- **Packaging:** Validate `package.artifact` paths ([#9721](https://github.com/serverless/serverless/issues/9721)) ([21c0fed](https://github.com/serverless/serverless/commit/21c0fedc507651bb98687acc4145ed667d853589)) ([Mariusz Nowak](https://github.com/medikoo))
- **AWS Local Invocation:** Bump AWS Java pom version to pull in fix ([#9714](https://github.com/serverless/serverless/issues/9714)) ([504b42a](https://github.com/serverless/serverless/commit/504b42ae0fefd04ccfa013746371c49a02d8a4d3)) ([tlloyd-synalogik](https://github.com/tlloyd-synalogik))

### Maintenance Improvements

- **Telemetry:**
  - Report all interruption signals ([#9712](https://github.com/serverless/serverless/issues/9712)) ([7354c20](https://github.com/serverless/serverless/commit/7354c2000f25d526f8c3fd97c6d4d22054388755)) ([Mariusz Nowak](https://github.com/medikoo))
  - Report whether we're in context of TTY terminal ([#9712](https://github.com/serverless/serverless/issues/9712)) ([9cea555](https://github.com/serverless/serverless/commit/9cea555e88bdaadf717def21b5298a64c7ce79b9)) ([Mariusz Nowak](https://github.com/medikoo))
  - Ensure no doubled telemetry in edge cases ([#9716](https://github.com/serverless/serverless/issues/9716)) ([fd5005e](https://github.com/serverless/serverless/commit/fd5005e404debe103ca54974ca9aee431554ceb8)) ([Mariusz Nowak](https://github.com/medikoo))
- **CLI:** Improve module imports order ([#9712](https://github.com/serverless/serverless/issues/9712)) ([dff2799](https://github.com/serverless/serverless/commit/dff2799941a1da8c2d5fe76144393db241a7637c)) ([Mariusz Nowak](https://github.com/medikoo))

## [2.51.0](https://github.com/serverless/serverless/compare/v2.50.0...v2.51.0) (2021-07-06)

### Features

- **AWS Kafka:** Add support for `SASL/PLAIN` auth to `kafka` event ([#9666](https://github.com/serverless/serverless/pull/9666)) ([3e14f06](https://github.com/serverless/serverless/commit/3e14f063052385026425021379bfc883dac5ff74)) ([Daniele Iasella](https://github.com/overbit))
- **CLI:** New `warn:summary` (default) deprecations logging mode ([#9693](https://github.com/serverless/serverless/pull/9693)) ([9b624a5](https://github.com/serverless/serverless/commit/9b624a50677a0363c052b4ea567c050af7863073)) ([Mariusz Nowak](https://github.com/medikoo))

### Bug Fixes

- **CLI:** Recognize `--verbose` option in `info` command ([#9695](https://github.com/serverless/serverless/pull/9695)) ([b124152](https://github.com/serverless/serverless/commit/b1241522ec378f7b7b431050ddc861fef040efc4)) ([Mariusz Nowak](https://github.com/medikoo))

### Maintenance Improvements

- **CLI:** Fix typo in error message ([#9682](https://github.com/serverless/serverless/issues/9682)) ([f16c45f](https://github.com/serverless/serverless/commit/f16c45f84b8be1e469bfdd92191fc760b8f1631e)) ([KIDANI Akito](https://github.com/kdnakt))
- **Telemetry:**
  - Properly handle situation when not in service dir in credentials step ([#9678](https://github.com/serverless/serverless/pull/9678)) ([b21c1e4](https://github.com/serverless/serverless/commit/b21c1e415b67cdc8f1fb0ab14152eaf3c6550894))
  - Ensure to pass all steps with configured questions ([#9701](https://github.com/serverless/serverless/pull/9701)) ([b5d3167](https://github.com/serverless/serverless/commit/b5d3167e9fdd5f08af1389b975322f2146b22507)) ([Piotr Grzesik](https://github.com/pgrzesik))
  - Correctly report `outcome` for interactive setup ([#9699](https://github.com/serverless/serverless/pull/9699)) ([0c5b8dd](https://github.com/serverless/serverless/commit/0c5b8dd831bcde80628c2ac548172ffaa9ce9ca6)) ([Piotr Grzesik](https://github.com/pgrzesik))
  - Ensure telemetry generation and related utils are sync ([#9692](https://github.com/serverless/serverless/pull/9692)) ([e65199c](https://github.com/serverless/serverless/commit/e65199c05213e1bac17acedc84cdd6dfd26ff00a)) ([Piotr Grzesik](https://github.com/pgrzesik))
  - Report `commandUsage` as object ([#9690](https://github.com/serverless/serverless/pull/9690)) ([cc24bc2](https://github.com/serverless/serverless/commit/cc24bc2ae280237b3d439e1934ab75710e0f259f)) ([Piotr Grzesik](https://github.com/pgrzesik))
  - Handle interruptions and persist telemetry data ([#9699](https://github.com/serverless/serverless/pull/9699)) ([502f7e7](https://github.com/serverless/serverless/commit/502f7e711f0954c2960fb790b749002aeb1789fc)) ([Piotr Grzesik](https://github.com/pgrzesik))
- Drop old variables engine related deprecation ([#9698](https://github.com/serverless/serverless/pull/9698)) ([5b54ed2](https://github.com/serverless/serverless/commit/5b54ed2e2685c24439c0f835b50a024dbf9d39a9)) ([Mariusz Nowak](https://github.com/medikoo))
- Make deprecations default mode internally modifyable ([#9693](https://github.com/serverless/serverless/pull/9693)) ([07a69a8](https://github.com/serverless/serverless/commit/07a69a836c506e3ab8ab976ef27d4f3b672722f7)) ([Mariusz Nowak](https://github.com/medikoo))
- Replace `fse.createWriteStream` with `fs.createWriteStream` ([#9687](https://github.com/serverless/serverless/pull/9687)) ([3500f64](https://github.com/serverless/serverless/commit/3500f641f5212f196f75081e67d1d1518ac3bb6b)) ([Sudipto Das](https://github.com/sdas13))
- Use `async` in `lib/plugins/package` ([#9644](https://github.com/serverless/serverless/issues/9644)) ([db67b35](https://github.com/serverless/serverless/commit/db67b353c9ed578d7dd334d162efa1ec11fbfa18)) ([Nyambayar Turbat](https://github.com/nyamba))

## [2.50.0](https://github.com/serverless/serverless/compare/v2.49.0...v2.50.0) (2021-07-01)

### Features

- **AWS Lambda:** Support `Fn::If` for `Principal.AWS` ([#9664](https://github.com/serverless/serverless/pull/9664)) ([894ac5b](https://github.com/serverless/serverless/commit/894ac5b6b67eb384dbc29b927161121679afce2d)) ([Piotr Grzesik](https://github.com/pgrzesik))
- **AWS Deploy:** Deprecate `function` option in `deploy` command ([#9364](https://github.com/serverless/serverless/pull/9364)) ([d861d11](https://github.com/serverless/serverless/commit/d861d119ef94baaaa266934783e00a50182d7434)) ([Jaakko Lappalainen](https://github.com/jkklapp) & [Piotr Grzesik](https://github.com/pgrzesik))
- **Variables:**
  - Resolve vars in strings which are subject to be joined ([#9657](https://github.com/serverless/serverless/pull/9657)) ([0e3db01](https://github.com/serverless/serverless/commit/0e3db01db8aeb08b03a98dd7f58a09b66ec8c49e)) ([Mariusz Nowak](https://github.com/medikoo))
  - Support `aws:region` and `aws:accountId` variables ([#9662](https://github.com/serverless/serverless/pull/9662)) ([33794ea](https://github.com/serverless/serverless/commit/33794ea504e714912137796009c29c802f2e24f0)) ([Piotr Grzesik](https://github.com/pgrzesik))
  - Support variables across file address resolution ([#9657](https://github.com/serverless/serverless/pull/9657)) ([80b7640](https://github.com/serverless/serverless/commit/80b76406ac305ccb7e55cabd0bd39be6ac7c67c6)) ([Mariusz Nowak](https://github.com/medikoo))

### Bug Fixes

- **AWS Deploy:** Meaningfully report inaccessible file artifacts ([#9668](https://github.com/serverless/serverless/pull/9668)) ([23c290e](https://github.com/serverless/serverless/commit/23c290e4b4049242d62cfb57f4be6aadff6aecf8)) ([Mariusz Nowak](https://github.com/medikoo))
- **AWS Local Invocation:** Fix error handling of invalid file content ([#9667](https://github.com/serverless/serverless/pull/9667)) ([e836722](https://github.com/serverless/serverless/commit/e836722f976af98eb69fc6d3a85781bb7434dfac)) ([Mariusz Nowak](https://github.com/medikoo))
- **CLI Onboarding:**
  - Do not attempt local fallback during onboarding ([#9660](https://github.com/serverless/serverless/pull/9660)) ([ae5be0f](https://github.com/serverless/serverless/commit/ae5be0f5dafaad933000e98142fcb1ec60e04555)) ([Piotr Grzesik](https://github.com/pgrzesik))
  - Only call `handleError` if plugin defined ([#9659](https://github.com/serverless/serverless/pull/9659)) ([a80681f](https://github.com/serverless/serverless/commit/a80681ffbf23391cb31d34b8eecaef310d9599a3)) ([Piotr Grzesik](https://github.com/pgrzesik))

### Maintenance Improvements

- **Telemetry:**
  - Include `commandUsage` in case of error ([#9671](https://github.com/serverless/serverless/pull/9671)) ([ac03d83](https://github.com/serverless/serverless/commit/ac03d832896eec26773e5ce06c22c249d240a9ed)) ([Piotr Grzesik](https://github.com/pgrzesik))
  - Increase error location coverage ([#9669](https://github.com/serverless/serverless/pull/9669)) ([7264d16](https://github.com/serverless/serverless/commit/7264d1672e93fdb1046cf7ebe859b607c80e31ca)) ([Mariusz Nowak](https://github.com/medikoo))
  - Report `configValidationMode` ([#9669](https://github.com/serverless/serverless/pull/9669)) ([8e2d48f](https://github.com/serverless/serverless/commit/8e2d48fee5a471a960b6a7b55cbd12edc5eb07e6)) ([Mariusz Nowak](https://github.com/medikoo))
  - Report configuration validation result ([#9669](https://github.com/serverless/serverless/pull/9669)) ([01f1586](https://github.com/serverless/serverless/commit/01f158695b22d721320a77a9a0b68b166c63dc3f)) ([Mariusz Nowak](https://github.com/medikoo))

### Templates

- Adjust `runtime` for `openwhisk-python` template ([#9670](https://github.com/serverless/serverless/pull/9670)) ([6a020d1](https://github.com/serverless/serverless/commit/6a020d121ff2dacd6ad62a824964944ae391a662)) ([Piotr Grzesik](https://github.com/pgrzesik))

## [2.49.0](https://github.com/serverless/serverless/compare/v2.48.1...v2.49.0) (2021-06-29)

### Features

- **AWS Lambda:** Support `Fn::FindInMap` for `vpc` config ([#9653](https://github.com/serverless/serverless/pull/9653)) ([34a9d91](https://github.com/serverless/serverless/commit/34a9d91870c36d154427830d3555425b5fd2d14c)) ([Piotr Grzesik](https://github.com/pgrzesik))
- **CLI Onboarding:**
  - Add deploy step ([#9536](https://github.com/serverless/serverless/pull/9536)) ([28a06a0](https://github.com/serverless/serverless/commit/28a06a05aba4306d2f28d26652067b44ed105151)) ([Piotr Grzesik](https://github.com/pgrzesik))
  - Allow to setup Dashboard Provider credentials during onboarding ([#9509](https://github.com/serverless/serverless/pull/9509)) ([feb0421](https://github.com/serverless/serverless/commit/feb04219f6be186cc54462906394bbd82f9747b5)) ([Piotr Grzesik](https://github.com/pgrzesik))

### Bug Fixes

- **CLI:** Fix standalone detection on Windows ([#9648](https://github.com/serverless/serverless/pull/9648)) ([4bc8e2e](https://github.com/serverless/serverless/commit/4bc8e2e1944364e2c218cbfc05039c43afa9ab01)) ([Mariusz Nowak](https://github.com/medikoo))
- **Packaging:** Fix artifact generation with temp path on other device ([#9616](https://github.com/serverless/serverless/issues/9616)) ([70fb8b9](https://github.com/serverless/serverless/commit/70fb8b986133789b38fad93c0abab01eaf9dc0c7)) ([Sean Dawson](https://github.com/NoxHarmonium))

### Maintenance Improvements

- Replace `fse.chmod` with `fs.promises.chmod` ([#9647](https://github.com/serverless/serverless/issues/9647)) ([83c7726](https://github.com/serverless/serverless/commit/83c772684d655b233522d1e75128476c29339c83)) ([Sudipto Das](https://github.com/sdas13))
- Add `resolveRegion` util ([#9509](https://github.com/serverless/serverless/pull/9509)) ([98e3668](https://github.com/serverless/serverless/commit/98e3668a2cbb701c109e1ff8dd70a0ece1770f7b)) ([Piotr Grzesik](https://github.com/pgrzesik))
- Add `resolveStage` util ([#9509](https://github.com/serverless/serverless/pull/9509)) ([09bb4fa](https://github.com/serverless/serverless/commit/09bb4fa12270807702dcc26483dbcb94cf733342)) ([Piotr Grzesik](https://github.com/pgrzesik))
- **Telemetry:**
  - Add `hasLocalCredentials` ([#9594](https://github.com/serverless/serverless/pull/9594)) ([5e0d805](https://github.com/serverless/serverless/commit/5e0d80579e857d016fb4db13288b9d81a3859ee1)) ([Piotr Grzesik](https://github.com/pgrzesik))
  - Add interactive flow support ([#9594](https://github.com/serverless/serverless/pull/9594)) ([0eba2dc](https://github.com/serverless/serverless/commit/0eba2dcdfeabba58920462ac2cd54d86e3101e05)) ([Piotr Grzesik](https://github.com/pgrzesik))

### Templates

- Use `amd64` arch for `aws-go` template ([#9646](https://github.com/serverless/serverless/issues/9646)) ([cb9f7e2](https://github.com/serverless/serverless/commit/cb9f7e20eedc1db7bb31671c97449e269e992ded)) ([Andrey Kabylin](https://github.com/sysint64))

### [2.48.1](https://github.com/serverless/serverless/compare/v2.48.0...v2.48.1) (2021-06-25)

### Bug Fixes

- **AWS API Gateway:** Ensure that `Method` resource depends on `Permission` resource ([#9609](https://github.com/serverless/serverless/pull/9609)) ([93b9027](https://github.com/serverless/serverless/commit/93b9027f0d48650df50d0a8352d0edaf2bd2e0da)) ([Nyambayar Turbat](https://github.com/nyamba))
- **CLI:**
  - Ensure to list version in case of fallback from some versions ([#9641](https://github.com/serverless/serverless/pull/9641)) ([989cb82](https://github.com/serverless/serverless/commit/989cb82db313177a64e062cc800eb85ba501fab5)) ([Mariusz Nowak](https://github.com/medikoo))
  - Fix standalone detection (case of a fallback from standalone) ([#9641](https://github.com/serverless/serverless/pull/9641)) ([1681af4](https://github.com/serverless/serverless/commit/1681af4897eeec20c1d1af292f9bfde5b1e9ffc3)) ([Mariusz Nowak](https://github.com/medikoo))

### Maintenance Improvements

- **Config Schema:** Improve error message and documentation ([#9639](https://github.com/serverless/serverless/pull/9639)) ([a36247b](https://github.com/serverless/serverless/commit/a36247b7ac1212a27f5e8d671ba39ba4c7e4de18)) ([Mariusz Nowak](https://github.com/medikoo))
- Replace `fse.rename` with `fs.promises.rename` ([#9605](https://github.com/serverless/serverless/issues/9605)) ([e6ff228](https://github.com/serverless/serverless/commit/e6ff2286a55d8cb8f82e58d8173b0a386a4b1767)) ([Sudipto Das](https://github.com/sdas13))

## [2.48.0](https://github.com/serverless/serverless/compare/v2.47.0...v2.48.0) (2021-06-21)

### Features

- Introduce an opt-in "error" deprecation notification mode ([#9623](https://github.com/serverless/serverless/pull/9623)) ([c22a8b9](https://github.com/serverless/serverless/commit/c22a8b99f2f64a76c592e800a8cf698dbff75b9c)) ([Mariusz Nowak](https://github.com/medikoo))

### Bug Fixes

- **Packaging:** Do not report hashing deprecations for container lambdas ([#9623](https://github.com/serverless/serverless/pull/9623)) ([68c2a08](https://github.com/serverless/serverless/commit/68c2a084f91b58832bd5417efaaa3fd6a6178d53)) ([Mariusz Nowak](https://github.com/medikoo))
- Ensure to support deprecation settings at early stage of processing ([#9623](https://github.com/serverless/serverless/pull/9623))([011e0ce](https://github.com/serverless/serverless/commit/011e0ce45cec4b1273268fcab4f99e377fae092e)) ([Mariusz Nowak](https://github.com/medikoo))

### Maintenance Improvements

- **Telemetry:** Recognize `constructs` ([#9628](https://github.com/serverless/serverless/pull/9628)) ([9e10cea](https://github.com/serverless/serverless/commit/9e10ceaf81e8b9d13867937fedc9502a1ff4e320)) ([Piotr Grzesik](https://github.com/pgrzesik))
- Ensure early access to configuration in logDeprecation method ([#9623](https://github.com/serverless/serverless/pull/9623)) ([53b9762](https://github.com/serverless/serverless/commit/53b97621dccdef8f9f2e15e2f4f31045b46970e2)) ([Mariusz Nowak](https://github.com/medikoo))

## [2.47.0](https://github.com/serverless/serverless/compare/v2.46.0...v2.47.0) (2021-06-18)

### Features

- Deprecate Node.js v10 ([#9600](https://github.com/serverless/serverless/issues/9600)) ([e24fdc9](https://github.com/serverless/serverless/commit/e24fdc9f08f9849aad4136261695e44476484b0d)) ([Milind Vaidya](https://github.com/vaidyamilind))
- **AWS HTTP API:** Support `payload` version per function ([#9551](https://github.com/serverless/serverless/issues/9551)) ([87ce28e](https://github.com/serverless/serverless/commit/87ce28ee4ea0e975859b8d32be8f2edd824b4cda)) ([Nyambayar Turbat](https://github.com/nyamba))
- **AWS S3:** Support CloudFormation instrinsic functions at `functions[].events[].s3.bucket` property ([#9617](https://github.com/serverless/serverless/issues/9617)) ([42690a7](https://github.com/serverless/serverless/commit/42690a7352751581a8dbd44a4f776af17ab20da8)) ([Piotr Grzesik](https://github.com/pgrzesik))

### Bug Fixes

- **AWS Cognito:** Fix user pool premission resource logical id normalization ([#9592](https://github.com/serverless/serverless/issues/9592)) ([f4c9b58](https://github.com/serverless/serverless/commit/f4c9b58b10a45ae342934e9a61dcdea0c2ef11e2)) ([arunkc](https://github.com/Arun-kc))
- **AWS Invocation:** Fix resolution of options with non-AWS provider ([#9602](https://github.com/serverless/serverless/issues/9602)) ([54da80e](https://github.com/serverless/serverless/commit/54da80e26497b8f1dbcd3027775628d11e1c6814)) ([Corentin Doue](https://github.com/CorentinDoue))
- **Variables:** Ensure to strip unrecognized legacy `ssm` resolver instructions ([#9601](https://github.com/serverless/serverless/issues/9601)) ([f61859f](https://github.com/serverless/serverless/commit/f61859fd25908b13b6d9638c550e88ef4a08392e)) ([Mariusz Nowak](https://github.com/medikoo))

### Maintenance Improvements

- **Variables:** Improve error message ([#9601](https://github.com/serverless/serverless/issues/9601)) ([4a732e2](https://github.com/serverless/serverless/commit/4a732e2ebf6c7d81f5e0fbdc2e9bcb4715e4cadf)) ([Mariusz Nowak](https://github.com/medikoo))

### [2.46.0](https://github.com/serverless/serverless/compare/v2.45.2...v2.46.0) (2021-06-11)

### Features

- **CLI Onboarding:** Make it service setup specific, remove `auto-update` step ([#9582](https://github.com/serverless/serverless/pull/9582)) ([519f77e](https://github.com/serverless/serverless/commit/519f77e1a876cea62843a99e58bab1e011e62fa3)) ([Piotr Grzesik](https://github.com/pgrzesik))
- **Config Schema:** Improve error messaging for same type variants ([#9588](https://github.com/serverless/serverless/pull/9588)) ([8ac249b](https://github.com/serverless/serverless/commit/8ac249b1eadf3173359e02886e71bb89234ebd51)) ([Mariusz Nowak](https://github.com/medikoo))
- Show information on how to turn on auto updates in postinstall step ([#9582](https://github.com/serverless/serverless/pull/9582)) ([93c88c0](https://github.com/serverless/serverless/commit/93c88c0b8d1eea6455ca6ecb9a022f814f8e79b3)) ([Piotr Grzesik](https://github.com/pgrzesik))

### Bug Fixes

- **Variables:**
  - Fix resolution visibility of top level properties (as `outputs`) ([#9591](https://github.com/serverless/serverless/pull/9591)) ([004c6e2](https://github.com/serverless/serverless/commit/004c6e26beec98fbfb757aab05f18a623a03cf76)) ([Mariusz Nowak](https://github.com/medikoo))
  - Improve required properties resolution validation order ([#9591](https://github.com/serverless/serverless/pull/9591)) ([727d7f4](https://github.com/serverless/serverless/commit/727d7f4f089051223db88ceb85a62adabf07dc9e)) ([Mariusz Nowak](https://github.com/medikoo))
  - Meaningfully report misuse of dashboard sources ([#9591](https://github.com/serverless/serverless/pull/9591)) ([cc09c62](https://github.com/serverless/serverless/commit/cc09c62301f15f89febc50120a7a398640935470)) ([Mariusz Nowak](https://github.com/medikoo))
  - Recognize `tenant` setting (while deprecated it's still recognized by plugin) ([#9591](https://github.com/serverless/serverless/pull/9591)) ([aa45876](https://github.com/serverless/serverless/commit/aa4587604476314485a8094bdae04e0148b9e53c)) ([Mariusz Nowak](https://github.com/medikoo))

### Maintenance Improvements

- Reorganize and document service configuration dependencies ([#9591](https://github.com/serverless/serverless/pull/9591)) ([c86a76c](https://github.com/serverless/serverless/commit/c86a76cb60038765404c988da13dfc6ffde28fe6)) ([Mariusz Nowak](https://github.com/medikoo))
- **Telemetry:** Optimise reported error location length:
  - Remove eventual `/node_modules` prefix ([#9587](https://github.com/serverless/serverless/pull/9587)) ([f3ff6d2](https://github.com/serverless/serverless/commit/f3ff6d21758b61116c748746cefe8c1a3d6ab776)) ([Mariusz Nowak](https://github.com/medikoo))
  - Replace repeated paths with `^` ([#9587](https://github.com/serverless/serverless/pull/9587)) ([f6a7d03](https://github.com/serverless/serverless/commit/f6a7d03b04bd13f91bc247e518a1ad12496ead8c)) ([Mariusz Nowak](https://github.com/medikoo))

### [2.45.2](https://github.com/serverless/serverless/compare/v2.45.1...v2.45.2) (2021-06-09)

### Bug Fixes

- **Variables:**
  - Skip unrecognized sources check with partial resolution ([#9579](https://github.com/serverless/serverless/pull/9579)) ([93b89fc](https://github.com/serverless/serverless/commit/93b89fcb51759d0fe938a40e7de76b6abd313efd)) ([Mariusz Nowak](https://github.com/medikoo))
  - Ensure to report only unrecognized sources ([#9579](https://github.com/serverless/serverless/pull/9579)) ([98701f3](https://github.com/serverless/serverless/commit/98701f367907aa4c0ed61de7c3aeb4a7b7eac174)) ([Mariusz Nowak](https://github.com/medikoo))

### [2.45.1](https://github.com/serverless/serverless/compare/v2.45.0...v2.45.1) (2021-06-08)

### Bug Fixes

- Fix `projectDir` pattern in config schema ([#9574](https://github.com/serverless/serverless/pull/9574)) ([8954b5f](https://github.com/serverless/serverless/commit/8954b5f9cc3e2431036ccb876c46fb8cc99dc0d9)) ([Mariusz Nowak](https://github.com/medikoo))

## [2.45.0](https://github.com/serverless/serverless/compare/v2.44.0...v2.45.0) (2021-06-08)

### Features

- **Variables:** Allow to reference files in scope of a project directory ([#9561](https://github.com/serverless/serverless/pull/9561)) ([8dbb56e](https://github.com/serverless/serverless/commit/8dbb56ecbda2c6b8e8eaccbba7c7842ba8382847)) ([Mariusz Nowak](https://github.com/medikoo))
- Introduce project directory setting, configurable via `projectDir` ([#9561](https://github.com/serverless/serverless/pull/9561)) ([d6e4b49](https://github.com/serverless/serverless/commit/d6e4b49ae28d5898d92b913a0d2c100bd29f4303)) ([Mariusz Nowak](https://github.com/medikoo))

### Bug Fixes

- **AWS API Gateway:** Don't create log group resource if access logs are disabled ([#9560](https://github.com/serverless/serverless/pull/9560)) ([a116dfe](https://github.com/serverless/serverless/commit/a116dfec22697dd0511623c6a1e6d2d829d4ba10)) ([Piotr Grzesik](https://github.com/pgrzesik))
- **Templates:** Allow usage of `google-nodejs-typescript` template ([#9557](https://github.com/serverless/serverless/pull/9557)) ([accf5bd](https://github.com/serverless/serverless/commit/accf5bd082400f654eba5e7d322bcb205c9ae709)) ([Corentin Doue](https://github.com/CorentinDoue))

### Maintenance Improvements

- Upgrade `dotenv` to v10 ([#9569](https://github.com/serverless/serverless/pull/9569)) ([99d1697](https://github.com/serverless/serverless/commit/99d1697050ac2b2ca675794501c08230f2cc3f7b)) ([Mariusz Nowak](https://github.com/medikoo))

## [2.44.0](https://github.com/serverless/serverless/compare/v2.43.1...v2.44.0) (2021-06-02)

### Features

- **CLI Onboarding:** Make it service setup specific:
  - If not in service context, immediately go into project setup questions (skip "Do you want to create a new project" question) ([#9524](https://github.com/serverless/serverless/pull/9524)) ([d5e2baf](https://github.com/serverless/serverless/commit/d5e2baf714958c5718610659887f485f9bd161e4)) ([Piotr Grzesik](https://github.com/pgrzesik))
  - Remove `tab-completion` from interactive flow ([#9531](https://github.com/serverless/serverless/pull/9531)) ([3bac0f3](https://github.com/serverless/serverless/commit/3bac0f37f0f23abed387f0952772e3cdf5d47320)) ([Piotr Grzesik](https://github.com/pgrzesik))

### Bug Fixes

- **Variables:**
  - Unify error messaging for function resolvers ([#9545](https://github.com/serverless/serverless/pull/9545)) ([bb3b766](https://github.com/serverless/serverless/commit/bb3b766946311848c707abc0fc7e749393f4527c)) ([Mariusz Nowak](https://github.com/medikoo))
  - Ensure to apply a resolution with a new resolver in case of a fallback to a local version ([#9544](https://github.com/serverless/serverless/pull/9544)) ([14a5275](https://github.com/serverless/serverless/commit/14a5275c0d6a127e211935b8b8f57a949e1ffad6)) ([Mariusz Nowak](https://github.com/medikoo))
- **CLI:**
  - Ensure to gently handle missing data from global installation in case of local fallback ([#9539](https://github.com/serverless/serverless/pull/9539)) ([1b90dfb](https://github.com/serverless/serverless/commit/1b90dfb0659dab3852ace330fd7c497321b80710)) ([Mariusz Nowak](https://github.com/medikoo))
- Fix handling of numeric error codes coming from AWS SDK requests ([#9538](https://github.com/serverless/serverless/pull/9538)) ([f2cdbae](https://github.com/serverless/serverless/commit/f2cdbae1eb6d327935336a38deda099b8f5ffee2)) ([Mariusz Nowak](https://github.com/medikoo))

### Maintenance Improvements

- **Variables:**
  - Cleanup handling of `variableSyntax` default ([#9544](https://github.com/serverless/serverless/pull/9544)) ([582d150](https://github.com/serverless/serverless/commit/582d150ceb01d3f597a30fcc82201ffa325c4617)) ([Mariusz Nowak](https://github.com/medikoo))
  - Seclude resolution of sources from external plugins ([#9544](https://github.com/serverless/serverless/pull/9544)) ([6efc161](https://github.com/serverless/serverless/commit/6efc161e5f7892275c798f6003ea5ee557bf3b26)) ([Mariusz Nowak](https://github.com/medikoo))

### [2.43.1](https://github.com/serverless/serverless/compare/v2.43.0...v2.43.1) (2021-05-25)

### Bug Fixes

- **AWS Local Invocation:** Fix invalid result handling ([#9507](https://github.com/serverless/serverless/pull/9507)) ([bbff029](https://github.com/serverless/serverless/commit/bbff0290db8a56cf599522c5ec0abc901359a0f9)) ([Mariusz Nowak](https://github.com/medikoo))
- **Telemetry:** Ensure to pass proper config for local fallback error handler ([#9519](https://github.com/serverless/serverless/pull/9519)) ([9b2a111](https://github.com/serverless/serverless/commit/9b2a1114850914a4ac96b19c7fcb0bf031822ea4)) ([Piotr Grzesik](https://github.com/pgrzesik))
- **Variables:** Ensure proper resolution of AWS-related variables in case of errors ([#9518](https://github.com/serverless/serverless/pull/9518)) ([ee66585](https://github.com/serverless/serverless/commit/ee66585fdcfc32d135ed0cdc6bad8d440c7e9e38)) ([Piotr Grzesik](https://github.com/pgrzesik))

### Maintenance Improvements

- Use `download` from `@serverless/utils` ([#9513](https://github.com/serverless/serverless/pull/9513)) ([716b312](https://github.com/serverless/serverless/commit/716b31216e4873bbb986c5a2a54fda708a591cd1)) ([Piotr Grzesik](https://github.com/pgrzesik))
- **CLI Onboarding:** Use "Starter" not "Empty" for templates ([#9514](https://github.com/serverless/serverless/pull/9514)) ([2984adb](https://github.com/serverless/serverless/commit/2984adb0456f7d6e93b0c778a1c588ee20459928)) ([Piotr Grzesik](https://github.com/pgrzesik))
- **Telemetry:** Improve AWS stack error codes ([#9510](https://github.com/serverless/serverless/issues/9510)) ([c265905](https://github.com/serverless/serverless/commit/c265905f518f8cbea170c5a2774670c60de0e36c)) ([Mariusz Nowak](https://github.com/medikoo))

## [2.43.0](https://github.com/serverless/serverless/compare/v2.42.0...v2.43.0) (2021-05-20)

### Features

- **CLI Onboarding:** In `service` step, if possible propose a default project name ([#9503](https://github.com/serverless/serverless/pull/9503)) ([dee54ed](https://github.com/serverless/serverless/commit/dee54ed55c0a0697eefdde99d5ec8aee321ce041)) ([Piotr Grzesik](https://github.com/pgrzesik))

### Bug Fixes

- **AWS Deploy:** Fix stack errors processing ([#9505](https://github.com/serverless/serverless/pull/9505)) ([18a9b2b](https://github.com/serverless/serverless/commit/18a9b2b6f5734083de751cf182c6be61736be11f)) ([Mariusz Nowak](https://github.com/medikoo))
- **AWS IAM:** Do not depend on default execution role when custom role provided ([29f0e9c](https://github.com/serverless/serverless/commit/29f0e9c840e4b1ae9949925bc5a2a9d2de742271)) ([Piotr Grzesik](https://github.com/pgrzesik))

### Maintenance Improvements

- Do not recognize YAML Exception as user error ([#9505](https://github.com/serverless/serverless/pull/9505)) ([db16df2](https://github.com/serverless/serverless/commit/db16df2faad9cc63eb8e98ce90829642707546fb)) ([Mariusz Nowak](https://github.com/medikoo))
- Do not rely on `serverless.yamlParser` ([#9505](https://github.com/serverless/serverless/pull/9505)) ([aa8f7be](https://github.com/serverless/serverless/commit/aa8f7bec1caed4211adcb87ad0a73cd796f065d5)) ([Mariusz Nowak](https://github.com/medikoo))
- Ensure codes for user errors ([#9505](https://github.com/serverless/serverless/pull/9505)) ([6adaa9f](https://github.com/serverless/serverless/commit/6adaa9f56ed6e9708065767be602f484d0091679)) ([Mariusz Nowak](https://github.com/medikoo))

## [2.42.0](https://github.com/serverless/serverless/compare/v2.41.2...v2.42.0) (2021-05-19)

### Features

- **CLI Onboarding:**
  - Switch to templates hosted at [`serverless/examples`](https://github.com/serverless/examples/) ([#9484](https://github.com/serverless/serverless/pull/9484)) ([e4ea50d](https://github.com/serverless/serverless/commit/e4ea50d401628cb22612196b7e9b50c4344dab8a)) ([Piotr Grzesik](https://github.com/pgrzesik))
  - Support `--name` CLI option for `service` step ([#9471](https://github.com/serverless/serverless/pull/9471)) ([53575dc](https://github.com/serverless/serverless/commit/53575dc36017ded5ff60e5edf18fb7a9fd9d30e9)) ([Piotr Grzesik](https://github.com/pgrzesik))
  - Support `template-path` CLI option for `service` step ([#9471](https://github.com/serverless/serverless/pull/9471)) ([98c9700](https://github.com/serverless/serverless/commit/98c9700bcda328552f04116a51549f66e3d7b026)) ([Piotr Grzesik](https://github.com/pgrzesik))
  - Support `template` and `template-url` options for `service` step ([#9495](https://github.com/serverless/serverless/pull/9495)) ([f1a288c](https://github.com/serverless/serverless/commit/f1a288ce2c30e1377d8b411a90db3b1b2857d4fb)) ([Piotr Grzesik](https://github.com/pgrzesik))

### Bug Fixes

- **AWS API Gateway:** Fix schema for `apiKeys` and `permissionsBoundary` ([#9489](https://github.com/serverless/serverless/pull/9489)) ([5601025](https://github.com/serverless/serverless/commit/5601025dd8a4075cb463e2dcfb67d6c52984582a)) ([lyndoh](https://github.com/lyndoh))
- **AWS Local Invocation:** Report invalid handler path meaningfully ([#9499](https://github.com/serverless/serverless/pull/9499)) ([a2297ee](https://github.com/serverless/serverless/commit/a2297ee916dd79463d4efcfd6f7fe1f8e0e50d87)) ([Mariusz Nowak](https://github.com/medikoo))
- **Variables:**
  - Fix reporting of variable resolution errors trigger by variable resolution made in JS function resolvers ([#9482](https://github.com/serverless/serverless/pull/9482)) ([f6b7cfa](https://github.com/serverless/serverless/commit/f6b7cfaaaff81b84011f0f6168a651979089e1c9)) ([Mariusz Nowak](https://github.com/medikoo))
  - Ensure report user error as user error ([#9499](https://github.com/serverless/serverless/pull/9499)) ([a8f4aeb](https://github.com/serverless/serverless/commit/a8f4aebe5d482a491d86d3427b259db00674cc72)) ([Mariusz Nowak](https://github.com/medikoo))
- Expose remote lambda invocation failure as user error (([#9499](https://github.com/serverless/serverless/pull/9499)) [8f3d4e4](https://github.com/serverless/serverless/commit/8f3d4e4bdb1df1e107c5113d013164a2396f0f64)) ([Mariusz Nowak](https://github.com/medikoo))
- Expose template error with user error ([#9499](https://github.com/serverless/serverless/pull/9499)) ([07b60a6](https://github.com/serverless/serverless/commit/07b60a6bb42796e6f060730ce4bf22762942b0b8)) ([Mariusz Nowak](https://github.com/medikoo))
- Construct user errors with `ServerlessError` ([#9499](https://github.com/serverless/serverless/pull/9499)) ([c563581](https://github.com/serverless/serverless/commit/c563581ac98764edf653c1a5337d1b7d2b61ea63)) ([Mariusz Nowak](https://github.com/medikoo))
- Do not stumble on missing resource properties ([#9499](https://github.com/serverless/serverless/pull/9499)) ([f87aee2](https://github.com/serverless/serverless/commit/f87aee268dd19f9b90a7018032c77454d2084f12)) ([Mariusz Nowak](https://github.com/medikoo))

### Maintenance Improvements

- **Telemetry:**
  - Report resource types for user configured resources at `resources.Resources` ([#9501](https://github.com/serverless/serverless/pull/9501)) ([8d0ff07](https://github.com/serverless/serverless/commit/8d0ff078f7f0b565c1d35af1319f76a407afeb4b)) ([Mariusz Nowak](https://github.com/medikoo))
  - Normalize AWS request error codes ([#9499](https://github.com/serverless/serverless/pull/9499)) ([5a23931](https://github.com/serverless/serverless/commit/5a23931734ee80b80182008197c92985975f1646)) ([Mariusz Nowak](https://github.com/medikoo))
  - Report error location for non-normative error codes ([#9499](https://github.com/serverless/serverless/pull/9499)) ([07d5b9c](https://github.com/serverless/serverless/commit/07d5b9c19e9f5365af322a4862b03ccdca05655c)) ([Mariusz Nowak](https://github.com/medikoo))
  - Remove dead path error handling ([#9499](https://github.com/serverless/serverless/pull/9499)) ([91b10ed](https://github.com/serverless/serverless/commit/91b10ed208f2dee4b690df633f4275f658355044)) ([Mariusz Nowak](https://github.com/medikoo))
  - Improve granularity of stack deployment error codes ([#9499](https://github.com/serverless/serverless/pull/9499)) ([a6f4dc3](https://github.com/serverless/serverless/commit/a6f4dc3b2be2aa9ba2255d57cf9a9d23eae02994)) ([Mariusz Nowak](https://github.com/medikoo))
- **CLI Onboarding:** Add `history` and `stepHistory` to `context` ([#9481](https://github.com/serverless/serverless/pull/9481)) ([9eea885](https://github.com/serverless/serverless/commit/9eea885b390fc88bb62c1e2a5c3d108444139703)) ([Piotr Grzesik](https://github.com/pgrzesik))
- Add `create-from-local-template` util ([#9471](https://github.com/serverless/serverless/pull/9471)) ([03011ba](https://github.com/serverless/serverless/commit/03011baf07d262a5b9702b34b75a997e3f525d28)) ([Piotr Grzesik](https://github.com/pgrzesik))
- Ensure to propagate as is stack monitoring error ([#9499](https://github.com/serverless/serverless/pull/9499)) ([a46abe3](https://github.com/serverless/serverless/commit/a46abe3d56cd667ad436fbceb283dd9e0f747d7b)) ([Mariusz Nowak](https://github.com/medikoo))

## [2.41.2](https://github.com/serverless/serverless/compare/v2.41.1...v2.41.2) (2021-05-13)

### Bug Fixes

- **CLI:**
  - In error handler fallback to local version only if we're not in its context (fix infinite recursion issue which put `serverless` process on stall) ([#9472](https://github.com/serverless/serverless/pull/9472)) ([7047c34](https://github.com/serverless/serverless/commit/7047c349299ea829b0d43efedd191782dad10219)) ([Mariusz Nowak](https://github.com/medikoo))
  - Ensure resolved CLI params are correct in local fallback ([#9472](https://github.com/serverless/serverless/pull/9472)) ([65a1f38](https://github.com/serverless/serverless/commit/65a1f3875cda7f06d3ab47f21362a630d7d0415f)) ([Mariusz Nowak](https://github.com/medikoo))
- **Telemetry:** If global & local fallback versions are recent enough to report outcome, report with global ([#9472](https://github.com/serverless/serverless/pull/9472)) ([eeddf9f](https://github.com/serverless/serverless/commit/eeddf9f518612f6f7ef805eb3ed9b13fb3036114)) ([Mariusz Nowak](https://github.com/medikoo))

### Templates

- **Templates:** Add `google-nodejs-typescript` template ([#9445](https://github.com/serverless/serverless/issues/9445)) ([9cc05ad](https://github.com/serverless/serverless/commit/9cc05ad2f659709746d1df9811b95118c583db27)) ([Corentin Doue](https://github.com/CorentinDoue))

### Maintenance Improvements

- **CLI Onboarding:**
  - Seclude from internal Framework logic ([#9410](https://github.com/serverless/serverless/pull/9410)) ([7864f4d](https://github.com/serverless/serverless/commit/7864f4d28d4c4ed8325e64c8dfca891845edf392)) ([Mariusz Nowak](https://github.com/medikoo))
  - Integrate steps from dashboard plugin ([#9410](https://github.com/serverless/serverless/pull/9410)) ([105807a](https://github.com/serverless/serverless/commit/105807a674820f2d8501f3b8539c3725fceab215)) ([Mariusz Nowak](https://github.com/medikoo))
  - Refactor to async/await ([#9410](https://github.com/serverless/serverless/pull/9410)) ([1060d14](https://github.com/serverless/serverless/commit/1060d1468ba587519df482e95a54bbc8d199cad8)) ([Mariusz Nowak](https://github.com/medikoo))
  - Simplify tabcompletion support check ([#9410](https://github.com/serverless/serverless/pull/9410)) ([c13586e](https://github.com/serverless/serverless/commit/c13586ee23614da75d71f40ff24037b9aad46c2c)) ([Mariusz Nowak](https://github.com/medikoo))
- **Telemetry:** Make `generatePayload` `serverless` independent ([#9410](https://github.com/serverless/serverless/pull/9410)) ([4f6a50a](https://github.com/serverless/serverless/commit/4f6a50a2e145e664405b00661d801b6ad094f418)) ([Mariusz Nowak](https://github.com/medikoo))
- **CLI:** Rely internally on `@serverless/utils/log` ([#9410](https://github.com/serverless/serverless/pull/9410)) ([05588f7](https://github.com/serverless/serverless/commit/05588f77c0bbc900198ce458099ea2db066f3601)) ([Mariusz Nowak](https://github.com/medikoo))
- Refactor `isNpmPackageWritable` to not depend on `serverless` ([b915cc4](https://github.com/serverless/serverless/commit/b915cc467183d146785466965abbe318c349f0c9)) ([Mariusz Nowak](https://github.com/medikoo))

### [2.41.1](https://github.com/serverless/serverless/compare/v2.41.0...v2.41.1) (2021-05-11)

### Bug Fixes

- **CLI:** Correctly resolve version during local fallback ([#9463](https://github.com/serverless/serverless/pull/9463)) ([bbfe742](https://github.com/serverless/serverless/commit/bbfe742b2458f31254b11128b8ed506a47293abe)) ([Piotr Grzesik](https://github.com/pgrzesik))

## [2.41.0](https://github.com/serverless/serverless/compare/v2.40.0...v2.41.0) (2021-05-11)

### Features

- **AWS API Gateway:** Support disabling default endpoint ([#9404](https://github.com/serverless/serverless/issues/9404)) ([ec90945](https://github.com/serverless/serverless/commit/ec909452b5167e05d892d2c44bc46b4ff7d7470a)) ([lyndoh](https://github.com/lyndoh))
- **AWS Lambda:** Deprecate `nodejs12.x` as default runtime ([#9416](https://github.com/serverless/serverless/issues/9416)) ([9e558ee](https://github.com/serverless/serverless/commit/9e558eefd66e9dafcb16b3636b934d753ade001e)) ([Jaakko Lappalainen](https://github.com/jkklapp))

### Bug Fixes

- **AWS API Gateway:** Support `Fn::Split` for `vpcEndpointIds` schema ([#9455](https://github.com/serverless/serverless/pull/9455)) ([56f8587](https://github.com/serverless/serverless/commit/56f85874c6b9da44b8fbc326dfe3bce33bf8c41e)) ([Piotr Grzesik](https://github.com/pgrzesik))
- **AWS Lambda:** Ensure that docker image is build and pushed only once ([#9446](https://github.com/serverless/serverless/pull/9446)) ([277f4e8](https://github.com/serverless/serverless/commit/277f4e8e9c53c0572981407eb45cecba050462a7)) ([Piotr Grzesik](https://github.com/pgrzesik))
- **CLI:**
  - Ensure to report only unrecognized sources as unrecognized ([#9449](https://github.com/serverless/serverless/pull/9449)) ([27e21e8](https://github.com/serverless/serverless/commit/27e21e8fca560732df3fa5c36c56682ef89b53c5)) ([Mariusz Nowak](https://github.com/medikoo))
  - Fix local installation fallback ([#9454](https://github.com/serverless/serverless/pull/9454)) ([fa8c076](https://github.com/serverless/serverless/commit/fa8c076c564377ec632992a6a156bc4937ec08e1)) ([Mariusz Nowak](https://github.com/medikoo))
- **Packaging:** Fix support of the artifact S3 uri with region ([#9411](https://github.com/serverless/serverless/issues/9411)) ([40e56fc](https://github.com/serverless/serverless/commit/40e56fc0e9f71f06068d7d4c30178db8b2260357)) ([Zach Whaley](https://github.com/zachwhaley))

### Maintenance Improvements

- **Telemetry:**
  - Ensure telemetry only matches js stacktrace paths ([#9447](https://github.com/serverless/serverless/pull/9447)) ([7361e04](https://github.com/serverless/serverless/commit/7361e049608d40e4199c797abbad552ea831f5a5)) ([Piotr Grzesik](https://github.com/pgrzesik))
  - For local fallback ensure to report locally used version ([#9454](https://github.com/serverless/serverless/pull/9454)) ([096ed96](https://github.com/serverless/serverless/commit/096ed9652bff399965c81c9aedb93b42c2b8caf5)) ([Mariusz Nowak](https://github.com/medikoo))
  - Let old versions report telemetry old way ([#9454](https://github.com/serverless/serverless/pull/9454)) ([4d077d1](https://github.com/serverless/serverless/commit/4d077d1653fcc41e362587e5d13dfa8dd43d3bc3)) ([Mariusz Nowak](https://github.com/medikoo))

## [2.40.0](https://github.com/serverless/serverless/compare/v2.39.2...v2.40.0) (2021-05-06)

### Features

- **AWS Lambda:** Add `ecr.scanOnPush` configuration option ([#9379](https://github.com/serverless/serverless/issues/9379)) ([078ec59](https://github.com/serverless/serverless/commit/078ec59058e1c37bd81388c7e81087b48fc2ba24)) ([Nicholas Wehr](https://github.com/wwwehr))

### Bug Fixes

- **CLI:** Do not validate command when falling back to old version ([#9437](https://github.com/serverless/serverless/pull/9437)) ([9624338](https://github.com/serverless/serverless/commit/962433864ff4f52bf178b7afc1b6e54e58e58702)) ([Mariusz Nowak](https://github.com/medikoo))

### [2.39.2](https://github.com/serverless/serverless/compare/v2.39.1...v2.39.2) (2021-05-04)

### Bug Fixes

- **CLI:**
  - Fix internal command resolution in case of a fallback to local version from older global version ([#9429](https://github.com/serverless/serverless/pull/9429)) ([b7a113d](https://github.com/serverless/serverless/commit/b7a113d48d634f89a91a31cd05b8d2e57f540c77)) ([Mariusz Nowak](https://github.com/medikoo))
  - Ensure to support `disableDeprecations` setting when validating not supported options ([#9429](https://github.com/serverless/serverless/pull/9429)) ([da476ad](https://github.com/serverless/serverless/commit/da476ad7ac52b331ae47102e01a9270a18b40833)) ([Mariusz Nowak](https://github.com/medikoo))
- **Telemetry:**
  - Do not attempt to report unrecognized commands ([#9427](https://github.com/serverless/serverless/pull/9427)) ([2c2c77f](https://github.com/serverless/serverless/commit/2c2c77f90518e73921b0f4dd02767b5ad4476db4)) ([Piotr Grzesik](https://github.com/pgrzesik))
  - Do not share telemetry cache folder with old versions ([#9429](https://github.com/serverless/serverless/pull/9429)) ([ae9442e](https://github.com/serverless/serverless/commit/ae9442e53b04648ff5b9c436ef86765d2ad9d872)) ([Mariusz Nowak](https://github.com/medikoo))
- **AWS Deploy:** Fix changes detection when VPC with intrinsic CF functions is involved ([#9425](https://github.com/serverless/serverless/pull/9425)) ([2c7f024](https://github.com/serverless/serverless/commit/2c7f024a57dd70c0e05d6ab7f40e530c96f2351a)) ([Piotr Grzesik](https://github.com/pgrzesik))
- Fix `provider.vpc` configuration schema ([#9425](https://github.com/serverless/serverless/pull/9)) ([7338358](https://github.com/serverless/serverless/commit/7338358126ac249374e341b7b19ce83582ecff1d)) ([Piotr Grzesik](https://github.com/pgrzesik))

### [2.39.1](https://github.com/serverless/serverless/compare/v2.39.0...v2.39.1) (2021-05-03)

### Bug Fixes

- **AWS HTTP API:** Ensure to apply tags to stage ([#9407](https://github.com/serverless/serverless/issues/9407)) ([80511a4](https://github.com/serverless/serverless/commit/80511a4b17e77e22cf8b20d1ce50eef7506d4f7f)) ([Filip Golonka](https://github.com/filipgolonka))

### Maintenance Improvements

- **Telemetry:**
  - Handle error locations not enclosed in parens ([#9419](https://github.com/serverless/serverless/pull/9419)) ([3ab0628](https://github.com/serverless/serverless/commit/3ab06282fdc9455f364fd73bd14761bae0c8d289)) ([Piotr Grzesik](https://github.com/pgrzesik))
  - Properly resolve location when for only relative paths ([#9418](https://github.com/serverless/serverless/issues/9418)) ([3ccf6a3](https://github.com/serverless/serverless/commit/3ccf6a3af3de093fabfa33a966b7a0a922712845)) ([Piotr Grzesik](https://github.com/pgrzesik))
  - Split stack lines properly on all OS-es ([#9419](https://github.com/serverless/serverless/pull/9419)) ([bdbf154](https://github.com/serverless/serverless/commit/bdbf154c97abde6ad2ff807dbea3ad1110ee5fec)) ([Piotr Grzesik](https://github.com/pgrzesik))

## [2.39.0](https://github.com/serverless/serverless/compare/v2.38.0...v2.39.0) (2021-04-30)

### Features

- **AWS IAM:** Support `provider.iam.role.path` ([#9363](https://github.com/serverless/serverless/issues/9363)) ([c8adc0c](https://github.com/serverless/serverless/commit/c8adc0c796a6558c3fe1bc86e3647d3fe711a9ad)) ([Android3000](https://github.com/Android3000))
- **Variables:** Expose variable resolver function to variable sources ([#9368](https://github.com/serverless/serverless/pull/9368)) ([2ff58b1](https://github.com/serverless/serverless/commit/2ff58b16bf3fe766685d5b6c30fd9a2bb6e22f0f)) ([Mariusz Nowak](https://github.com/medikoo))

### Bug Fixes

- **AWS API Gateway:** Ensure unique name for request validator ([#9382](https://github.com/serverless/serverless/pull/9382)) ([a05e88d](https://github.com/serverless/serverless/commit/a05e88d92e010ddfe019d5b5b873547b7d187d6d)) ([Piotr Grzesik](https://github.com/pgrzesik))
- **AWS S3:** Fix parsing of the artifact S3 url ([#9380](https://github.com/serverless/serverless/issues/9380)) ([360925d](https://github.com/serverless/serverless/commit/360925d2e0cddb6fbbbb72ca47495aa71a43d1fc)) ([Stephen](https://github.com/bishtawi))
- **CLI:** Ensure no general help is listed under interactive setup help ([#9406](https://github.com/serverless/serverless/pull/9406)) ([132c830](https://github.com/serverless/serverless/commit/132c830b0a86998efbae1b4984dc9cea85957d61)) ([Mariusz Nowak](https://github.com/medikoo))

### Maintenance Improvements

- **Telemetry:**
  - Report failures via telemetry ([#9396](https://github.com/serverless/serverless/pull/9396)) ([5861d08](https://github.com/serverless/serverless/commit/5861d08768a06e2e88609d0785ce590d3f693683)) ([Piotr Grzesik](https://github.com/pgrzesik))
  - Ensure that container commands do not trigger telemetry ([#9397](https://github.com/serverless/serverless/pull/9397)) ([85b9e53](https://github.com/serverless/serverless/commit/85b9e5319df48904664f966e988cc725116ce865)) ([Mariusz Nowak](https://github.com/medikoo))
  - Add `commandDurationMs` to payload ([#9401](https://github.com/serverless/serverless/pull/9401)) ([d647125](https://github.com/serverless/serverless/commit/d647125ff5daa07972675fd28690d42746ab223b)) ([Piotr Grzesik](https://github.com/pgrzesik))
  - Add `commandOptionNames` to payload ([#9387](https://github.com/serverless/serverless/pull/9387)) ([f5b2b9b](https://github.com/serverless/serverless/commit/f5b2b9be395c9c2d3de4c4f91f991276bc22dc33)) ([Piotr Grzesik](https://github.com/pgrzesik))
- Ensure `code` to `ServerlessError` instances ([#9357](https://github.com/serverless/serverless/pull/9357)) ([822a7cf](https://github.com/serverless/serverless/commit/822a7cf9f527514b53fd8cfc5c172ec5dc53f4ce)) ([Piotr Grzesik](https://github.com/pgrzesik))

### Templates

- Update dependencies for `cloudflare` template ([#9373](https://github.com/serverless/serverless/issues/9373)) ([543423d](https://github.com/serverless/serverless/commit/543423d869ba35c6866506bb49a8642700214b3a)) ([YErii](https://github.com/YEriin))

## [2.38.0](https://github.com/serverless/serverless/compare/v2.37.2...v2.38.0) (2021-04-23)

### Features

- **AWS CloudFormation:** Add default export names to outputs ([#9313](https://github.com/serverless/serverless/issues/9313)) ([7e139bb](https://github.com/serverless/serverless/commit/7e139bb0136e0d053f4f6f8cb2876480bb2a485e)) ([Joseph Cha](https://github.com/js-cha))

### Bug Fixes

- **AWS API Gateway:** Create one request validator and reuse ([#9319](https://github.com/serverless/serverless/issues/9319)) ([154351f](https://github.com/serverless/serverless/commit/154351f1a5925a745873895014ed31f03b2842b3)) ([Jacques](https://github.com/gambit66))
- **Variables:** Fix unresolved sources notifications ([#9356](https://github.com/serverless/serverless/issues/9356)) ([53a7872](https://github.com/serverless/serverless/commit/53a7872f78f51938b409925e052d34f2dc85abbd)) ([Mariusz Nowak](https://github.com/medikoo))

### [2.37.2](https://github.com/serverless/serverless/compare/v2.37.1...v2.37.2) (2021-04-22)

### Bug Fixes

- **API:** Bring back legacy `service.serviceFilename` for plugins ([#9352](https://github.com/serverless/serverless/pull/9352)) ([6c896a5](https://github.com/serverless/serverless/commit/6c896a5ffdfc067ffded0791a34a943c89ea6136)) ([Mariusz Nowak](https://github.com/medikoo))

## [2.37.1](https://github.com/serverless/serverless/compare/v2.37.0...v2.37.1) (2021-04-21)

### Bug Fixes

- **API:** Ensure `config.servicePath` is `config.serviceDir` live alias ([#9343](https://github.com/serverless/serverless/pull/9343)) ([2967065](https://github.com/serverless/serverless/commit/2967065bc7e45d7b0f0fac4ad9b9c33b977482fa)) ([Mariusz Nowak](https://github.com/medikoo))

### Maintenance Improvements

- **Telemetry:** Allow to disable telemetry via `SLS_TELEMETRY_DISABLED` ([#9338](https://github.com/serverless/serverless/pull/9338)) ([ba7fd2e](https://github.com/serverless/serverless/commit/ba7fd2e1b428b2b76378aa90d0a19e8ec0d12498)) ([Piotr Grzesik](https://github.com/pgrzesik))

## [2.37.0](https://github.com/serverless/serverless/compare/v2.36.0...v2.37.0) (2021-04-20)

### Features

- **Variables:** `sls:stage` variable ([#9296](https://github.com/serverless/serverless/issues/9296)) ([ef91ae1](https://github.com/serverless/serverless/commit/ef91ae1972448fd342aeda6189884f2d8b454756)) ([Matthieu Napoli](https://github.com/mnapoli))

### Bug Fixes

- **API:** Ensure `serverless.config.servicePath` ([#9330](https://github.com/serverless/serverless/pull/9330)) ([ff589ba](https://github.com/serverless/serverless/commit/ff589baef483ecd53d9d4301bf2e846d87d62224)) ([Mariusz Nowak](https://github.com/medikoo))
- **CLI:** Ensure to recognize interactive CLI command properly ([#9332](https://github.com/serverless/serverless/pull/9332)) ([40fddcc](https://github.com/serverless/serverless/commit/40fddcc0eecee0c34310ac36508975fdd58da939)) ([Mariusz Nowak](https://github.com/medikoo))
- **Telemetry:** Do not send request when there are no events ([#9331](https://github.com/serverless/serverless/pull/9331)) ([f430224](https://github.com/serverless/serverless/commit/f4302249a9d9bfba46ca3fb6823cc8da27f20939)) ([Piotr Grzesik](https://github.com/pgrzesik))

## [2.36.0](https://github.com/serverless/serverless/compare/v2.35.0...v2.36.0) (2021-04-20)

### Features

- **AWS ALB:** Support `functions[].events[].alb.targetGroupName` ([#9222](https://github.com/serverless/serverless/issues/9222)) ([2cb8160](https://github.com/serverless/serverless/commit/2cb81608c8cb7dff7d6b9139235f2285b4b76044)) ([Gabriel Plassard](https://github.com/cbm-gplassard))
- Support `Fn::Split` for `vpc` properties ([#9266](https://github.com/serverless/serverless/issues/9266)) ([19805d7](https://github.com/serverless/serverless/commit/19805d71eabb68bd7fd4046aa23090ef85fb1c36)) ([Frédéric Barthelet](https://github.com/fredericbarthelet))

### Bug Fixes

- **AWS API Gateway:**
  - Correctly recognize `type` for `authorizerId` ([#9300](https://github.com/serverless/serverless/pull/9300)) ([ef25d68](https://github.com/serverless/serverless/commit/ef25d681372d1ef16cdba24981a41eb957e59821)) ([Piotr Grzesik](https://github.com/pgrzesik))
  - Deprecate invalid `apiGateway` settings ([#9238](https://github.com/serverless/serverless/issues/9238)) ([bca46e5](https://github.com/serverless/serverless/commit/bca46e5ab509065e6b3b2031446593ac23aac261)) ([Jaakko Lappalainen](https://github.com/jkklapp))
- **AWS IAM:** Deprecate `iam.role.permissionBoundary` in favor of `iam.role.permissionsBoundary` ([#9318](https://github.com/serverless/serverless/issues/9318)) ([d1c3b3f](https://github.com/serverless/serverless/commit/d1c3b3fbac0d2c80db7284d3ef4d8b808c33fa03)) ([Android3000](https://github.com/Android3000))
- **AWS Local Invocation:**
  - Allow optional `package.artifact` for `java` ([#9320](https://github.com/serverless/serverless/pull/9320)) ([924a698](https://github.com/serverless/serverless/commit/924a698d2a9d7a663c1fcbb11707ad8d2ed30b6b)) ([Yuji Yamano](https://github.com/yyamano))
  - Do not build Java bridge if `artifact` missing ([#9280](https://github.com/serverless/serverless/issues/9280)) ([5392a7d](https://github.com/serverless/serverless/commit/5392a7dce2a325d3f93d8e8508d63d16d93c6f51)) ([Yuji Yamano](https://github.com/yyamano))
- **CLI:**
  - Ensure to respect `disabledDeprecations` config options ([#9298](https://github.com/serverless/serverless/pull/9298)) ([05635c5](https://github.com/serverless/serverless/commit/05635c5e2df2f63710cac333fa6b2bab4e53c0c7)) ([Mariusz Nowak](https://github.com/medikoo))
  - Recognize `--aws-profile` option by schema ([#9324](https://github.com/serverless/serverless/pull/9324)) ([014ff94](https://github.com/serverless/serverless/commit/014ff949b7a8d62e246fd47f2addc48a37e362e2)) ([Mariusz Nowak](https://github.com/medikoo))
- **Plugins:** Prevent variables resolution with `plugin` command ([#9298](https://github.com/serverless/serverless/pull/9298)) ([8ac2706](https://github.com/serverless/serverless/commit/8ac27061999a0005d5aab342319cccfe6bbc9d49)) ([Mariusz Nowak](https://github.com/medikoo))
- **Variables:**
  - Clear escape slashes ([#9327](https://github.com/serverless/serverless/pull/9327)) ([c63244c](https://github.com/serverless/serverless/commit/c63244ce967c2c424fea50aaab9e19d355003913)) ([Mariusz Nowak](https://github.com/medikoo))
  - Fix file access error message generation ([#9281](https://github.com/serverless/serverless/pull/9281)) ([6dd3996](https://github.com/serverless/serverless/commit/6dd39968f2c49f3d98139994e320846b082b6005)) ([Mariusz Nowak](https://github.com/medikoo))

### Maintenance Improvements

- **AWS Credentials:** Remove undocumented `provider.credentials` ([#9287](https://github.com/serverless/serverless/pull/9287)) ([d26e2ae](https://github.com/serverless/serverless/commit/d26e2ae4b8db944bb6f9de55043b46285f08e726)) ([Piotr Grzesik](https://github.com/pgrzesik))
- **CLI:** Validate service dependency in CLI context ([#9298](https://github.com/serverless/serverless/pull/9298)) ([088088c](https://github.com/serverless/serverless/commit/088088c1d345ff07e0b098f28d46f325b9e0b4cc)) ([Mariusz Nowak](https://github.com/medikoo))
- **Variables:**
  - Use `serviceDir` option as replacement for `servicePath` ([#9307](https://github.com/serverless/serverless/pull/9307)) ([712a569](https://github.com/serverless/serverless/commit/712a569d5258f7770d4c23d8f0803c3d0062b79e)) ([Mariusz Nowak](https://github.com/medikoo))
  - Testing purpose variable resolution util ([#9281](https://github.com/serverless/serverless/pull/9281)) ([a2f1808](https://github.com/serverless/serverless/commit/a2f1808b2f2a2cc7cb18a57ccc81c68e6a16dfc2)) ([Mariusz Nowak](https://github.com/medikoo))
- **Telemetry**:
  - Rename `analytics` to `telemetry` ([#9310](https://github.com/serverless/serverless/pull/9310)) ([d667111](https://github.com/serverless/serverless/commit/d66711108b1e69dd33259e43a0770e78631b9a8a)) ([Piotr Grzesik](https://github.com/pgrzesik))
  - Send all payloads with single request ([#9304](https://github.com/serverless/serverless/pull/9304)) ([278935d](https://github.com/serverless/serverless/commit/278935d3f504d040783d508b4f99a132715c751b)) ([Piotr Grzesik](https://github.com/pgrzesik))
  - Record all commands and send only on deploy ([#9323](https://github.com/serverless/serverless/pull/9323)) ([d3ecb7c](https://github.com/serverless/serverless/commit/d3ecb7cc3b95853b9ad7c1574a0c8fcbc6d08007)) ([Piotr Grzesik](https://github.com/pgrzesik))
- Introduce `serviceDir` and `configurationFilename` ([#9307](https://github.com/serverless/serverless/pull/9307)) ([fc3a439](https://github.com/serverless/serverless/commit/fc3a4391b5411f77a51a84f93a166903c51cb80f)) ([Mariusz Nowak](https://github.com/medikoo))
- Refactor constructor to accept new service configuration options ([#9307](https://github.com/serverless/serverless/pull/9307)) ([c02cd06](https://github.com/serverless/serverless/commit/c02cd06d907b7e54fb5a36ddbea8df1e4d29d897)) ([Mariusz Nowak](https://github.com/medikoo))
- Mark functions `async` in `plugins/aws/remove` ([#9284](https://github.com/serverless/serverless/issues/9284)) ([0bdb7d8](https://github.com/serverless/serverless/commit/0bdb7d858c238ffca3c1b1113cbb6af8c39a62e9)) ([Jaakko Lappalainen](https://github.com/jkklapp))
- Refactor `aws` provider tests for prefixes ([#9301](https://github.com/serverless/serverless/issues/9301)) ([196776c](https://github.com/serverless/serverless/commit/196776c65e3295e3e6e7bf341e000b8ea7ee76b5)) ([AlinoeDoctari](https://github.com/AlinoeDoctari))
- Remove `config.update` usage ([#9307](https://github.com/serverless/serverless/pull/9307)) ([7fb55b6](https://github.com/serverless/serverless/commit/7fb55b64ddd1bd727e48c2baf49f312fb12d03ab)) ([Mariusz Nowak](https://github.com/medikoo))
- Remove support for internal `noDeploy` option ([#9281](https://github.com/serverless/serverless/pull/9281)) ([688d09b](https://github.com/serverless/serverless/commit/688d09b1f7f28f8b1656d3f7f31c6c2765a01b9d)) ([Mariusz Nowak](https://github.com/medikoo))
- Rename `servicePath` vars to `serviceDir` ([#9307](https://github.com/serverless/serverless/pull/9307)) ([e8c8f1c](https://github.com/serverless/serverless/commit/e8c8f1cfff785017e8e0e55cf8fb81c2dd0040a9)) ([Mariusz Nowak](https://github.com/medikoo))
- Replace `config.servicePath` with `service.dir` ([#9307](https://github.com/serverless/serverless/pull/9307)) ([87d3802](https://github.com/serverless/serverless/commit/87d380275bc3102c71daa0f87e8211b90e5d58c4)) ([Mariusz Nowak](https://github.com/medikoo))

## [2.35.0](https://github.com/serverless/serverless/compare/v2.34.0...v2.35.0) (2021-04-09)

### Features

- **AWS Lambda:** Add support for `cacheFrom` to `images` ([#9251](https://github.com/serverless/serverless/issues/9251)) ([341a886](https://github.com/serverless/serverless/commit/341a886874eb8a6c671f576323e75a77cffa1fd2)) ([Nicholas Wehr](https://github.com/wwwehr))

### Bug Fixes

- **AWS API Gateway:**
  - Do not attempt to remove `aws:` tags during update ([#9265](https://github.com/serverless/serverless/pull/9265)) ([dac06c8](https://github.com/serverless/serverless/commit/dac06c8ce644f0d219329474cb83c644ca61d880)) ([Piotr Grzesik](https://github.com/pgrzesik))
  - Proper stage resolution for custom resource ([#9277](https://github.com/serverless/serverless/pull/9277)) ([50e4425](https://github.com/serverless/serverless/commit/50e44258835551523a089714396f12f6b229239c)) ([Piotr Grzesik](https://github.com/pgrzesik))
- **AWS HTTP API:** Correctly accept `identitySource` as single CF intrinsic function value for HTTP API authorizers ([#9275](https://github.com/serverless/serverless/pull/9275)) ([fce73ad](https://github.com/serverless/serverless/commit/fce73ad4df0f776cf950733f9e88c3d390d6fc66)) ([Piotr Grzesik](https://github.com/pgrzesik))
- **AWS Local Invocation:**
  - Adjust `.gitignore` ([#9274](https://github.com/serverless/serverless/issues/9274)) ([ce210f7](https://github.com/serverless/serverless/commit/ce210f785271bf0fb54685ed1ef84fb09ceaf05d)) ([Yuji Yamano](https://github.com/yyamano))
  - Correctly `decompress` artifact ([#9259](https://github.com/serverless/serverless/issues/9259)) ([af8d2a1](https://github.com/serverless/serverless/commit/af8d2a19269bf5480a6a87d91a17609f7f931eac)) ([Yuji Yamano](https://github.com/yyamano))
  - Strip `null` envvars for `invoke local` command ([#9263](https://github.com/serverless/serverless/issues/9263)) ([34d2c2f](https://github.com/serverless/serverless/commit/34d2c2feacc3a19c740cf78e6dbeb0b9a9ad5a74)) ([Yuji Yamano](https://github.com/yyamano))

## [2.34.0](https://github.com/serverless/serverless/compare/v2.33.1...v2.34.0) (2021-04-07)

### Features

- **AWS Lambda:** Add support for `buildArgs` to `images` ([#9198](https://github.com/serverless/serverless/issues/9198)) ([efd32d4](https://github.com/serverless/serverless/commit/efd32d4725cd36e5365aa09f50b75d9ca241d26e)) ([Nicholas Wehr](https://github.com/wwwehr))

### Bug Fixes

- **AWS Deploy:** Correctly identify "no updates" error during deploy ([#9248](https://github.com/serverless/serverless/pull/9248)) ([0e6a1ce](https://github.com/serverless/serverless/commit/0e6a1ce2d4a28a480683192cc6ac639c7bfe0d8b)) ([Piotr Grzesik](https://github.com/pgrzesik))
- **CLI:** Ensure help output with missing `provider.name` ([#9235](https://github.com/serverless/serverless/pull/9235)) ([dae9058](https://github.com/serverless/serverless/commit/dae9058501ecc4ae8ff6b70e2bd1b22e914c241d)) ([Mariusz Nowak](https://github.com/medikoo))
- Avoid re-registration of `ts-node` ([#9254](https://github.com/serverless/serverless/issues/9254)) ([88baf06](https://github.com/serverless/serverless/commit/88baf06b42d4c08f3034965b8a7ffa23455ae3e3)) ([Adam Pancutt](https://github.com/apancutt))

### Maintenance Improvements

- **Analytics**: Account for functions with containers for analytics ([#9216](https://github.com/serverless/serverless/issues/9216)) ([c88a2ea](https://github.com/serverless/serverless/commit/c88a2ea61a2016982cd24050af8cac5989b07f79)) ([Piotr Grzesik](https://github.com/pgrzesik))

### [2.33.1](https://github.com/serverless/serverless/compare/v2.33.0...v2.33.1) (2021-04-03)

### Bug Fixes

- **Variables:** Ensure valid region value type in SSM resolution ([#9236](https://github.com/serverless/serverless/pull/9236)) ([83cac53](https://github.com/serverless/serverless/commit/83cac533a387a216dd6c151307a0dc69f36eef9e)) ([Mariusz Nowak](https://github.com/medikoo))

## [2.33.0](https://github.com/serverless/serverless/compare/v2.32.1...v2.33.0) (2021-04-02)

### Features

- **Plugins:** Announce "type" requirement in CLI option definitions ([#9230](https://github.com/serverless/serverless/pull/9230)) ([959da67](https://github.com/serverless/serverless/commit/959da67a5eb49f2256b4763f5f235537e6253659)) ([Mariusz Nowak](https://github.com/medikoo))

### Bug Fixes

- **CLI:** Do not assume "string" option type, when no type set in definition ([#9230](https://github.com/serverless/serverless/pull/9230)) ([c9be9bc](https://github.com/serverless/serverless/commit/c9be9bcc45d2da606d1660fb60156e56f5912e49)) ([Mariusz Nowak](https://github.com/medikoo))
- **Variables:** Support resolving "raw" JSON string form of SSM params ([#9229](https://github.com/serverless/serverless/pull/9229)) ([4eba512](https://github.com/serverless/serverless/commit/4eba512c1529a0d1d6c60e3f9de3bf98d6c23002)) ([Mariusz Nowak](https://github.com/medikoo))
- **Packaging:**
  - Ensure to apply dev dependency exclusion ([#92ee](https://github.com/serverless/serverless/pull/92ee)) ([7d16947](https://github.com/serverless/serverless/commit/7d16947273da079f4e844b4a62c98863206e848e)) ([Mariusz Nowak](https://github.com/medikoo))
  - Recognize `layers[].package.patterns` ([#9231](https://github.com/serverless/serverless/pull/9231)) ([9793c50](https://github.com/serverless/serverless/commit/9793c506ec364a4298a97e274c27c6f934749c74)) ([Mariusz Nowak](https://github.com/medikoo))
- **AWS CloudFront:** Recognize "?" character in `pathPattern` property ([#9234](https://github.com/serverless/serverless/pull/9234)) ([9d84596](https://github.com/serverless/serverless/commit/9d84596604a7338e82616723fe1a486c09272ae7)) ([Mariusz Nowak](https://github.com/medikoo))

### Maintenance Improvements

- Remove injustified "eslint-disable" comments ([#9232](https://github.com/serverless/serverless/pull/9232)) ([2011649](https://github.com/serverless/serverless/commit/20116495372ff5de837d005868cdd2a3d74e1415)) ([Mariusz Nowak](https://github.com/medikoo))

### [2.32.1](https://github.com/serverless/serverless/compare/v2.32.0...v2.32.1) (2021-03-31)

### Bug Fixes

- **AWS IAM:** Support for CF functions for `provider.iam.role` ([#9206](https://github.com/serverless/serverless/pull/9206)) ([0a84f1c](https://github.com/serverless/serverless/commit/0a84f1c84ee4e7ac32d9b5c247eba7f25da0d14a)) ([Piotr Grzesik](https://github.com/pgrzesik))
- **CLI:** Fix `commands` pass to local installation ([#9207](https://github.com/serverless/serverless/pull/9207)) ([80bddce](https://github.com/serverless/serverless/commit/80bddce66729a82dde488a497e228cc42775a174)) ([Mariusz Nowak](https://github.com/medikoo))
- **Variables:** Ensure resolution of unrecognized CLI options ([#9211](https://github.com/serverless/serverless/pull/9211)) ([b5668d5](https://github.com/serverless/serverless/commit/b5668d5be04902437c82b2ccb049f93f82a87ec3)) ([Mariusz Nowak](https://github.com/medikoo))

### Maintenance Improvements

- **CLI:** Fix deprecation message typo ([#9209](https://github.com/serverless/serverless/pull/9209)) ([7f788d2](https://github.com/serverless/serverless/commit/7f788d29e5b7ba45b9a3648b0b645f17706ac4a4)) ([Mariusz Nowak](https://github.com/medikoo))
- **Variables:**
  - Do not run old resolver when not needed ([#9207](https://github.com/serverless/serverless/pull/9207)) ([7601e26](https://github.com/serverless/serverless/commit/7601e26360226e77c4c8d631227a248e7a81afc2)) ([Mariusz Nowak](https://github.com/medikoo))

## [2.32.0](https://github.com/serverless/serverless/compare/v2.31.0...v2.32.0) (2021-03-30)

### Features

- **AWS HTTP API:**
  - Add support for AWS IAM authorization ([#9195](https://github.com/serverless/serverless/pull/9195)) ([d3c6e43](https://github.com/serverless/serverless/commit/d3c6e4323b9a3345d71ec43e6ac3013c0ffa02b7)) ([Piotr Grzesik](https://github.com/pgrzesik))
  - Add support for custom Lambda authorizers ([#9192](https://github.com/serverless/serverless/pull/9192)) ([37d03b6](https://github.com/serverless/serverless/commit/37d03b6888788b2ee0b4a679de30ba94d25d7d53)) ([Piotr Grzesik](https://github.com/pgrzesik))
- **AWS IAM:** Add support for `iam.role.name` definition ([#9166](https://github.com/serverless/serverless/issues/9166)) ([8c3e1be](https://github.com/serverless/serverless/commit/8c3e1be735120f5e49f6850259072c13e175b71f)) ([Sergii Kovalev](https://github.com/Enase))
- **AWS Lambda:** Do not require all `image` properties ([#9177](https://github.com/serverless/serverless/pull/9177)) ([14f5743](https://github.com/serverless/serverless/commit/14f57438467b5d5c9a3dc356ac4a8b0a6021657f)) ([Piotr Grzesik](https://github.com/pgrzesik))
- **CLI:**
  - Validate command and options against resolved schema ([#9171](https://github.com/serverless/serverless/pull/9171)) ([2dacbcc](https://github.com/serverless/serverless/commit/2dacbcce8529378d94abc7a0b0d0039ecee4d790)) ([Mariusz Nowak](https://github.com/medikoo))
  - Recognize CLI command plugin extensions in new resolver ([#9171](https://github.com/serverless/serverless/pull/9171)) ([3422a12](https://github.com/serverless/serverless/commit/3422a121d787fa716f708051f0bfe97644a3c1aa)) ([Mariusz Nowak](https://github.com/medikoo))
- **Packaging:** Deprecate `include` & `exclude` in favor of `patterns` ([#8581](https://github.com/serverless/serverless/issues/8581)) ([e1678fb](https://github.com/serverless/serverless/commit/e1678fb1c65ab0246e60d44857466be6771f889d)) ([Juanjo Diaz](https://github.com/juanjodiaz))
- **Variables:**
  - Report errors on unresolved variables ([#9200](https://github.com/serverless/serverless/pull/9200)) ([f112e4b](https://github.com/serverless/serverless/commit/f112e4b91c140d915cee493b24b66f94b8033d3d)) ([Mariusz Nowak](https://github.com/medikoo))
  - Support source extensions from plugins for new resolver ([#9200](https://github.com/serverless/serverless/pull/9200)) ([ee76876](https://github.com/serverless/serverless/commit/ee7687672557125b68a300f0cb1f7d8ec1785ec4)) ([Mariusz Nowak](https://github.com/medikoo))

### Bug Fixes

- **CLI:**
  - Ensure to expose accurate `commandsSchema` in resolved input ([#9181](https://github.com/serverless/serverless/pull/9181)) ([01b135c](https://github.com/serverless/serverless/commit/01b135c69f731ec6841953491d310d06fd5740c0)) ([Mariusz Nowak](https://github.com/medikoo))
  - Fix `generate-event` and `test` commands schema visibility ([#9181](https://github.com/serverless/serverless/pull/9181)) ([ae645e7](https://github.com/serverless/serverless/commit/ae645e7e8ec165115cfb30fe24790a6741d858aa)) ([Mariusz Nowak](https://github.com/medikoo))
  - Fix handling of container commands ([#9181](https://github.com/serverless/serverless/pull/9181)) ([d9cf52b](https://github.com/serverless/serverless/commit/d9cf52b2c81d9332f7289ef046fa161137ee1d19)) ([Mariusz Nowak](https://github.com/medikoo))
  - Unconditionally crash on unrecognized command ([#9181](https://github.com/serverless/serverless/pull/9181)) ([f1af86a](https://github.com/serverless/serverless/commit/f1af86ab55b873e87a1d6bef2c0b02e133eba4a2)) ([Mariusz Nowak](https://github.com/medikoo))
  - Ensure to copy and not modify preset schemas ([#9181](https://github.com/serverless/serverless/pull/9181)) ([64684f2](https://github.com/serverless/serverless/commit/64684f2ed58e643726e4cea403b80af9844575ab)) ([Mariusz Nowak](https://github.com/medikoo))
- Ensure detection of external plugins is multi instance safe ([#9181](https://github.com/serverless/serverless/pull/9181)) ([0f35375](https://github.com/serverless/serverless/commit/0f353750f16b5befff243221e2c5e3c66376bcb0)) ([Mariusz Nowak](https://github.com/medikoo))

### Maintenance Improvements

- **CLI:**
  - Move to CLI logic required options validation ([#9181](https://github.com/serverless/serverless/pull/9181)) ([afad231](https://github.com/serverless/serverless/commit/afad2315a52785b0fff2408bb502698f176ff144)) ([Mariusz Nowak](https://github.com/medikoo))
  - Ensure resolved `provider.region` if dashboard used ([#9200](https://github.com/serverless/serverless/pull/9200)) ([af0242d](https://github.com/serverless/serverless/commit/af0242d716613777b2d03b418c9df39e984bb559)) ([Mariusz Nowak](https://github.com/medikoo))
  - Ensure to have up to date commands ([#9181](https://github.com/serverless/serverless/pull/9181)) ([8142515](https://github.com/serverless/serverless/commit/8142515bfc34fe88fc12f599aff6453217959ba5)) ([Mariusz Nowak](https://github.com/medikoo))
  - Generalize property resolution validation ([#9171](https://github.com/serverless/serverless/pull/9171)) ([59434af](https://github.com/serverless/serverless/commit/59434afd9519ed41bbb607f5bdb16b1158936798)) ([Mariusz Nowak](https://github.com/medikoo))
  - Improve command resolution handling ([#9200](https://github.com/serverless/serverless/pull/9200)) ([0065200](https://github.com/serverless/serverless/commit/00652005d44886c472c8ca6b0e77a5619e1601c0)) ([Mariusz Nowak](https://github.com/medikoo))
  - Improve validation of resolution state of core config ([#9171](https://github.com/serverless/serverless/pull/9171)) ([9e84423](https://github.com/serverless/serverless/commit/9e844234133d0b796bdeb2bdcce557da4ca996e3)) ([Mariusz Nowak](https://github.com/medikoo))
  - Move lifecycles definition to commands schema ([#9171](https://github.com/serverless/serverless/pull/9171)) ([2294a4b](https://github.com/serverless/serverless/commit/2294a4b4cb938ec34492bb5979da0677ff1d602f)) ([Mariusz Nowak](https://github.com/medikoo))
  - Move main help renderer out of internals ([#9181](https://github.com/serverless/serverless/pull/9181)) ([053fea1](https://github.com/serverless/serverless/commit/053fea18e0295507511881e59350207e60f142be)) ([Mariusz Nowak](https://github.com/medikoo))
  - Pass resolved commands options to local installation ([#9181](https://github.com/serverless/serverless/pull/9181)) ([2d4d05d](https://github.com/serverless/serverless/commit/2d4d05d425bc686c11b284354f5cc2ccead3814d)) ([Mariusz Nowak](https://github.com/medikoo))
  - Prevent superfluous vars resolution with help request ([#9181](https://github.com/serverless/serverless/pull/9181)) ([c2d4f83](https://github.com/serverless/serverless/commit/c2d4f834e5acccc022cd9769b6fe369b76ebdd4c)) ([Mariusz Nowak](https://github.com/medikoo))
  - Recalculate options only if external plugins were loaded ([#9181](https://github.com/serverless/serverless/pull/9181)) ([9aa026d](https://github.com/serverless/serverless/commit/9aa026d8f77020b466730fd16c908c5339943bee)) ([Mariusz Nowak](https://github.com/medikoo))
  - Seclude command help render from internals ([#9181](https://github.com/serverless/serverless/pull/9181)) ([aca3c0d](https://github.com/serverless/serverless/commit/aca3c0d57d563237aa1c1d8dfb3eccf809536e57)) ([Mariusz Nowak](https://github.com/medikoo))
  - Seclude command options render logic out of internals ([#9181](https://github.com/serverless/serverless/pull/9181)) ([41e921a](https://github.com/serverless/serverless/commit/41e921aa6fa74d07ce7d1757cc1101f09f3e7f47)) ([Mariusz Nowak](https://github.com/medikoo))
  - Seclude general help render logic from internals ([#9181](https://github.com/serverless/serverless/pull/9181)) ([87b1861](https://github.com/serverless/serverless/commit/87b186113a3b76c2b8065b3d97f7c8fa0c68984e)) ([Mariusz Nowak](https://github.com/medikoo))
  - Seclude interactive setup help render out of internals ([#9181](https://github.com/serverless/serverless/pull/9181)) ([2fd921d](https://github.com/serverless/serverless/commit/2fd921dbfc613f9064e069d00f1c5d11c8b86879)) ([Mariusz Nowak](https://github.com/medikoo))
- **Variables:**
  - Configure `cf` source in a new resolver ([#9200](https://github.com/serverless/serverless/pull/9200)) ([a60e90f](https://github.com/serverless/serverless/commit/a60e90f61c93c177ade8a2875e94feb7e886a0e2)) ([Mariusz Nowak](https://github.com/medikoo))
  - Configure `s3` source in a new resolver ([#9200](https://github.com/serverless/serverless/pull/9200)) ([12a4cad](https://github.com/serverless/serverless/commit/12a4cad102c67ecbdc308d35217a6247bd62dcb0)) ([Mariusz Nowak](https://github.com/medikoo))
  - Configure `sls` source in a new resolver ([#9200](https://github.com/serverless/serverless/pull/9200)) ([eecd928](https://github.com/serverless/serverless/commit/eecd9285d51506d9a245b47b9afa6a16ffd64fe0)) ([Mariusz Nowak](https://github.com/medikoo))
  - Configure `ssm` source in a new resolver ([#9200](https://github.com/serverless/serverless/pull/9200)) ([3f7f67c](https://github.com/serverless/serverless/commit/3f7f67ccc155d61ca9e7aa96c858058da55c635a)) ([Mariusz Nowak](https://github.com/medikoo))
  - Configure dashboard sources in a new resolver ([#9200](https://github.com/serverless/serverless/pull/9200)) ([385c15b](https://github.com/serverless/serverless/commit/385c15bc83ca34fdde2da61533a8b163f7bcc33c)) ([Mariusz Nowak](https://github.com/medikoo))
- **Dashboard:** Provide direct internal access to dashboard plugin ([#9200](https://github.com/serverless/serverless/pull/9200)) ([6292197](https://github.com/serverless/serverless/commit/6292197ee1dfbe107c3fe98059bd683896678b05)) ([Mariusz Nowak](https://github.com/medikoo))
- **Plugins:** Bulletproof way to recognize external plugins ([#9171](https://github.com/serverless/serverless/pull/9171)) ([1618e23](https://github.com/serverless/serverless/commit/1618e23c5cac32ee1168c951e5e70a8dfc66c2f9)) ([Mariusz Nowak](https://github.com/medikoo))
- **Analytics**: Detect Serverless CI/CD engine for analytics ([#9175](https://github.com/serverless/serverless/pull/9175)) ([e20766c](https://github.com/serverless/serverless/commit/e20766cf25e82442979662e0a415888f1727482a)) ([Piotr Grzesik](https://github.com/pgrzesik))

## [2.31.0](https://github.com/serverless/serverless/compare/v2.30.3...v2.31.0) (2021-03-23)

### Features

- **AWS API Gateway:** Remove deprecation for old naming convention ([#9160](https://github.com/serverless/serverless/pull/9160)) ([b530d6a](https://github.com/serverless/serverless/commit/b530d6a288a9881c12382c8004447b94a80f1847)) ([Piotr Grzesik](https://github.com/pgrzesik))
- **Variables:**
  - Disallow `provider.variableSyntax` with new resolver ([#9140](https://github.com/serverless/serverless/pull/9140)) ([5a2da44](https://github.com/serverless/serverless/commit/5a2da444ea5f896f56cf03e509631d2df548457c)) ([Mariusz Nowak](https://github.com/medikoo))
  - Meaningfully reject not resolvable `provider.name` ([#9140](https://github.com/serverless/serverless/pull/9140)) ([f67d95a](https://github.com/serverless/serverless/commit/f67d95a553be8986b8b21c164f9d292f4fca21cd)) ([Mariusz Nowak](https://github.com/medikoo))

### Bug Fixes

- **Packaging:** Ensure to properly exclude dependencies when `NODE_ENV` set ([#9142](https://github.com/serverless/serverless/pull/9142)) ([6e3e21c](https://github.com/serverless/serverless/commit/6e3e21cafaa053a0f30239513eac5c7a725b7694)) ([Piotr Grzesik](https://github.com/pgrzesik))
- **CLI:**
  - Recognize "--stage" as provider agnostic option ([#9151](https://github.com/serverless/serverless/pull/9151)) ([271ac82](https://github.com/serverless/serverless/commit/271ac8281c10e23ce609165582b3b996b60d5bd1)) ([Mariusz Nowak](https://github.com/medikoo))
  - Do not show options order deprecation info with help request ([#9151](https://github.com/serverless/serverless/pull/9151)) ([ad8f9b0](https://github.com/serverless/serverless/commit/ad8f9b059740bb2581445457b6751e918a57e585)) ([Mariusz Nowak](https://github.com/medikoo))
  - Recognize "--version" option in commands help ([#9151](https://github.com/serverless/serverless/pull/9151)) ([6cefe7a](https://github.com/serverless/serverless/commit/6cefe7a08452586498fe1612daf6f95f5a754925)) ([Mariusz Nowak](https://github.com/medikoo))
- **AWS Deploy:** Fix format of url data as passed to `https-proxy-agent` ([#9147](https://github.com/serverless/serverless/pull/9147)) ([d935dcc](https://github.com/serverless/serverless/commit/d935dccb268ff8e54d9f1fb56beee01115e041c1)) ([Andreas Augustin](https://github.com/AndreasAugustin))
- **Variables:**
  - Ensure necessary resolution interface for plugins ([#9164](https://github.com/serverless/serverless/pull/9164)) ([841e847](https://github.com/serverless/serverless/commit/841e847c20de989287e36a86c523763dc2b74e8b)) ([Mariusz Nowak](https://github.com/medikoo))
  - Ensure to support middle JS function resolved properties ([#9161](https://github.com/serverless/serverless/pull/9161)) ([32ba7c8](https://github.com/serverless/serverless/commit/32ba7c8b436ab49641fb89028e5b2e53226df3b5)) ([Mariusz Nowak](https://github.com/medikoo))
  - Fix resolution of "false" CLI params ([#9151](https://github.com/serverless/serverless/pull/9151)) ([6c6ada9](https://github.com/serverless/serverless/commit/6c6ada93e47e994dc5775a65542bedf69ec6d412)) ([Mariusz Nowak](https://github.com/medikoo))
  - Unify handling of not existing addresses ([#9161](https://github.com/serverless/serverless/pull/9161)) ([b21dc44](https://github.com/serverless/serverless/commit/b21dc44048cc1a96e2f772b9c412474b3a687067)) ([Mariusz Nowak](https://github.com/medikoo))
- Ensure to handle empty func definition with meaningful error ([#9133](https://github.com/serverless/serverless/pull/9133)) ([86e0b6d](https://github.com/serverless/serverless/commit/86e0b6ddbba7f356989ba7c1617c2a4160e7503a)) ([Piotr Grzesik](https://github.com/pgrzesik))

### Maintenance Improvements

- **CLI:**
  - Handle "help" with a schema ([#9151](https://github.com/serverless/serverless/pull/9151)) ([d455b23](https://github.com/serverless/serverless/commit/d455b236cf719778ebaa5048a0941ae906a69cd4)) ([Mariusz Nowak](https://github.com/medikoo))
  - Categorize CLI commands in schema ([#9140](https://github.com/serverless/serverless/pull/9140)) ([471e34d](https://github.com/serverless/serverless/commit/471e34ddc34962486e4bf78b33dbec566b561cf2)) ([Mariusz Nowak](https://github.com/medikoo))
  - Do not show deprecation with help command ([#9140](https://github.com/serverless/serverless/pull/9140)) ([a72b681](https://github.com/serverless/serverless/commit/a72b6816358a721f3957be40a35ae3d945eb80d1)) ([Mariusz Nowak](https://github.com/medikoo))
  - Do not throw errors when help command ([#9140](https://github.com/serverless/serverless/pull/9140)) ([d15efd9](https://github.com/serverless/serverless/commit/d15efd91087183b65201e2eaccbb9719f0b34e4e)) ([Mariusz Nowak](https://github.com/medikoo))
  - Expose resolved string command by `resolveInput` util ([#9151](https://github.com/serverless/serverless/pull/9151)) ([362f5e9](https://github.com/serverless/serverless/commit/362f5e94e044f51fe6e9b2f9de4de810fb9f8d04)) ([Mariusz Nowak](https://github.com/medikoo))
  - Improve flow documentation ([#9140](https://github.com/serverless/serverless/pull/9140)) ([851c9f4](https://github.com/serverless/serverless/commit/851c9f4d52a69c3ac0f15f5fb353ae9f7a554530)) ([Mariusz Nowak](https://github.com/medikoo))
  - Improve setup of resolution flow ([#9140](https://github.com/serverless/serverless/pull/9140)) ([ab1c673](https://github.com/serverless/serverless/commit/ab1c673bb2f7d4279d0406f355516d616e1f00c8)) ([Mariusz Nowak](https://github.com/medikoo))
  - Integrate `isHelpRequest` into `resolveInput` util ([#9140](https://github.com/serverless/serverless/pull/9140)) ([a481170](https://github.com/serverless/serverless/commit/a48117041c3993f5ba969329dd605f6a80efcbad)) ([Mariusz Nowak](https://github.com/medikoo))
  - Proritize `provider.name` validation ([#9151](https://github.com/serverless/serverless/pull/9151)) ([9ab04a6](https://github.com/serverless/serverless/commit/9ab04a674771e84ec302d7a7783b3b3c09889d26)) ([Mariusz Nowak](https://github.com/medikoo))
  - Recognize "--version" on command as help request ([#9151](https://github.com/serverless/serverless/pull/9151)) ([23f45a3](https://github.com/serverless/serverless/commit/23f45a34de244b5d7ead1e300cb0aa2cdd57a372)) ([Mariusz Nowak](https://github.com/medikoo))
  - Resolve command and options gradually ([#9151](https://github.com/serverless/serverless/pull/9151)) ([b6382fd](https://github.com/serverless/serverless/commit/b6382fdb7abcdf42098c57263799ea004bdb1481)) ([Mariusz Nowak](https://github.com/medikoo))
  - Return resolved `commandSchema` from `resolveInput` util ([#9151](https://github.com/serverless/serverless/pull/9151)) ([4364acc](https://github.com/serverless/serverless/commit/4364acca588919c0b3bf69eb0c1cb44a2009d0b4)) ([Mariusz Nowak](https://github.com/medikoo))
  - Wrap with function for better maintainance ([#9140](https://github.com/serverless/serverless/pull/9140)) ([ab055a3](https://github.com/serverless/serverless/commit/ab055a3390fb6d0f20c2bc87916ddb19c8d58d7f)) ([Mariusz Nowak](https://github.com/medikoo))
- **Variables:**
  - Ensure to not resolve any value with promise ([#9140](https://github.com/serverless/serverless/pull/9140)) ([54da2c2](https://github.com/serverless/serverless/commit/54da2c23a13aafb7342915419c9a21ffc3705b37)) ([Mariusz Nowak](https://github.com/medikoo))
  - Recognize only defined CLI options in resolver ([#9151](https://github.com/serverless/serverless/pull/9151)) ([13610cf](https://github.com/serverless/serverless/commit/13610cf0f0b89dc3061ae10254df291fc38c5e57)) ([Mariusz Nowak](https://github.com/medikoo))
  - Report immediatelly eventual syntax errors ([#9140](https://github.com/serverless/serverless/pull/9140)) ([ee01833](https://github.com/serverless/serverless/commit/ee01833df80db8bc751f8248f49944738606393f)) ([Mariusz Nowak](https://github.com/medikoo))
  - Smarter "is property resolved" validation ([#9151](https://github.com/serverless/serverless/pull/9151)) ([cfe83df](https://github.com/serverless/serverless/commit/cfe83df1747732532d77d4ed52320aac70892da9)) ([Mariusz Nowak](https://github.com/medikoo))
  - Smarter resolution phases ([#9140](https://github.com/serverless/serverless/pull/9140)) ([a537856](https://github.com/serverless/serverless/commit/a5378566516fd9cb1a9abdfc204c0a8c83841e4b)) ([Mariusz Nowak](https://github.com/medikoo))
  - For `--help` output resolve just needed properties ([#9140](https://github.com/serverless/serverless/pull/9140)) ([d851914](https://github.com/serverless/serverless/commit/d851914a44cc0f0a7bb6c4bf7dd2454b6f83189c)) ([Mariusz Nowak](https://github.com/medikoo))
- Improve AWS SDK errors reporting ([#9148](https://github.com/serverless/serverless/pull/9148)) ([89b813d](https://github.com/serverless/serverless/commit/89b813da51cedf80ca66ae4b4ad269edf8614ec0)) ([Mariusz Nowak](https://github.com/medikoo))

### [2.30.3](https://github.com/serverless/serverless/compare/v2.30.2...v2.30.3) (2021-03-16)

### Bug Fixes

- **CLI:** Recognize `--env` option for `sls invoke local` as multiple ([#9131](https://github.com/serverless/serverless/issues/9131)) ([a941e87](https://github.com/serverless/serverless/commit/a941e87cbfbd272f27fc6360c7a733b337e83f2d)) ([lewgordon](https://github.com/lewgordon))

### [2.30.2](https://github.com/serverless/serverless/compare/v2.30.1...v2.30.2) (2021-03-16)

### Bug Fixes

- **Plugins:** Bring back `provider.sdk` property, to not break plugins ([#9127](https://github.com/serverless/serverless/pull/9127)) ([3e983f3](https://github.com/serverless/serverless/commit/3e983f347a10601e5dc5b1e6c19ae2822c94f682)) ([Mariusz Nowak](https://github.com/medikoo))

### [2.30.1](https://github.com/serverless/serverless/compare/v2.30.0...v2.30.1) (2021-03-16)

### Bug Fixes

- **AWS Credentials:** Fix credentials resolution ([#9121](https://github.com/serverless/serverless/pull/9121) & [#9124](https://github.com/serverless/serverless/pull/9141)) ([6f8b5b4](https://github.com/serverless/serverless/commit/6f8b5b41ebfd173d33e2ad9717f8727cc0592915) & [41df6fb](https://github.com/serverless/serverless/commit/41df6fbee2705307ad7b44f614d70b5d801e0114)) ([Mariusz Nowak](https://github.com/medikoo))
- **AWS EventBridge:** Clarify CF functions support for `eventBus` ([5183620](https://github.com/serverless/serverless/commit/5183620e9e4795c3ab07d30e7386d9360a2d7eb7)) ([#9118](https://github.com/serverless/serverless/pull/9118)) ([Piotr Grzesik](https://github.com/pgrzesik))
- **AWS Lambda:** Ensure correct schema for `vpc` definition ([#9120](https://github.com/serverless/serverless/pull/9120)) ([4cd629a](https://github.com/serverless/serverless/commit/4cd629ac44f5a1a1442d7245878df6b361a94973)) ([Piotr Grzesik](https://github.com/pgrzesik))

## [2.30.0](https://github.com/serverless/serverless/compare/v2.29.0...v2.30.0) (2021-03-16)

### Features

- **Config Schema:** Announce that crashing on error will become default ([#9066](https://github.com/serverless/serverless/pull/9066)) ([6537a5e](https://github.com/serverless/serverless/commit/6537a5e48dd4f6846f4ba41bb6c4542ea0c0117d)) ([yumei](https://github.com/yumeixox))

### Bug Fixes

- **AWS Deploy:** Fix `deploy function` command error handling ([#9102](https://github.com/serverless/serverless/pull/9102)) ([aa7b66a](https://github.com/serverless/serverless/commit/aa7b66a66c199c236bedfbc3b3aab39acb0eb6ad)) ([Mariusz Nowak](https://github.com/medikoo))
- **AWS IAM:**
  - Accept `arn:${AWS::Partition}` in function roles ([#9103](https://github.com/serverless/serverless/issues/9103)) ([e77a00d](https://github.com/serverless/serverless/commit/e77a00dfff734ccb74a7ca77ef92135c4f4dc06b)) ([coyoteecd](https://github.com/coyoteecd))
  - Allow `iam.role` to use `awsLambdaRole` definition ([#9094](https://github.com/serverless/serverless/issues/9094)) ([82bf35c](https://github.com/serverless/serverless/commit/82bf35c1b9abd81fe52cdc7fd57b63cab4cecc6e)) ([Yahia Kerim](https://github.com/yahiakr))
- **AWS Local Invocation:** Support `env` vars with `=` in value ([#9079](https://github.com/serverless/serverless/issues/9079)) ([ab8529c](https://github.com/serverless/serverless/commit/ab8529cb24d63edba798ea6fba3d783f256d3998)) ([terrybondy](https://github.com/terrybondy) & [lewgordon](https://github.com/lewgordon))
- **Variables:** Retry JS function resolvers on unresolved dependencies ([#9110](https://github.com/serverless/serverless/pull/9110)) ([68de8bd](https://github.com/serverless/serverless/commit/68de8bdeed0545e6868c72806340e96f90f808cf)) ([Mariusz Nowak](https://github.com/medikoo))
- **CLI:**
  - Improve handling of container commands ([#9111](https://github.com/serverless/serverless/pull/9111)) ([6ec463c](https://github.com/serverless/serverless/commit/6ec463cbe7f0bc6a7827a504175f2c3aae9bb8d6)) ([Mariusz Nowak](https://github.com/medikoo))
  - Output "Plugin: " prefix only for external plugin comands ([#9111](https://github.com/serverless/serverless/pull/9111)) ([acf720c](https://github.com/serverless/serverless/commit/acf720cdefd65508fc0e5183271cff03009b7441)) ([Mariusz Nowak](https://github.com/medikoo))
  - Properly report SDK version when handling errors ([#9097](https://github.com/serverless/serverless/pull/9097)) ([a79473d](https://github.com/serverless/serverless/commit/a79473d8b1dac5c4da1473dec4b02ba192e696ca)) ([Piotr Grzesik](https://github.com/pgrzesik))
  - Recognize `--stage` & `--region` on every AWS service command ([#9111](https://github.com/serverless/serverless/pull/9111)) ([bfde219](https://github.com/serverless/serverless/commit/bfde21907be3508350bf2487d2ef8bc69be695ad)) ([Mariusz Nowak](https://github.com/medikoo))

### Maintenance Improvements

- **AWS Deploy:** Minimize try/catch wrap ([#9102](https://github.com/serverless/serverless/pull/9102)) ([a7d2cf0](https://github.com/serverless/serverless/commit/a7d2cf060514618d9caf48a55dfd56f371f19ca6)) ([Mariusz Nowak](https://github.com/medikoo))
- **CLI:**
  - Add Dashboard specific options to commands schema ([#9111](https://github.com/serverless/serverless/pull/9111)) ([ed553a7](https://github.com/serverless/serverless/commit/ed553a75267de5399809f2e9c848c60537e41fe2)) ([Mariusz Nowak](https://github.com/medikoo))
  - Generalize handling of not supported commands ([#9111](https://github.com/serverless/serverless/pull/9111)) ([8b301dc](https://github.com/serverless/serverless/commit/8b301dce9c06f9ef463f9f3572a02d0de8d3539d)) ([Mariusz Nowak](https://github.com/medikoo))
  - Recognize interactive setup command in commands schema ([#9111](https://github.com/serverless/serverless/pull/9111)) ([b9afc14](https://github.com/serverless/serverless/commit/b9afc144bf0aea4e20d7996df5d8c52430f39b23)) ([Mariusz Nowak](https://github.com/medikoo))
  - Resolve commands and options by schema ([#9111](https://github.com/serverless/serverless/pull/9111)) ([fe663ea](https://github.com/serverless/serverless/commit/fe663ead50ff6925fb09207492a188f5f5bbda7e)) ([Mariusz Nowak](https://github.com/medikoo))
  - Seclude schema of core commands ([#9111](https://github.com/serverless/serverless/pull/9111)) ([14a2640](https://github.com/serverless/serverless/commit/14a2640bd9e65e357f606635a15ce0b07625b3aa)) ([Mariusz Nowak](https://github.com/medikoo))
  - Schema for `@serverless/enterprise-plugin` commands ([#9111](https://github.com/serverless/serverless/pull/9111)) ([116fe85](https://github.com/serverless/serverless/commit/116fe85fbeac0408be6c6f5761573d5af340e8f1)) ([Mariusz Nowak](https://github.com/medikoo))
- Refactor `pluginManager.invoke` to async/await ([#9111](https://github.com/serverless/serverless/pull/9111)) ([15b5a11](https://github.com/serverless/serverless/commit/15b5a11ecd7cf4b83442ca0df161d74c9bdbc8e2)) ([Mariusz Nowak](https://github.com/medikoo))
- Refactor `pluginManager.spawn` to async/await ([#9111](https://github.com/serverless/serverless/pull/9111)) ([87b8d01](https://github.com/serverless/serverless/commit/87b8d019c200caebbd0047e15b2e1e9f1faa988f)) ([Mariusz Nowak](https://github.com/medikoo))
- Extend `generatePayload` ([#9078](https://github.com/serverless/serverless/pull/9078)) ([f6292b2](https://github.com/serverless/serverless/commit/f6292b2d4912e04ff79b2565fd0a57ced47ca0c1)) ([Piotr Grzesik](https://github.com/pgrzesik))
- Seclude AWS request util from internals ([#8850](https://github.com/serverless/serverless/issues/8850)) ([5fb85d3](https://github.com/serverless/serverless/commit/5fb85d36c8ee965df691b8f2dfddeaab8315c77d)) ([AlinoeDoctari](https://github.com/AlinoeDoctari))

### Templates

- **Templates:** Fix runtime for `azure-nodejs-typescript` ([#9106](https://github.com/serverless/serverless/issues/9106)) ([3597f45](https://github.com/serverless/serverless/commit/3597f4539dce1d7185879e7e00e67c64c022de02)) ([Tony Papousek](https://github.com/tonypapousek))

## [2.29.0](https://github.com/serverless/serverless/compare/v2.28.7...v2.29.0) (2021-03-09)

### Features

- **AWS IAM:**
  - Allow `tags` parameter on lambda execution role ([#9039](https://github.com/serverless/serverless/issues/9039)) ([42a1cdb](https://github.com/serverless/serverless/commit/42a1cdb6f1b4ca90e9e7f43852672897cb9ec1f9)) ([Dmitry Shirokov](https://github.com/runk))
  - Accept `accountId` as IAM policy principal ([#9082](https://github.com/serverless/serverless/pull/9082)) ([0f631f7](https://github.com/serverless/serverless/commit/0f631f7bd17285c89bf73aa7da788186cebb2d05)) ([Sam Lyon](https://github.com/blue-urban-sky))
- **AWS Stream:** Add support for custom checkpoint ([#9056](https://github.com/serverless/serverless/issues/9056)) ([b2188a2](https://github.com/serverless/serverless/commit/b2188a20d935b2ae8fccf594c4bd39eddcb7ef8c)) ([Vishnu Prassad](https://github.com/imewish))

### Bug Fixes

- **AWS Deploy:** Warn when IAM policy does not allow to fetch lambda details ([#9041](https://github.com/serverless/serverless/issues/9041)) ([dea7b5a](https://github.com/serverless/serverless/commit/dea7b5a3c0b5b1208c44c0762566a0fdab298f83)) ([Tristan Rigaut](https://github.com/trigaut))
- **CLI:** Fix dashboard error handler error reporting ([#9084](https://github.com/serverless/serverless/pull/9084)) ([aa9dc0a](https://github.com/serverless/serverless/commit/aa9dc0a8dc46c8dcb51a88c62d6337b8cc68f2b0)) ([Mariusz Nowak](https://github.com/medikoo))
- **AWS IAM:** Support CF functions for managed policies ([#9089](https://github.com/serverless/serverless/issues/9089)) ([5f5d2e5](https://github.com/serverless/serverless/commit/5f5d2e580e267ad8bbd34f29c4613ca751908992)) ([Dave Lowther](https://github.com/DaveLo))
- **Variables:** Expose source resolution errors as non-user errors ([#9088](https://github.com/serverless/serverless/pull/9088)) ([5e2406b](https://github.com/serverless/serverless/commit/5e2406bea78b353fea10a45d657ae2a7789531bd)) ([Mariusz Nowak](https://github.com/medikoo))

### Maintenance Improvements

- **CLI:**
  - Rely on `cli/is-help-request` util ([#9086](https://github.com/serverless/serverless/pull/9086)) ([c9087ec](https://github.com/serverless/serverless/commit/c9087ec4e659f2d1c894f814f6a0c54d0ddb6dcc)) ([Mariusz Nowak](https://github.com/medikoo))
  - Report Platform Client instead of SDK version ([#9092](https://github.com/serverless/serverless/issues/9092)) ([2b857c7](https://github.com/serverless/serverless/commit/2b857c7eb45e6543ca5afb5604542e8f76175910)) ([Piotr Grzesik](https://github.com/pgrzesik))
- **Variables:**
  - Improve error message related to JS func resolver ([#9085](https://github.com/serverless/serverless/pull/9085)) ([b90538a](https://github.com/serverless/serverless/commit/b90538af08a51a5e2a3ec65d6d1bf8c51a54b9c3)) ([Mariusz Nowak](https://github.com/medikoo))
  - Improve source fulfillment handling ([#9088](https://github.com/serverless/serverless/pull/9088)) ([524c43d](https://github.com/serverless/serverless/commit/524c43df75606fdda0ec28c3370a0f743a9d1efa)) ([Mariusz Nowak](https://github.com/medikoo))

### [2.28.7](https://github.com/serverless/serverless/compare/v2.28.6...v2.28.7) (2021-03-04)

### Bug Fixes

- **Packaging:** Fix packaging performance regression and increased number of observed `EMFILE` errors by reverting intensive `bluebird` related refactors as listed below
  - Revert removal of `bluebird` from `lib/plugins/aws` ([#9074](https://github.com/serverless/serverless/pull/9074)) ([55abaaf](https://github.com/serverless/serverless/commit/55abaaf6d5db17c4824c2d2d3dc3f540c682acea)) ([Piotr Grzesik](https://github.com/pgrzesik))
  - Revert removal of `bluebird` from `lib/plugins/create` ([#9074](https://github.com/serverless/serverless/pull/9074)) ([ae2c92c](https://github.com/serverless/serverless/commit/ae2c92ced6f25cca6c6243daf90aa23bfe0d6278)) ([Piotr Grzesik](https://github.com/pgrzesik))
  - Revert removal of `bluebird` from `lib/plugins/interactiveCli` ([#9074](https://github.com/serverless/serverless/pull/9074)) ([217b975](https://github.com/serverless/serverless/commit/217b9751ead901395467b7221f601f955329eb1b)) ([Piotr Grzesik](https://github.com/pgrzesik))
  - Revert removal of `bluebird` from `lib/plugins/package` ([#9074](https://github.com/serverless/serverless/pull/9074)) ([399d91b](https://github.com/serverless/serverless/commit/399d91b7e4508ae15c4beba1fec66c32c0367386)) ([Piotr Grzesik](https://github.com/pgrzesik))
  - Revert removal of `bluebird` from `lib/plugins/plugin` ([#9074](https://github.com/serverless/serverless/pull/9074)) ([2a9f79f](https://github.com/serverless/serverless/commit/2a9f79f19e33c83ed4df46ecd305cc49ce1a8c15)) ([Piotr Grzesik](https://github.com/pgrzesik))
  - Revert removal of `bluebird` from `lib/classes` ([#9074](https://github.com/serverless/serverless/pull/9074)) ([c41bd64](https://github.com/serverless/serverless/commit/c41bd64bb233b588dc615bc11c513f3e2c486084)) ([Piotr Grzesik](https://github.com/pgrzesik))
  - Revert removal of `bluebird` from `lib/utils` ([#9074](https://github.com/serverless/serverless/pull/9074)) ([f62fc2e](https://github.com/serverless/serverless/commit/f62fc2ee9c39a15c2b3894c5fae185a530307506)) ([Piotr Grzesik](https://github.com/pgrzesik))
  - Revert removal of `bluebird` from `lib/plugins` ([#9074](https://github.com/serverless/serverless/pull/9074)) ([7a012d8](https://github.com/serverless/serverless/commit/7a012d83b975022e5ee60f5054229398a9424d13)) ([Piotr Grzesik](https://github.com/pgrzesik))

### [2.28.6](https://github.com/serverless/serverless/compare/v2.28.5...v2.28.6) (2021-03-03)

### Bug Fixes

- **Variables:** Ensure to apply intialization patch unconditionally ([#9063](https://github.com/serverless/serverless/issues/9063)) ([d6c7d97](https://github.com/serverless/serverless/commit/d6c7d97dc6bb6229dd80e443a09f5a741bf1380e)) ([Mariusz Nowak](https://github.com/medikoo))

### [2.28.5](https://github.com/serverless/serverless/compare/v2.28.4...v2.28.5) (2021-03-03)

### Bug Fixes

- **Variables:**
  - Fix variables setup for external plugins usage ([#9060](https://github.com/serverless/serverless/issues/9060)) ([25dd575](https://github.com/serverless/serverless/commit/25dd575a4d597c09078ac8a2c709d834ae85221e)) ([Mariusz Nowak](https://github.com/medikoo))
  - Report with meaningful error unresolved `plugins` property ([#9061](https://github.com/serverless/serverless/issues/9061)) ([5565047](https://github.com/serverless/serverless/commit/55650473828eb6df9563687ccf3996b6713da191)) ([Mariusz Nowak](https://github.com/medikoo))

### [2.28.4](https://github.com/serverless/serverless/compare/v2.28.3...v2.28.4) (2021-03-03)

### Bug Fixes

- **Variables:** Ensure to not share property cache across resolutions ([#9057](https://github.com/serverless/serverless/issues/9057)) ([68f326e](https://github.com/serverless/serverless/commit/68f326e79f92f8a94ba73352cba40c85e08c10cf)) ([Mariusz Nowak](https://github.com/medikoo))

### Maintenance Improvements

- **Variables:** Ensure to pass `isConfigurationResolved` to local instance ([#9057](https://github.com/serverless/serverless/issues/9057)) ([10e1dda](https://github.com/serverless/serverless/commit/10e1dda23b47cf439624c4602adce41a5c73fa51)) ([Mariusz Nowak](https://github.com/medikoo))
- Remove `bluebird` from `lib/plugins/aws` ([#9054](https://github.com/serverless/serverless/issues/9054)) ([b11171c](https://github.com/serverless/serverless/commit/b11171c70c8f5597e2644f7ea8ec82a17a9eee29)) ([Juanjo Diaz](https://github.com/juanjodiaz))

### [2.28.3](https://github.com/serverless/serverless/compare/v2.28.2...v2.28.3) (2021-03-02)

### Bug Fixes

- **Variables:**
  - Recognize hyphens in source types ([#9052](https://github.com/serverless/serverless/pull/9052)) ([21ac1be](https://github.com/serverless/serverless/commit/21ac1beb225946713665e9d8ad22d6e5c63819a9)) ([Mariusz Nowak](https://github.com/medikoo))
  - Ensure proper error handling for resolved value parsing([#9052](https://github.com/serverless/serverless/pull/9052)) ([df62739](https://github.com/serverless/serverless/commit/df627394b36c16553a73328850ff722f1063254c)) ([Mariusz Nowak](https://github.com/medikoo))

### [2.28.2](https://github.com/serverless/serverless/compare/v2.28.1...v2.28.2) (2021-03-02)

### Bug Fixes

- **Variables:** Ensure to resolve variables in resolved strings ([#9050](https://github.com/serverless/serverless/pull/9050)) ([480b612](https://github.com/serverless/serverless/commit/480b61270cfef8f1a4a5aa36cd235db2362c9cfd)) ([Mariusz Nowak](https://github.com/medikoo))
- **AWS Credentials:** Fix unrecognized profile error reporting ([#9045](https://github.com/serverless/serverless/pull/9045)) ([6c4beb6](https://github.com/serverless/serverless/commit/6c4beb64ee6fe6722fbb7ca757611807d4025a26)) ([Mariusz Nowak](https://github.com/medikoo))

### [2.28.1](https://github.com/serverless/serverless/compare/v2.28.0...v2.28.1) (2021-03-02)

### Bug Fixes

- **Variables:**
  - Error on property access attempt on primitive result ([#9032](https://github.com/serverless/serverless/pull/9032)) ([131516a](https://github.com/serverless/serverless/commit/131516a6d094ee9b75fbe9b1d975b96d9c358a82)) ([Mariusz Nowak](https://github.com/medikoo))
  - Resolve plain text for unrecognized extensions ([#9032](https://github.com/serverless/serverless/pull/9032)) ([d2e6a8a](https://github.com/serverless/serverless/commit/d2e6a8adef5632ddf63581cfacc7cb77bbc634af)) ([Mariusz Nowak](https://github.com/medikoo))

### Maintenance Improvements

- Improve deprecation message ([#9034](https://github.com/serverless/serverless/pull/9034)) ([8592bdb](https://github.com/serverless/serverless/commit/8592bdb1b2ecdbf4dd24700613cc664cbf3ec611)) ([Mariusz Nowak](https://github.com/medikoo))
- Remove `bluebird` from `lib/plugins/interactiveCli` ([#9029](https://github.com/serverless/serverless/issues/9029)) ([7c0ceb5](https://github.com/serverless/serverless/commit/7c0ceb5c4a1171666e381ef9a00c6f133569732b)) ([Juanjo Diaz](https://github.com/juanjodiaz))
- Remove `bluebird` from `lib/plugins/package` ([#9028](https://github.com/serverless/serverless/issues/9028)) ([0fb0f43](https://github.com/serverless/serverless/commit/0fb0f43919bd3bd4a9c57b9f33bf96a822ce027c)) ([Juanjo Diaz](https://github.com/juanjodiaz))
- Use `async` in `lib/plugins/aws/package` ([#8870](https://github.com/serverless/serverless/issues/8870)) ([6e486b3](https://github.com/serverless/serverless/commit/6e486b3eb1cbd1755501f00de59b2347e243c100)) ([ifitzsimmons](https://github.com/ifitzsimmons))
- **Variables:**
  - Resolve all env variables with new resolver ([#9040](https://github.com/serverless/serverless/pull/9040)) ([c1d8b58](https://github.com/serverless/serverless/commit/c1d8b58ed8a5a7a91d9dfa28536a9c0d997b809b)) ([Mariusz Nowak](https://github.com/medikoo))
  - Do not handle resolution when no vars to resolve ([#9040](https://github.com/serverless/serverless/pull/9040)) ([14ea1af](https://github.com/serverless/serverless/commit/14ea1af886496fac53d4aaffe009ae78873c81bb)) ([Mariusz Nowak](https://github.com/medikoo))
  - Do not run old resolver when no vars to resolve ([#9040](https://github.com/serverless/serverless/pull/9040)) ([7aac480](https://github.com/serverless/serverless/commit/7aac480fbb15d61a40320f98af4cee6f1b2475b3)) ([Mariusz Nowak](https://github.com/medikoo))
  - Make resolution error handler reusable ([#9040](https://github.com/serverless/serverless/pull/9040)) ([452fdc2](https://github.com/serverless/serverless/commit/452fdc2445e2c69a6c908f6b2b52c0659d87bbc0)) ([Mariusz Nowak](https://github.com/medikoo))
  - Make `resolverConfiguration` reusable ([#9040](https://github.com/serverless/serverless/pull/9040)) ([8e72247](https://github.com/serverless/serverless/commit/8e722472cc23eac7b342b3e67434977cc69698aa)) ([Mariusz Nowak](https://github.com/medikoo))

## [2.28.0](https://github.com/serverless/serverless/compare/v2.27.1...v2.28.0) (2021-02-26)

### Features

- **AWS API Gateway:** Allow reuse and customization of schema models ([#7619](https://github.com/serverless/serverless/pull/7619)) ([aeb64fd](https://github.com/serverless/serverless/commit/aeb64fd3cc6d27c495ce19efc3745a16a46b6534)) ([Jeffrey McGuffee](https://github.com/jmcguffee) & [Piotr Grzesik](https://github.com/pgrzesik))

### Bug Fixes

- **CLI:** Do not duplicate variables error information ([#9019](https://github.com/serverless/serverless/pull/9019)) ([2f62bdf](https://github.com/serverless/serverless/commit/2f62bdf2316a76a0dd4b855e178857ecff7c7402)) ([Mariusz Nowak](https://github.com/medikoo))
- **Variables:** Ensure to not share source cache across resolutions ([#9019](https://github.com/serverless/serverless/pull/9019)) ([5ad1c19](https://github.com/serverless/serverless/commit/5ad1c19cc9a5601184883a916a29172eeb9c3789)) ([Mariusz Nowak](https://github.com/medikoo))

### Maintenance Improvements

- **CLI:**
  - Require `variablesResolutionMode` to be resolved upfront ([#9014](https://github.com/serverless/serverless/pull/9014)) ([a488000](https://github.com/serverless/serverless/commit/a488000dc67c10026d010744bb29fca25f72f42b)) ([Mariusz Nowak](https://github.com/medikoo))
  - Resolve `.env` files before intializing `Serverless` instance ([#9014](https://github.com/serverless/serverless/pull/9014)) ([a9e3a66](https://github.com/serverless/serverless/commit/a9e3a667355e91af7fb558eb551ed7d59a865527)) ([Mariusz Nowak](https://github.com/medikoo))
- Remove `bluebird` from `lib/plugins/create` ([#8996](https://github.com/serverless/serverless/issues/8996)) ([258543a](https://github.com/serverless/serverless/commit/258543ab6e1874ba41be3563346cd7b50993ac58)) ([Juanjo Diaz](https://github.com/juanjodiaz))

## [2.27.1](https://github.com/serverless/serverless/compare/v2.27.0...v2.27.1) (2021-02-25)

### Bug Fixes

- **Variables:**
  - Fix nested sources resolution ([#9011](https://github.com/serverless/serverless/issues/9011)) ([99fd907](https://github.com/serverless/serverless/commit/99fd907abbe3d83f8db7bf3a1924da770bc18be8)) ([Mariusz Nowak](https://github.com/medikoo))
  - Report with `null` not existing `file` sources ([#9008](https://github.com/serverless/serverless/issues/9008)) ([3ab81e5](https://github.com/serverless/serverless/commit/3ab81e5be94c69b90dc8487e321fb4cf7efc2c11)) ([Mariusz Nowak](https://github.com/medikoo))
  - Fix unterminated variable resolution for some cases ([#9011](https://github.com/serverless/serverless/issues/9011)) ([cc5bfd5](https://github.com/serverless/serverless/commit/cc5bfd53ae2459e4d7ac1ec6314c030d39997958)) ([Mariusz Nowak](https://github.com/medikoo))
  - Communicate with meaningful error not accessible `provider` properties ([#8992](https://github.com/serverless/serverless/issues/8992)) ([e5307b0](https://github.com/serverless/serverless/commit/e5307b05d31b7a80be80fc72e1829aead8762680)) ([Mariusz Nowak](https://github.com/medikoo))
  - Improve JS file resolution error handling ([#9008](https://github.com/serverless/serverless/issues/9008)) ([9ecc108](https://github.com/serverless/serverless/commit/9ecc1087653edfde9da400f496030dea0d6203ce)) ([Mariusz Nowak](https://github.com/medikoo))

### Maintenance Improvements

- Remove `bluebird` from `lib/plugins/plugin` ([#8984](https://github.com/serverless/serverless/issues/8984)) ([9e79602](https://github.com/serverless/serverless/commit/9e7960297227b39f05c2619a80e3cac7cb7be1a5)) ([Juanjo Diaz](https://github.com/juanjodiaz))

## [2.27.0](https://github.com/serverless/serverless/compare/v2.26.0...v2.27.0) (2021-02-24)

### Features

- **AWS EventBridge:** Native CloudFormation based deployment (turn on via `provider.eventBridge.useCloudFormation: true`) ([#8437](https://github.com/serverless/serverless/issues/8437)) ([13444ca](https://github.com/serverless/serverless/commit/13444caa28a5fdb268599c8fa67f4bfef1dd5e36)) ([stuartforrest-infinity](https://github.com/stuartforrest-infinity) & [Piotr Grzesik](https://github.com/pgrzesik))
- **AWS Deploy:** Support `null` values for properties in CF resources (those properties will be removed for final CF template version) ([#8975](https://github.com/serverless/serverless/issues/8975)) ([9b030ad](https://github.com/serverless/serverless/commit/9b030ad5f4797c31ea37e621c1a3f297a29dfa86)) ([yumei](https://github.com/yumeixox))

### Bug Fixes

- **CLI:** Recognize `-s` as `--stage` alias, when expected ([9ae6045](https://github.com/serverless/serverless/commit/9ae604591dbb7e82aff0668d2055ed9d69bb920a)) ([#8997](https://github.com/serverless/serverless/issues/8997)) ([Mariusz Nowak](https://github.com/medikoo))
- **Variables:** Ensure vars are recognized in address followed by source ([#9000](https://github.com/serverless/serverless/issues/9000)) ([fb9ce24](https://github.com/serverless/serverless/commit/fb9ce246b37219b1e3077ea53777f753d0a9205d)) ([Mariusz Nowak](https://github.com/medikoo))

### Maintenance Improvements

- **AWS Deploy:** Rely on `provider.request` for AWS SDK calls ([#8913](https://github.com/serverless/serverless/issues/8913)) ([4e05995](https://github.com/serverless/serverless/commit/4e0599571afe11d4bd11aee14fe07be2be48fca0)) ([AlinoeDoctari](https://github.com/AlinoeDoctari))
- **CLI:**
  - Recognize `app` and `org` params ([#8997](https://github.com/serverless/serverless/issues/8997)) ([6b1921f](https://github.com/serverless/serverless/commit/6b1921f59e1105499a329ab3aaf6134e7fb0ff6c)) ([Mariusz Nowak](https://github.com/medikoo))
  - Refactor `-v` handling ([#8997](https://github.com/serverless/serverless/issues/8997)) ([8db64a1](https://github.com/serverless/serverless/commit/8db64a1f319d2238e71960d57425d2b6e5c9c5d6)) ([Mariusz Nowak](https://github.com/medikoo))

## [2.26.0](https://github.com/serverless/serverless/compare/v2.25.2...v2.26.0) (2021-02-24)

### Features

- **AWS HTTP API:** Add ability to apply `provider.tags` ([#8938](https://github.com/serverless/serverless/issues/8938)) ([9f5fd61](https://github.com/serverless/serverless/commit/9f5fd6100978a0bda1c300b9429b24b6e586c52f)) ([jayasai470](https://github.com/jayasai470))
- **Variables:** New parser and resolver implementation ([#8987](https://github.com/serverless/serverless/pull/8987)) ([fb2c425](https://github.com/serverless/serverless/commit/fb2c425ed2869d7faab4ae52cb001785aa389a40)) ([Mariusz Nowak](https://github.com/medikoo))

### Bug Fixes

- **AWS ALB:** Conform to CF schema with multiple host header ([#8965](https://github.com/serverless/serverless/issues/8965)) ([36c78c7](https://github.com/serverless/serverless/commit/36c78c70d1cf306556a5a9f8a3c3908e8b4c7d05)) ([Zach Swanson](https://github.com/zswanson))
- **CLI:** Fix resolution of empty valued params as `param=` ([#8978](https://github.com/serverless/serverless/pull/8978)) ([5acdc0a](https://github.com/serverless/serverless/commit/5acdc0a5e03994b6835a3be5411bffb905ca4cc2)) ([Mariusz Nowak](https://github.com/medikoo))
- Display version related deprecations only with functions ([#8980](https://github.com/serverless/serverless/pull/8980)) ([4f64e56](https://github.com/serverless/serverless/commit/4f64e560b9157dc8700328686a778ebd2a78ba9e)) ([Mariusz Nowak](https://github.com/medikoo))

### Maintenance Improvements

- Remove `bluebird` from `lib/classes` ([#8943](https://github.com/serverless/serverless/issues/8943)) ([1a694ae](https://github.com/serverless/serverless/commit/1a694ae4aab0a347b018380110b9a436f6c43c1e)) ([Juanjo Diaz](https://github.com/juanjodiaz))
- Remove `bluebird` from `lib/utils` ([#8972](https://github.com/serverless/serverless/issues/8972)) ([820cc1f](https://github.com/serverless/serverless/commit/820cc1f581bfd502e5452f5c9935301ec86f9d14)) ([Juanjo Diaz](https://github.com/juanjodiaz))
- Remove `bluebird` from top-level `lib/plugins` ([#8973](https://github.com/serverless/serverless/issues/8973)) ([8fead7f](https://github.com/serverless/serverless/commit/8fead7f39e3a5649e87a4ceb6e0c0a28e7f61ea5)) ([Juanjo Diaz](https://github.com/juanjodiaz))

### Templates

- Support TS path mapping in `aws-nodejs-typescript` ([#8968](https://github.com/serverless/serverless/issues/8968)) ([e050440](https://github.com/serverless/serverless/commit/e0504406ea8c70e2c42363bef9da468899a0ca03)) ([Nick Hammond](https://github.com/nhammond101))
- Ensure that `gradle-wrapper.jar` is not excluded ([#8967](https://github.com/serverless/serverless/pull/8967)) ([deed534](https://github.com/serverless/serverless/commit/deed53449fb4c302a3fe04f0f2bef19b27d9ef81)) ([Piotr Grzesik](https://github.com/pgrzesik))

### [2.25.2](https://github.com/serverless/serverless/compare/v2.25.1...v2.25.2) (2021-02-18)

### Bug Fixes

- **CLI:** Ensure to recognize `-v` param as boolean in all cases ([#8964](https://github.com/serverless/serverless/issues/8964)) ([82b95fc](https://github.com/serverless/serverless/commit/82b95fc4924d4e93a7ae79bb741859df3dd464c0)) ([Mariusz Nowak](https://github.com/medikoo))
- **AWS Lambda:** Throw verbose error when referencing invalid layer ([#8961](https://github.com/serverless/serverless/issues/8961)) ([5057f9a](https://github.com/serverless/serverless/commit/5057f9ab865dd62d12e8ff1f673615462470bb74)) ([Piotr Grzesik](https://github.com/pgrzesik))
- **Variables:** Properly resolve vars if `prototype` key is in property path ([#8962](https://github.com/serverless/serverless/issues/8962)) ([496d357](https://github.com/serverless/serverless/commit/496d3574c6f8df389331ec92fd330efb652f65e6)) ([Piotr Grzesik](https://github.com/pgrzesik))

### [2.25.1](https://github.com/serverless/serverless/compare/v2.25.0...v2.25.1) (2021-02-16)

### Bug Fixes

- **CLI:** Ensure support for upper case params ([b17c461](https://github.com/serverless/serverless/commit/b17c461a1291728cda8fe6fbfbc7a9f56ab59d33)) ([Mariusz Nowak](https://github.com/medikoo))

## [2.25.0](https://github.com/serverless/serverless/compare/v2.24.0...v2.25.0) (2021-02-16)

### Features

- **AWS HTTP API:** Support `provider.httpApi.disableDefaultEndpoint` ([#8649](https://github.com/serverless/serverless/issues/8649)) ([bebf343](https://github.com/serverless/serverless/commit/bebf3430b4a22f90497312759e3728a8a233115b)) ([Guillaume Desvé](https://github.com/gdraynz))

### Bug Fixes

- **CLI:** Ensure to support `_` in param names ([#8952](https://github.com/serverless/serverless/issues/8952)) ([7e3e50b](https://github.com/serverless/serverless/commit/7e3e50bca2c038398736eef8d867ff901da0aaae)) ([Mariusz Nowak](https://github.com/medikoo))

## [2.24.0](https://github.com/serverless/serverless/compare/v2.23.0...v2.24.0) (2021-02-16)

### Features

- **AWS IAM:** Group IAM-related settings under `provider.iam` ([#8701](https://github.com/serverless/serverless/issues/8701)) ([9ad4d07](https://github.com/serverless/serverless/commit/9ad4d07886d8bca29cb7c0802c3623defb6c8c3a)) ([Dmitry Shirokov](https://github.com/runk))

### Bug Fixes

- **AWS Deploy:** Ensure to handle artifact stream read errors ([#8948](https://github.com/serverless/serverless/pull/8948)) ([300e3a9](https://github.com/serverless/serverless/commit/300e3a92d5d5d54c4269dd05b6e5d9e2e96b380d)) ([Mariusz Nowak](https://github.com/medikoo))
- **AWS Lambda:** Properly resolve SHA for repo with slashes ([#8918](https://github.com/serverless/serverless/pull/8918)) ([4c74792](https://github.com/serverless/serverless/commit/4c7479283cd2bfb20b2ddb9d21b824b4757234ed)) ([Piotr Grzesik](https://github.com/pgrzesik))
- Reject non normative configuration structure ([#8927](https://github.com/serverless/serverless/pull/8927)) ([8bd4314](https://github.com/serverless/serverless/commit/8bd431473265d6bc2b536c0f5070f99e1639382d)) ([Mariusz Nowak](https://github.com/medikoo))

### Maintenance Improvements

- **CLI**:
  - Rely on new CLI args parser ([#8927](https://github.com/serverless/serverless/pull/8927)) ([9e059d0](https://github.com/serverless/serverless/commit/9e059d0f45b083f887bc07f0cbf33a81f5b91ba2)) ([Mariusz Nowak](https://github.com/medikoo))
  - Remove internal CLI arguments parsing ([#8927](https://github.com/serverless/serverless/pull/8927)) ([16950d0](https://github.com/serverless/serverless/commit/16950d098b0b78e6ad5de35e908c7a1ee91f775b)) ([Mariusz Nowak](https://github.com/medikoo))
  - Move deprecation report to `init` phase ([#8927](https://github.com/serverless/serverless/pull/8927)) ([1eaa626](https://github.com/serverless/serverless/commit/1eaa6260aa9f747d0aa01006ce54d3313e7b7e0f)) ([Mariusz Nowak](https://github.com/medikoo))
- Use `async/await` in `events/apiGateway`. ([#8869](https://github.com/serverless/serverless/issues/8869)) ([c5ba682](https://github.com/serverless/serverless/commit/c5ba682a6bc4fc96151c75cdf50cff2468d6def5)) ([ifitzsimmons](https://github.com/ifitzsimmons))
- Use `async/await` in `lib/plugins/aws/invokeLocal`. ([#8876](https://github.com/serverless/serverless/issues/8876)) ([134db21](https://github.com/serverless/serverless/commit/134db21ed27874ae64db1c8964523b5b5ae6c2bf)) ([ifitzsimmons](https://github.com/ifitzsimmons))
- Remove unneeded `split` in `getHttp` ([#8939](https://github.com/serverless/serverless/issues/8939)) ([7213d1d](https://github.com/serverless/serverless/commit/7213d1d4f85c7d1583c0eba531e026d3f7a8e96c)) ([Gareth Jones](https://github.com/G-Rath))
- Use standalone `ServerlessError`. ([#8897](https://github.com/serverless/serverless/issues/8897)) ([006557d](https://github.com/serverless/serverless/commit/006557d8471623af7f6b83c58a14e9e4fe244507)) ([Juanjo Diaz](https://github.com/juanjodiaz))
- Patch handling of `isInvokedByGlobalInstallation` flag ([#8927](https://github.com/serverless/serverless/pull/8927)) ([21c9f26](https://github.com/serverless/serverless/commit/21c9f26ea64a7dfc06a96c173c8268d8ad835870)) ([Mariusz Nowak](https://github.com/medikoo))

### Templates

- Add `package.json` to `plugin` template ([#8933](https://github.com/serverless/serverless/pull/8933)) ([410f0ec](https://github.com/serverless/serverless/commit/410f0ec3b5f09f9bef22d14fcaccbb8bd6e70460)) ([Piotr Grzesik](https://github.com/pgrzesik))
- Update `aws-nodejs-typescript` for `nodejs14.x` ([#8914](https://github.com/serverless/serverless/pull/8914)) ([5fa51dc](https://github.com/serverless/serverless/commit/5fa51dc53d039814aef80dd2a8c8069015215696)) ([Frédéric Barthelet](https://github.com/fredericbarthelet))
- Fix types handling in `aws-nodejs-typescript` ([#8929](https://github.com/serverless/serverless/issues/8929)) ([5302b91](https://github.com/serverless/serverless/commit/5302b9176097faee4c73d585b63e6bf772b64e43)) ([g-awa](https://github.com/daisuke-awaji))
- Fix statement in `.npmignore` to handle `.gitignore` ([#8947](https://github.com/serverless/serverless/pull/8947)) ([d0c0879](https://github.com/serverless/serverless/commit/d0c0879032aedca567fef807b7143b7325f43b4d)) ([Piotr Grzesik](https://github.com/pgrzesik))

## [2.23.0](https://github.com/serverless/serverless/compare/v2.22.0...v2.23.0) (2021-02-08)

### Features

- **AWS Lambda:** Add support for `nodejs14.x` runtime ([#8894](https://github.com/serverless/serverless/issues/8894)) ([8799cbb](https://github.com/serverless/serverless/commit/8799cbbae76c1e189bd5d576fc68406daf9d9787)) ([Subash Adhikari](https://github.com/adikari))

### Bug Fixes

- **AWS Lambda:** Ensure proper normalization of ECR repository name ([#8908](https://github.com/serverless/serverless/pull/8908)) ([c5639d2](https://github.com/serverless/serverless/commit/c5639d21ea4db9fe7ab9d9f00c8bcf42e4b81ad7)) ([Piotr Grzesik](https://github.com/pgrzesik))
- **AWS Deploy:** Gracefully handle denied access to ECR ([#8901](https://github.com/serverless/serverless/pull/8901)) ([816394c](https://github.com/serverless/serverless/commit/816394c6e5dfc50b332314aef66eeb9ed75d139a)) ([Piotr Grzesik](https://github.com/pgrzesik))
- **AWS Local Invocation**: Properly handle error if Java bridge is not present ([#8868](https://github.com/serverless/serverless/pull/8868)) ([11fb141](https://github.com/serverless/serverless/commit/11fb14115ea47d53a61fa666a94e60d585fb3a4d)) ([Piotr Grzesik](https://github.com/pgrzesik))
- **CLI**:
  - Properly resolve local version ([#8899](https://github.com/serverless/serverless/pull/8899)) ([053bcc7](https://github.com/serverless/serverless/commit/053bcc7624f5d1ace56c708be5125fc665973a1d)) ([Piotr Grzesik](https://github.com/pgrzesik))
  - Handle gently npm response errors ([#8900](https://github.com/serverless/serverless/pull/8900)) ([ab77a11](https://github.com/serverless/serverless/commit/ab77a11e135ec879b3309205d8bfe010ceb68e9e)) ([Mariusz Nowak](https://github.com/medikoo))

### Maintenance Improvements

- Use `async/await` in `lib/plugins/aws`. ([#8871](https://github.com/serverless/serverless/issues/8871)) ([efbaf00](https://github.com/serverless/serverless/commit/efbaf00b33ca2f51d2f0b18b98466341e51f3052)) ([ifitzsimmons](https://github.com/ifitzsimmons))
- Use `async/await` in `lib/plugins`. ([#8875](https://github.com/serverless/serverless/issues/8875)) ([f95971d](https://github.com/serverless/serverless/commit/f95971d22b65c963ab01ac0273abcffb932b2434)) ([ifitzsimmons](https://github.com/ifitzsimmons))
- Use `async/await` in `aws/package/compile/events` ([#8873](https://github.com/serverless/serverless/issues/8873)) ([3c93e2a](https://github.com/serverless/serverless/commit/3c93e2a5347ed700e55d4307b4498e0c49eb8a03)) ([ifitzsimmons](https://github.com/ifitzsimmons))
- Use `async/await` in `compile/events/websockets` ([#8874](https://github.com/serverless/serverless/issues/8874)) ([61dd3bd](https://github.com/serverless/serverless/commit/61dd3bde8d17cdd995fdd27259a689d12bee1e42)) ([ifitzsimmons](https://github.com/ifitzsimmons))
- Use `async/await` in `lib/plugins/aws/lib` ([#8872](https://github.com/serverless/serverless/issues/8872)) ([489affc](https://github.com/serverless/serverless/commit/489affcb520d8f50f87c84b932627812f491e66c)) ([ifitzsimmons](https://github.com/ifitzsimmons))

## [2.22.0](https://github.com/serverless/serverless/compare/v2.21.1...v2.22.0) (2021-02-02)

### Features

- **AWS Lambda:** Add ability to customize `file` for Dockerfile ([#8865](https://github.com/serverless/serverless/pull/8865)) ([785f97b](https://github.com/serverless/serverless/commit/785f97b1a9e9b4c9cb24f3cb05a502f2d3ae1680)) ([Piotr Grzesik](https://github.com/pgrzesik))
- **Standalone:** Allow to install specific versions ([#8858](https://github.com/serverless/serverless/issues/8858)) ([019f0bf](https://github.com/serverless/serverless/commit/019f0bf410c5c1c0ff0383221863cca171e1dcc9)) ([alegonz](https://github.com/alegonz))

### Bug Fixes

- **CLI:** Ensure to not display programmatic use deprecation ([#8864](https://github.com/serverless/serverless/pull/8864)) ([fa626a8](https://github.com/serverless/serverless/commit/fa626a8e22870d0e5ad549a9d7eab656e7e664aa)) ([Mariusz Nowak](https://github.com/medikoo))
- **Config Schema:**
  - Add type to `logRetentionInDays` ([#8844](https://github.com/serverless/serverless/issues/8844)) ([ec12a2b](https://github.com/serverless/serverless/commit/ec12a2be0a9510ababca8ffc5fe8836dcef82773)) ([frozenbonito](https://github.com/frozenbonito))
  - Filter out duplicate error messages ([#8849](https://github.com/serverless/serverless/pull/8849)) ([e0bc57a](https://github.com/serverless/serverless/commit/e0bc57ab1fee0a40a9e9278fa00eb2b851df2e55)) ([Piotr Grzesik](https://github.com/pgrzesik))
  - Add schema dependencies for `image` config ([#8849](https://github.com/serverless/serverless/pull/8849)) ([297c229](https://github.com/serverless/serverless/commit/297c22972ea7d477a9ced296f591f8ab0a8ac77f)) ([Piotr Grzesik](https://github.com/pgrzesik))

### Maintenance Improvements

- Replace `fse.promises.realpath` with `fs.promises.realpath` ([#8853](https://github.com/serverless/serverless/pull/8853)) ([f5174ff](https://github.com/serverless/serverless/commit/f5174ffa8027392525a7c57ea1fa59627a61bcc1)) ([Sudipto Das](https://github.com/sdas13))

### Templates

- Add `aws-nodejs-docker` template ([#8845](https://github.com/serverless/serverless/pull/8845)) ([1a0390b](https://github.com/serverless/serverless/commit/1a0390b59722d84e87595bc462c83b6baf214da1)) ([Piotr Grzesik](https://github.com/pgrzesik))
- Add `aws-python-docker` template ([#8846](https://github.com/serverless/serverless/pull/8846)) ([fd9b26a](https://github.com/serverless/serverless/commit/fd9b26a9e898685da81663064274250c5771363c)) ([Piotr Grzesik](https://github.com/pgrzesik))
- Fix handler path resolution in `aws-nodejs-typescript` ([#8829](https://github.com/serverless/serverless/pull/8829)) ([b753641](https://github.com/serverless/serverless/commit/b753641b072485d4764e891b5e90242776bec724)) ([Frédéric Barthelet](https://github.com/fredericbarthelet))
- Ensure that `.gitignore` is packaged for templates ([#8829](https://github.com/serverless/serverless/pull/8829)) ([e79f906](https://github.com/serverless/serverless/commit/e79f906b9fd0940e8eb1367cf6ce1ed1095f0c46)) ([Piotr Grzesik](https://github.com/pgrzesik))

### [2.21.1](https://github.com/serverless/serverless/compare/v2.21.0...v2.21.1) (2021-01-26)

### Bug Fixes

- **CLI:** Fix resolution of service path where nested config is involved ([#8835](https://github.com/serverless/serverless/pull/8835)) ([9b7315f](https://github.com/serverless/serverless/commit/9b7315f080d5bbccf2c9e7d618e7a7dbeb9a12b2)) ([Mariusz Nowak](https://github.com/medikoo))
- **AWS CloudFront:**
  - Ensure unique names for cache policy ([#8818](https://github.com/serverless/serverless/issues/8818)) ([a108b76](https://github.com/serverless/serverless/commit/a108b761d05fc72987542588fefa65d7e57ac7ec)) ([Ben Scholzen](https://github.com/DASPRiD))
  - Fix origin object schema ([#8827](https://github.com/serverless/serverless/issues/8827)) ([90d9fc2](https://github.com/serverless/serverless/commit/90d9fc2b5fbf700a6c1b4da60a6f211ca5e43bd4)) ([frozenbonito](https://github.com/frozenbonito))
- Fix AWS tags validation schema ([#8766](https://github.com/serverless/serverless/issues/8766)) ([4dff8e5](https://github.com/serverless/serverless/commit/4dff8e53a64ad38a2b8515ca2543b49c001a779c)) ([Sam Stenvall](https://github.com/Jalle19))

### Maintenance Improvements

- Remove obsolete `getLocalAccessKey` util ([#8834](https://github.com/serverless/serverless/issues/8834)) ([90d9fc2](https://github.com/serverless/serverless/commit/90d9fc2b5fbf700a6c1b4da60a6f211ca5e43bd4))([6f9824a](https://github.com/serverless/serverless/commit/6f9824abac780d4725d401c776d80ed658e31d04)) ([Piotr Grzesik](https://github.com/pgrzesik))
- Upgrade to `@serverless/utils` v3 ([#8834](https://github.com/serverless/serverless/issues/8834)) ([f6c5427](https://github.com/serverless/serverless/commit/f6c5427b0f12925ed4e91e70b6ca0bbfaf95616d)) ([Piotr Grzesik](https://github.com/pgrzesik))

## [2.21.0](https://github.com/serverless/serverless/compare/v2.20.1...v2.21.0) (2021-01-26)

### Features

- **AWS CloudFront:** Support CF functions for origin and domain ([#8828](https://github.com/serverless/serverless/pull/8828)) ([0839b58](https://github.com/serverless/serverless/commit/0839b5862caddb71f31b62493bbb7324d278bd70)) ([frozenbonito](https://github.com/frozenbonito))
- **AWS Lambda:** Add support for self-managed `kafka` event ([#8784](https://github.com/serverless/serverless/pull/8784)) ([ff60501](https://github.com/serverless/serverless/commit/ff605018a70a7156b0ca021adb080a4b4e0f2ede)) ([lewgordon](https://github.com/lewgordon))
- Support `kmsKeyArn` for `deploy function` ([#8697](https://github.com/serverless/serverless/pull/8697)) ([8a92be9](https://github.com/serverless/serverless/commit/8a92be9be37b554c0e1ec95f5d040ecc5b2d63cc)) ([ifitzsimmons](https://github.com/ifitzsimmons))

### Bug Fixes

- **CLI:** Fix resolution of "--config=<configPath>" format ([#8825](https://github.com/serverless/serverless/pull/8825)) ([cd5a739](https://github.com/serverless/serverless/commit/cd5a739265e2fe90f53f900f567eddcb9010b3aa)) ([Mariusz Nowak](https://github.com/medikoo))
- **Packaging:** Proper exclusion of dependencies across platforms ([#8831](https://github.com/serverless/serverless/pull/8831)) ([847aa9c](https://github.com/serverless/serverless/commit/847aa9ca7f885f126c4a0a0279db30c05a8c9a6f)) ([Piotr Grzesik](https://github.com/pgrzesik))
- **Standalone:** Ensure proper resolution of runtime wrappers ([#8809](https://github.com/serverless/serverless/pull/8809)) ([1833894](https://github.com/serverless/serverless/commit/1833894856991e98e0d32701217453c413164cf3)) ([Piotr Grzesik](https://github.com/pgrzesik))

### Maintenance Improvements

- Custom execution role getter ([#8824](https://github.com/serverless/serverless/issues/8824)) ([12805c3](https://github.com/serverless/serverless/commit/12805c3d152d85af9dba3dd3ecfa2002a621f6a8)) ([Dmitry Shirokov](https://github.com/runk))
- Replace `fse.exists` with `fs.promises.access` ([#8788](https://github.com/serverless/serverless/issues/8788)) ([9abe9db](https://github.com/serverless/serverless/commit/9abe9db27f26ad9d7fb55ce5fcf5bbbb9235b974)) ([Sudipto Das](https://github.com/sdas13))
- Seclude configuration parse from internals ([#8801](https://github.com/serverless/serverless/pull/8801)) ([f274cd7](https://github.com/serverless/serverless/commit/f274cd7637e8171ee04bd174e786c7e07706343a)) ([Mariusz Nowak](https://github.com/medikoo))

### [2.20.1](https://github.com/serverless/serverless/compare/v2.20.0...v2.20.1) (2021-01-22)

### Bug Fixes

- **CLI:** Bring back support for referencing nested configurations ([#8804](https://github.com/serverless/serverless/issues/8804)) ([7339351](https://github.com/serverless/serverless/commit/7339351de3b9829750a94bb5a98053da7c0b7bd5)) ([Mariusz Nowak](https://github.com/medikoo))
- **Packaging:** Properly exclude devDependencies on Windows ([#8803](https://github.com/serverless/serverless/issues/8803)) ([708f6a7](https://github.com/serverless/serverless/commit/708f6a7e267e6c0c66da8bd97fdaf735909077d4)) ([Tomás Milar](https://github.com/tmilar))

## [2.20.0](https://github.com/serverless/serverless/compare/v2.19.0...v2.20.0) (2021-01-21)

### Features

- **AWS Lambda:**
  - Add support for building Docker images ([#8725](https://github.com/serverless/serverless/issues/8725)) ([789c2e3](https://github.com/serverless/serverless/commit/789c2e35ab26b7e8dc0679f36110234fb899d57c)) ([Piotr Grzesik](https://github.com/pgrzesik))
  - Add support for image config ([#8778](https://github.com/serverless/serverless/issues/8778)) ([9a55537](https://github.com/serverless/serverless/commit/9a5553742a3c3ebee03bfab5663a9183d5c228ba)) ([Piotr Grzesik](https://github.com/pgrzesik))

### Bug Fixes

- **AWS API Gateway:**
  - Correctly set `throttle` when `quota` missing ([#8780](https://github.com/serverless/serverless/pull/8780)) ([4a30bb1](https://github.com/serverless/serverless/commit/4a30bb1e5b36b52207e1bd3f3fc37e12878fb3b3)) ([Cem Enson](https://github.com/cemenson))
  - Silence timeout warning for `async: true` ([#8748](https://github.com/serverless/serverless/issues/8748)) ([0384776](https://github.com/serverless/serverless/commit/03847769cd238824cbe9ea9fdec1889645081b17)) ([Igor Omelchenko](https://github.com/MEGApixel23))
- **AWS Lambda:** Ensure function update works when image used ([#8786](https://github.com/serverless/serverless/issues/8786)) ([420e937](https://github.com/serverless/serverless/commit/420e93740f1e9bffc285559b2567379f550f28af)) ([Piotr Grzesik](https://github.com/pgrzesik))
- **AWS CloudFront:** Fix check for deprecated `CacheBehavior` properties ([#8768](https://github.com/serverless/serverless/pull/8768)) ([c3a61e2](https://github.com/serverless/serverless/commit/c3a61e234bf73429b946e09121b48306e56e0ed5)) ([Ben Scholzen](https://github.com/DASPRiD))
- **CLI Onboarding:**
  - Ensure to not follow with project setup on existing path ([#8770](https://github.com/serverless/serverless/pull/8770)) ([293cd6d](https://github.com/serverless/serverless/commit/293cd6d0e2b595a35031eae1ae1f981a6e51e3f5)) ([Mariusz Nowak](https://github.com/medikoo))
  - Fix configuration of a new service in interactive setup ([#8770](https://github.com/serverless/serverless/pull/8770)) ([76fa62d](https://github.com/serverless/serverless/commit/76fa62da3b050260063f52cb0586f626ff6de018)) ([Mariusz Nowak](https://github.com/medikoo))

### Maintenance Improvements

- **CLI:** Seclude service config path resolution out of internals ([#8770](https://github.com/serverless/serverless/pull/8770)) ([b23bfdb](https://github.com/serverless/serverless/commit/b23bfdbf6ad915ec00fec562f8b75c40c44dd19d)) ([Mariusz Nowak](https://github.com/medikoo))
- Mark functions async in `aws/customResources` and `aws/deploy` ([#8698](https://github.com/serverless/serverless/pull/8698)) ([c45f661](https://github.com/serverless/serverless/commit/c45f66117892e6f5948274288d7dda41f96dfe85)) ([ifitzsimmons](https://github.com/ifitzsimmons))

### Templates

- Add node version constraint to `aws-nodejs-typescript` ([#8776](https://github.com/serverless/serverless/pull/8776)) ([37d5f9e](https://github.com/serverless/serverless/commit/37d5f9e74024b54955eb4d503edfefcaf0b03444)) ([Frédéric Barthelet](https://github.com/fredericbarthelet))
- Compilation target ES2019 in `aws-nodejs-typescript` ([#8774](https://github.com/serverless/serverless/pull/8774)) ([4469388](https://github.com/serverless/serverless/commit/4469388669d50193dedc6e2695789d24fe30a238)) ([Frédéric Barthelet](https://github.com/fredericbarthelet))

## [2.19.0](https://github.com/serverless/serverless/compare/v2.18.0...v2.19.0) (2021-01-15)

### Features

- **Variables:**
  - Introduce unresolvedVariablesNotificationMode ([#8710](https://github.com/serverless/serverless/issues/8710)) ([33cffc3](https://github.com/serverless/serverless/commit/33cffc3509255663c9ab94f3cd38f115d71bd1d2)) ([Gareth Jones](https://github.com/G-Rath))
  - Add support for Terraform state file parsing ([#8755](https://github.com/serverless/serverless/issues/8755)) ([461a396](https://github.com/serverless/serverless/commit/461a3965a52eb9707121700608dc8bdbafc367d1)) ([Brian Dwyer](https://github.com/bdwyertech))

### Bug Fixes

- **AWS CloudFront:** Fix deprecations visibility ([#8759](https://github.com/serverless/serverless/pull/8759)) ([6c67cd7](https://github.com/serverless/serverless/commit/6c67cd7f074ef27c9410f29b368dc7e87b5b6e2d)) ([Mariusz Nowak](https://github.com/medikoo))
- **Config Schema:** Revert to ajv v6 ([#8762](https://github.com/serverless/serverless/issues/8762)) ([d1c6568](https://github.com/serverless/serverless/commit/d1c656838f5d19dd2b1d214c30ea2f292915a5b2)) ([Piotr Grzesik](https://github.com/pgrzesik))
- **Packaging:** Consider absolute artifact paths ([#8325](https://github.com/serverless/serverless/issues/8325)) ([#8315](https://github.com/serverless/serverless/issues/8315)) ([bcbbd47](https://github.com/serverless/serverless/commit/bcbbd47fa09b7d99d7f8da3f11150215d1203bba)) ([Robert Bragg](https://github.com/rib) & [Piotr Grzesik](https://github.com/pgrzesik))

### Maintenance Improvements

- Abstract resolution of deployment role ([#8751](https://github.com/serverless/serverless/issues/8751)) ([4afdb83](https://github.com/serverless/serverless/commit/4afdb8314b5c4718e73de733e3c4b30ae62382ba)) ([Dmitry Shirokov](https://github.com/runk))
- Cleanup `mergeIamTemplates` module ([#8736](https://github.com/serverless/serverless/issues/8736)) ([77e1a6a](https://github.com/serverless/serverless/commit/77e1a6a30246f94fcdf8ae26ca2cb8617aa1db2b)) ([Dmitry Shirokov](https://github.com/runk))
- Improve error handling scope ([#8726](https://github.com/serverless/serverless/pull/8726)) ([49aabdf](https://github.com/serverless/serverless/commit/49aabdf13d2ee74380ec2d21f57ffde494a9bf9d)) ([Mariusz Nowak](https://github.com/medikoo))
- Reconfigure `onExitPromise` setup ([#8726](https://github.com/serverless/serverless/pull/8726)) ([22a03ce](https://github.com/serverless/serverless/commit/22a03ce0d7b1581747b121f862d0818f04120958)) ([Mariusz Nowak](https://github.com/medikoo))
- Refactor `Serverless.run` to async ([#8749](https://github.com/serverless/serverless/pull/8749)) ([30015ea](https://github.com/serverless/serverless/commit/30015eafd2fb9d2e82d8f34ee8f10c1fb4e536a0)) ([Piotr Grzesik](https://github.com/pgrzesik))
- Seclude `cli/resolve-local-serverless-path` util ([#8726](https://github.com/serverless/serverless/pull/8726)) ([9d78348](https://github.com/serverless/serverless/commit/9d783482895d82a1bfdb627c4cc0debb32123d56)) ([Mariusz Nowak](https://github.com/medikoo))
- Seclude `ensureExists` util ([#8744](https://github.com/serverless/serverless/pull/8744)) ([c3f59e4](https://github.com/serverless/serverless/commit/c3f59e4d785145c2e1ba7c1324f3afedba482479)) ([Piotr Grzesik](https://github.com/pgrzesik))
- Seclude `ServerlessError` into `lib/serverless-error.js` ([#8743](https://github.com/serverless/serverless/pull/8743)) ([87790e5](https://github.com/serverless/serverless/commit/87790e50bd9c178aefd4f2ad8793c9c56fb8eb49)) ([Mariusz Nowak](https://github.com/medikoo))
- Typos in schema ([#8735](https://github.com/serverless/serverless/issues/8735)) ([2b7568a](https://github.com/serverless/serverless/commit/2b7568a960c88dda8ab2bbe1b6c8dd238fa78a51)) ([Dmitry Shirokov](https://github.com/runk))
- Seclude main error handler to standalone util ([#8726](https://github.com/serverless/serverless/pull/8726)) ([847fa34](https://github.com/serverless/serverless/commit/847fa3412d221c2ff98ab0cd9165bfc193c8a224)) ([Mariusz Nowak](https://github.com/medikoo))
- **CLI:** Seclude version output functionality out of `CLI` class ([#8741](https://github.com/serverless/serverless/pull/8741)) ([b61621a](https://github.com/serverless/serverless/commit/b61621adebb7eb33fd080db3fff13d7e9a32d99b)) ([Mariusz Nowak](https://github.com/medikoo))

### Templates

- Fix typo in `package.json` for template `aws-nodejs-typescript` ([#8754](https://github.com/serverless/serverless/issues/8754)) ([37398d0](https://github.com/serverless/serverless/commit/37398d06c582b1676c2aaa32708cfd515baf65b9)) ([Alexandre de Boutray](https://github.com/aldebout))

## [2.18.0](https://github.com/serverless/serverless/compare/v2.17.0...v2.18.0) (2021-01-07)

### Features

- **AWS API Gateway:** Move api-specific keys to `provider.apiGateway` ([#8670](https://github.com/serverless/serverless/pull/8670)) ([eacae9a](https://github.com/serverless/serverless/commit/eacae9a64da22ddf0fca8beff580a951e20d4fc0)) ([Frédéric Barthelet](https://github.com/fredericbarthelet))
- AWS `iotFleetProvisioning` event support ([#8324](https://github.com/serverless/serverless/issues/8324)) ([7d80245](https://github.com/serverless/serverless/commit/7d80245839918f10c3f5681e896ef36c657b38cb)) ([Frédéric Barthelet](https://github.com/fredericbarthelet))
- **Standalone:** Update to Node 14 for standalone binaries ([#8723](https://github.com/serverless/serverless/pull/8723)) ([5cc3be1](https://github.com/serverless/serverless/commit/5cc3be15be83b5358b78fccc9ef7e7f2a3bed45d)) ([Piotr Grzesik](https://github.com/pgrzesik))

### Bug Fixes

- **Config Schema:** Improve AWS tags validation ([#8714](https://github.com/serverless/serverless/pull/8714)) ([b093609](https://github.com/serverless/serverless/commit/b093609f7952d5a63c91e6435b6a3a7d7d09cb1a)) ([Rohit Gohri](https://github.com/rohit-gohri))

### Maintenance Improvements

- Replace `_.set` with native assignment ([#8709](https://github.com/serverless/serverless/pull/8709)) ([66aa66f](https://github.com/serverless/serverless/commit/66aa66fbfe363edeb4123d709890a7c78f74b571)) ([Frédéric Barthelet](https://github.com/fredericbarthelet))
- Upgrade "ajv" to v7 and "ajv-keywords" to v4 ([#8703](https://github.com/serverless/serverless/issues/8703)) ([1af73ba](https://github.com/serverless/serverless/commit/1af73bacdf01e5dc855da59387ab36085b2b78a1)) ([Frédéric Barthelet](https://github.com/fredericbarthelet))
- Use ajv formats ([036698c](https://github.com/serverless/serverless/commit/036698ca5b46dc27a2844114813812a83f64813e)) ([Piotr Grzesik](https://github.com/pgrzesik))
- Upgrade "js-yaml" to v4 ([#8708](https://github.com/serverless/serverless/pull/8708)) ([b143383](https://github.com/serverless/serverless/commit/b14338332c86a4461d0e1c564c740c1f6a29fb4a)) ([Mariusz Nowak](https://github.com/medikoo))
- Use @serverless/utils for cloudformationSchema ([#8705](https://github.com/serverless/serverless/issues/8705)) ([2efc357](https://github.com/serverless/serverless/commit/2efc3570c953cff04a22c8690f510532d5650eac)) ([Frédéric Barthelet](https://github.com/fredericbarthelet))

## [2.17.0](https://github.com/serverless/serverless/compare/v2.16.1...v2.17.0) (2020-12-30)

### Features

- **AWS Deploy:** Improve function version hashing algorithm ([#8661](https://github.com/serverless/serverless/issues/8661)) ([ef53050](https://github.com/serverless/serverless/commit/ef530506d5044ab3312c829838bb29cfcd2c889f)) ([Piotr Grzesik](https://github.com/pgrzesik))
- **AWS Lambda:** Support referencing images with tags ([#8683](https://github.com/serverless/serverless/issues/8683)) ([68b7ed5](https://github.com/serverless/serverless/commit/68b7ed5089f9226c1dbe3b992b93afdcf2015736)) ([Piotr Grzesik](https://github.com/pgrzesik))
- **AWS HTTP API:** Expose HTTP API in CloudFormation stack outputs ([#8664](https://github.com/serverless/serverless/issues/8664)) ([f9c8677](https://github.com/serverless/serverless/commit/f9c8677eccdfe14382c7e90079abce9f7bfed866)) ([Santhos Baala, Ramalingam Santhanakrishnan](https://github.com/captainsano))
- **Config Schema:** Validate extensions against collisions with existing properties ([#8655](https://github.com/serverless/serverless/issues/8655)) ([7266599](https://github.com/serverless/serverless/commit/7266599a7dcfcb96cdfcb73a95c3d162fe6f3a1f)) ([Frédéric Barthelet](https://github.com/fredericbarthelet))
- Support `--context` and `--contextPath` at `invoke` command ([#8652](https://github.com/serverless/serverless/issues/8652)) ([ff253e3](https://github.com/serverless/serverless/commit/ff253e32dd5e9c17f46f5a359ebfb9007b6ffa7d)) ([lewgordon](https://github.com/lewgordon))

### Bug Fixes

- **AWS CloudFront:** Ensure to describe resolved stage in comment ([#8685](https://github.com/serverless/serverless/issues/8685)) ([120bfb7](https://github.com/serverless/serverless/commit/120bfb7c0273e2ddd120a4311ee736694568fc53)) ([Mariusz Nowak](https://github.com/medikoo))
- **Variables:** Fix handling of `null` in deep property resolution ([#8165](https://github.com/serverless/serverless/issues/8165)) ([eb11e6d](https://github.com/serverless/serverless/commit/eb11e6d92b99687529fed708d3f7f5a28ef1c027)) ([Antoine Pham](https://github.com/MystK) & [Piotr Grzesik](https://github.com/pgrzesik))
- **AWS Lambda:** Ensure layer permissions are retained with layer itself ([#8688](https://github.com/serverless/serverless/issues/8688)) ([bf418ac](https://github.com/serverless/serverless/commit/bf418ac6ca14f3a5570998f5fecf2bfd8a3d12a6)) ([raym0nd93](https://github.com/raym0nd93) & [Piotr Grzesik](https://github.com/pgrzesik))

### Templates

- Update `aws-nodejs-typescript` template ([#8646](https://github.com/serverless/serverless/issues/8646)) ([c9db035](https://github.com/serverless/serverless/commit/c9db035266db23518011a4b7457319add0c00994)) ([Frédéric Barthelet](https://github.com/fredericbarthelet))
- Upgrade to avoid using deprecated functionality ([#8677](https://github.com/serverless/serverless/issues/8677)) ([3c5e497](https://github.com/serverless/serverless/commit/3c5e497116bec410b16f4a752c30e19b856df898)) ([Piotr Grzesik](https://github.com/pgrzesik))

### [2.16.1](https://github.com/serverless/serverless/compare/v2.16.0...v2.16.1) (2020-12-22)

### Bug Fixes

- **Packaging:** Exclude `.env` files only when `useDotenv` is set ([#8648](https://github.com/serverless/serverless/pull/8648)) ([537fcac](https://github.com/serverless/serverless/commit/537fcac7597f0c6efbae7a5fc984270a78a2a53a)) ([Piotr Grzesik](https://github.com/pgrzesik))

## [2.16.0](https://github.com/serverless/serverless/compare/v2.15.0...v2.16.0) (2020-12-18)

### Features

- **AWS ALB:** Recognize `path` as optional condition ([#8571](https://github.com/serverless/serverless/issues/8571)) ([3632e0e](https://github.com/serverless/serverless/commit/3632e0ee09945ed5f293779a68409cb297c7d0cc)) ([Jin](https://github.com/jinhong-))

### Bug Fixes

- **AWS Deploy:**
  - Fix resolution of first deploy event ([#8632](https://github.com/serverless/serverless/issues/8632)) ([9bc1060](https://github.com/serverless/serverless/commit/9bc1060dceb6a155abdb27364a9d0061b4d95983)) ([Mariusz Nowak](https://github.com/medikoo))
  - Allow to disable creation of default bucket policy ([#6923](https://github.com/serverless/serverless/issues/6923)) ([919b95f](https://github.com/serverless/serverless/commit/919b95f4911b29d5e05fc3adaa097ad7a22b4c18)) ([Piotr Grzesik](https://github.com/pgrzesik))
- **Packaging:**
  - Add exec bit for packaged files on Windows ([#8615](https://github.com/serverless/serverless/issues/8615)) ([c864fbd](https://github.com/serverless/serverless/commit/c864fbd4826de27d2796e394b0a100c8d3add33e)) ([Łukasz Jendrysik](https://github.com/scadu))
  - Do not exclude layer paths when packaging a layer ([#8602](https://github.com/serverless/serverless/issues/8602)) ([86b366a](https://github.com/serverless/serverless/commit/86b366a5d3b6b0bd00b73c71d0c1a0661ff27ce2)) ([Juanjo Diaz](https://github.com/juanjodiaz))
  - Ensure that .env files are excluded from package ([#8566](https://github.com/serverless/serverless/issues/8566)) ([8791cda](https://github.com/serverless/serverless/commit/8791cdacb75c84a2e08c5639abf769e915968288)) ([Piotr Grzesik](https://github.com/pgrzesik))
  - Expose meaningfully file access errors ([#8582](https://github.com/serverless/serverless/issues/8582)) ([13c7b7b](https://github.com/serverless/serverless/commit/13c7b7bc97aab4d70e178fdb25af1b2c3b85ac5b)) ([Łukasz Jendrysik](https://github.com/scadu))
- **AWS Lambda:** Improve "image" property validation ([#8639](https://github.com/serverless/serverless/pull/8639)) ([a8be1d1](https://github.com/serverless/serverless/commit/a8be1d1776a26b033d821d70e99ad654a39a4158)) ([Mariusz Nowak](https://github.com/medikoo))
- **Standalone:** Fix upgrade command ([#8608](https://github.com/serverless/serverless/pull/8608)) ([f23e50b](https://github.com/serverless/serverless/commit/f23e50b16e50559596fbd9561dfb4ced82973814)) ([Mariusz Nowak](https://github.com/medikoo))

### Maintenance Improvements

- **AWS Deploy:** Follow AWS naming in stack deploy action types ([#8632](https://github.com/serverless/serverless/issues/8632)) ([a238a9b](https://github.com/serverless/serverless/commit/a238a9bc902a1443007848c65d9a179ec78e5c8f)) ([Mariusz Nowak](https://github.com/medikoo))
- Convert to native Promise and async/await ([#8593](https://github.com/serverless/serverless/issues/8593)) ([84d423d](https://github.com/serverless/serverless/commit/84d423d3be9d89475a22f29f808d506fb4f56d3c)) ([Juanjo Diaz](https://github.com/juanjodiaz))
- Normalize module path ([#8620](https://github.com/serverless/serverless/pull/8620)) ([Mariusz Nowak](https://github.com/medikoo))
- Remove dependency to stream-promise ([#8601](https://github.com/serverless/serverless/issues/8601)) ([ca697f3](https://github.com/serverless/serverless/commit/ca697f3911aec5a0bb0e02ce5bfdef5bbd4cc00a)) ([Juanjo Diaz](https://github.com/juanjodiaz))
- Remove irrelevant fs modules ([#8588](https://github.com/serverless/serverless/issues/8588)) ([c1907a2](https://github.com/serverless/serverless/commit/c1907a2dde7531dab8bff665434ee8a72397c2ca)) ([Mariusz Nowak](https://github.com/medikoo))
- Remove unused modules ([#8598](https://github.com/serverless/serverless/issues/8598)) ([d102a39](https://github.com/serverless/serverless/commit/d102a3984abfe5c014c4adafa8abf2ea8edfd336)) ([Juanjo Diaz](https://github.com/juanjodiaz))

## [2.15.0](https://github.com/serverless/serverless/compare/v2.14.0...v2.15.0) (2020-12-04)

### Features

- **AWS Lambda:**
  - Basic container image support ([#8572](https://github.com/serverless/serverless/issues/8572)) ([c0ea4c1](https://github.com/serverless/serverless/commit/c0ea4c14615f90e93baa1dfccfe5b309680b42b1)) ([Mariusz Nowak](https://github.com/medikoo))
  - Increase memory limits per changes on AWS side ([#8569](https://github.com/serverless/serverless/issues/8569)) ([c5ae979](https://github.com/serverless/serverless/commit/c5ae9798d2feca03cbcf2290661a08442c2f1c7d)) ([Piotr Grzesik](https://github.com/pgrzesik))

### Bug Fixes

- **AWS API Gateway:** Fix `integration` schema ([#8574](https://github.com/serverless/serverless/issues/8574)) ([09231c0](https://github.com/serverless/serverless/commit/09231c059abdbab1f9a6ac371b8dc6e0784e72da)) ([Mariusz Nowak](https://github.com/medikoo))

## [2.14.0](https://github.com/serverless/serverless/compare/v2.13.0...v2.14.0) (2020-12-01)

### Features

- **AWS SQS:** Support `maximumBatchingWindow` ([#8555](https://github.com/serverless/serverless/issues/8555)) ([ffde506](https://github.com/serverless/serverless/commit/ffde506db76b15a873e88aded7cfa32eb3382c6c)) ([Qi Xi](https://github.com/xiqi))

### Bug Fixes

- **AWS IAM:** Prevent function logs write access with disabled logging ([#8561](https://github.com/serverless/serverless/issues/8561)) ([ee18167](https://github.com/serverless/serverless/commit/ee1816772e4d3db8acda779f622904500d8072ec)) ([Ashish Sharma](https://github.com/as19ish))
- **Config Schema:** Fix configuration of common properties in `resources` ([#8553](https://github.com/serverless/serverless/issues/8553)) ([9399f2b](https://github.com/serverless/serverless/commit/9399f2b89c8a841d1d7d96a22a8de640d8214479)) ([Frédéric Barthelet](https://github.com/fredericbarthelet))

## [2.13.0](https://github.com/serverless/serverless/compare/v2.12.0...v2.13.0) (2020-11-25)

### Features

- **CLI:**
  - Conditional support for `.env` files ([#8413](https://github.com/serverless/serverless/issues/8413)) ([d1a22c8](https://github.com/serverless/serverless/commit/d1a22c85f2220a2f4691255fb3b9961aeaa4abcb)) ([Piotr Grzesik](https://github.com/pgrzesik))
  - Improve general `--help` and remove `--verbose` option ([#8532](https://github.com/serverless/serverless/issues/8532)) ([4287494](https://github.com/serverless/serverless/commit/42874946fc7ff92323d3ce5643415449122d2f38)) ([Vinod Tahelyani](https://github.com/vinod-tahelyani))

### Bug Fixes

- **AWS Deploy:** Improve S3 bucket policy security ([#8542](https://github.com/serverless/serverless/issues/8542)) ([2a9b57b](https://github.com/serverless/serverless/commit/2a9b57b62074d3e58f987aefb7888e14dfc35dce)) ([Ashish Sharma](https://github.com/as19ish))
- **Config Schema:**
  - Recognize API Gateway resource policy shorthands ([#8506](https://github.com/serverless/serverless/issues/8506)) ([b7901cd](https://github.com/serverless/serverless/commit/b7901cdb77cb2c81dee62cb614d39d5d2fc824ff)) ([Frédéric Barthelet](https://github.com/fredericbarthelet))
  - Recognize string format of `service` ([#8537](https://github.com/serverless/serverless/issues/8537)) ([6c6881c](https://github.com/serverless/serverless/commit/6c6881c853d9a42ed3c99f7c7acaa7cb98bd0a1b)) ([Frédéric Barthelet](https://github.com/fredericbarthelet))

### Templates

- **`aws-nodejs-typescript`:** Import type definitions from [`@serverless/typescript`](https://github.com/serverless/typescript/) project ([#8543](https://github.com/serverless/serverless/issues/8543)) ([fef389b](https://github.com/serverless/serverless/commit/fef389b770a3f09431aa761dc98da8cd384eec3f)) ([Frédéric Barthelet](https://github.com/fredericbarthelet))

### Maintenance Improvements

- Refactor some functions to native promises ([#8533](https://github.com/serverless/serverless/issues/8533)) ([06f6c6d](https://github.com/serverless/serverless/commit/06f6c6d28ee54055ae4a39686ce54e4738d9e8b0)) ([Graham McGregor](https://github.com/Graham42))

## [2.12.0](https://github.com/serverless/serverless/compare/v2.11.1...v2.12.0) (2020-11-20)

### Features

- **AWS HTTP API:** Support metrics ([#8510](https://github.com/serverless/serverless/issues/8510)) ([3feafbc](https://github.com/serverless/serverless/commit/3feafbceb5777904ea19aab1765c85935d5aa904)) ([Baptiste Guerin](https://github.com/BaptistG))8496

### Bug Fixes

- **Packaging:** Fix compatibility with npm v7.0 ([#8505](https://github.com/serverless/serverless/issues/8505)) ([fdd962b](https://github.com/serverless/serverless/commit/fdd962baa53a7471d33ad041e927c705051b343a)) ([Dmitry Gorbash](https://github.com/dgorbash))
- **AWS API Gateway:** Fix `usagePlan.throttle` handling ([#8472](https://github.com/serverless/serverless/issues/8472)) ([04e18cb](https://github.com/serverless/serverless/commit/04e18cbebf70ca6fd0534fcee5544de8f6569ed3)) ([andreizet](https://github.com/andreizet))
- **CLI:** Ensure to not fallback to Framework on components run error ([#8530](https://github.com/serverless/serverless/issues/8530)) ([15332c5](https://github.com/serverless/serverless/commit/15332c55525b91dc0ad11d903789581fb5104b64)) ([Mariusz Nowak](https://github.com/medikoo))

- **Templates:** Fix service rename ([#8508](https://github.com/serverless/serverless/issues/8508)) ([8c0d892](https://github.com/serverless/serverless/commit/8c0d89255e5f3bf2835966fde2f441b828607106)) ([Mariusz Nowak](https://github.com/medikoo))

### Templates

- **`aws-nodejs-typescript`:**
  - Upgrade ([#8496](https://github.com/serverless/serverless/issues/8496)) ([786809e](https://github.com/serverless/serverless/commit/786809e262b56490a78a923b0b031378badb18c0)) ([Chris Schuld](https://github.com/cbschuld))
  - Fix tooling options ([#8501](https://github.com/serverless/serverless/issues/8501)) ([cc103f1](https://github.com/serverless/serverless/commit/cc103f147eddcb29e38937326cc551473925e535)) ([David ALLIX](https://github.com/webda2l))
- **`aws-go-mod`:** Fix cleanup ([#8507](https://github.com/serverless/serverless/issues/8507)) ([2791c71](https://github.com/serverless/serverless/commit/2791c7142f795ddab7da1b8cbfa7588f9ae4896d)) ([Fukaya Temma](https://github.com/Pranc1ngPegasus))

### [2.11.1](https://github.com/serverless/serverless/compare/v2.11.0...v2.11.1) (2020-11-09)

### Bug Fixes

- **Config Schema:** Fix multiple event types support in `defineFunctionEventProperties` schema extension method ([#8486](https://github.com/serverless/serverless/issues/8486)) ([e32b771](https://github.com/serverless/serverless/commit/e32b7714253108f9078d2218e68c5994f20cde64)) ([Frédéric Barthelet](https://github.com/fredericbarthelet))

## [2.11.0](https://github.com/serverless/serverless/compare/v2.10.0...v2.11.0) (2020-11-06)

### Features

- **ConfigSchema:** `defineFuntionEventProperties` schema extension method ([#8471](https://github.com/serverless/serverless/issues/8471)) ([b5abfd8](https://github.com/serverless/serverless/commit/b5abfd8554a2641ca92c16db4cdd20c08be4001e)) ([Frédéric Barthelet](https://github.com/fredericbarthelet))
- Deprecate `service` object notation ([#8466](https://github.com/serverless/serverless/issues/8466)) ([c0a2ecf](https://github.com/serverless/serverless/commit/c0a2ecf453fa82d46bf2fda34708864bc440203d)) ([A. Singh](https://github.com/A-5ingh))
- **Analytics:**
  - Distinguish different standalone installations ([#8474](https://github.com/serverless/serverless/issues/8474)) ([5f81f58](https://github.com/serverless/serverless/commit/5f81f58b3af615205fb7b0d92c3828ad723a1595)) ([Mariusz Nowak](https://github.com/medikoo))
  - Report tabtab autocomplete installations ([#8474](https://github.com/serverless/serverless/issues/8474)) ([04b868f](https://github.com/serverless/serverless/commit/04b868fd3b143c27148e3e1cbbd901c2b19944e1)) ([Mariusz Nowak](https://github.com/medikoo))

### Bug Fixes

- Ensure to inspect configuration after it's fully resolved ([#8482](https://github.com/serverless/serverless/issues/8482)) ([f60fb55](https://github.com/serverless/serverless/commit/f60fb55a0b60603039d92d7467d0b231e247c819)) ([Mariusz Nowak](https://github.com/medikoo))
- **CLI:** Fix handling of command options in help display ([#8476](https://github.com/serverless/serverless/issues/8476)) ([2fffb16](https://github.com/serverless/serverless/commit/2fffb168bc7f957ed9e8e048fd08dfb9669e8eca)) ([Mariusz Nowak](https://github.com/medikoo))
- **Standalone:** Recognize Windows as non auto updatable platform ([#8474](https://github.com/serverless/serverless/issues/8474)) ([4fc29a5](https://github.com/serverless/serverless/commit/4fc29a57c4b675b2751c1e17d47e45904653f658)) ([Mariusz Nowak](https://github.com/medikoo))

## [2.10.0](https://github.com/serverless/serverless/compare/v2.9.0...v2.10.0) (2020-11-03)

### Features

- **Config Schema:**
  - Schema for AWS `s3` event ([#8330](https://github.com/serverless/serverless/issues/8330)) ([61d8ee9](https://github.com/serverless/serverless/commit/61d8ee9884cdee652fae131fed1e753301a351bf)) ([Oz Weiss](https://github.com/thewizarodofoz))
  - `defineFunctionProperties` schema extension method ([#8462](https://github.com/serverless/serverless/issues/8462)) ([5003bbf](https://github.com/serverless/serverless/commit/5003bbf983e7218c673a94a7042ca118aa0ae431)) ([Luis Helder](https://github.com/luislhl))

### Bug Fixes

- **Config Schema:**
  - Support empty string as environment variables ([#8468](https://github.com/serverless/serverless/issues/8468)) ([ff9db3e](https://github.com/serverless/serverless/commit/ff9db3e7bd0e4cd1261984e048373afc843eb053)) ([Mariusz Nowak](https://github.com/medikoo))
  - Ensure schema related config normalization is pursued also with validation turned off ([#8460](https://github.com/serverless/serverless/issues/8460)) ([df1b8a9](https://github.com/serverless/serverless/commit/df1b8a9433615c9c6efdff4dcef1f5477ea46d8a)) ([Mariusz Nowak](https://github.com/medikoo))
- Support log retention at custom resource lambda log groups ([#8456](https://github.com/serverless/serverless/issues/8456)) ([4ce9037](https://github.com/serverless/serverless/commit/4ce9037f8c8416715204f431af65767b3c48e1c7)) ([Filip Pýrek](https://github.com/FilipPyrek))
- **Analytics:** Ensure to send payload when having all meta ([#8467](https://github.com/serverless/serverless/issues/8467)) ([03859c0](https://github.com/serverless/serverless/commit/03859c04720f9071d0590b5d0ad1fa0e2c6770b3)) ([Mariusz Nowak](https://github.com/medikoo))

### Maintenance Improvements

- Remove `that = this` pattern ([#8463](https://github.com/serverless/serverless/issues/8463)) ([4ae192c](https://github.com/serverless/serverless/commit/4ae192cbfeb534d09af5b29ef7a1ed3f7700332f)) ([telenord](https://github.com/telenord))
- **Config Schema:**
  - Run schema validation only in service context (([#8460](https://github.com/serverless/serverless/issues/8460)) ([c271218](https://github.com/serverless/serverless/commit/c2712183a5dae0726c56456d8b3b790e7c597052)) ([Mariusz Nowak](https://github.com/medikoo))
  - Ensure config modifications happen after its validation ([#8460](https://github.com/serverless/serverless/issues/8460)) ([214768b](https://github.com/serverless/serverless/commit/214768b83ab14495be75ac87f221a31ffd60c88b)) ([Mariusz Nowak](https://github.com/medikoo))
- **AWS Alexa:** Ensure to log deprecation at initialization stage ([#8467](https://github.com/serverless/serverless/issues/8467)) ([a5a1a23](https://github.com/serverless/serverless/commit/a5a1a230a5714fc2859773077d57eba6d654af74)) ([Mariusz Nowak](https://github.com/medikoo))
- **AWS API Gateway:** Ensure to log deprecation at initialization stage ([#8467](https://github.com/serverless/serverless/issues/8467)) ([b6d033a](https://github.com/serverless/serverless/commit/b6d033a044e722f9cd0bd751c4067bf05aa50558)) ([Mariusz Nowak](https://github.com/medikoo))
- **AWS CloudFront:** Ensure to log deprecation at initialization stage ([#8467](https://github.com/serverless/serverless/issues/8467)) ([61f90a3](https://github.com/serverless/serverless/commit/61f90a362d33425dc10d4c5bd851132ec5779e8e)) ([Mariusz Nowak](https://github.com/medikoo))
- Ensure to log deprecation at initialization stage ([#8467](https://github.com/serverless/serverless/issues/8467)) ([1b26075](https://github.com/serverless/serverless/commit/1b26075fb51c71dd169c4800822842f614465388)) ([Mariusz Nowak](https://github.com/medikoo))

## [2.9.0](https://github.com/serverless/serverless/compare/v2.8.0...v2.9.0) (2020-10-29)

### Features

- Opt-in auto update feature for global (standalone and npm) installations. Turn on via `sls config --autoupdate` ([#8428](https://github.com/serverless/serverless/issues/8428)) ([e3f4546](https://github.com/serverless/serverless/commit/e3f454680e528e51a61f4e203b5ec72e8947f0b1)) ([Mariusz Nowak](https://github.com/medikoo))
- **AWS API Gateway:** Improve API Gateway API naming, deprecate `{stage}-{service}` format in favor of `{service}-{stage}` with suggestion to opt-in to new way ([#8339](https://github.com/serverless/serverless/issues/8339)) ([8566135](https://github.com/serverless/serverless/commit/85661353410d53a94c1d04f1a5c86f1fa456b3ff)) ([Fabian Schneider](https://github.com/fabsrc))
- **AWS CloudFront:** Switch from `ForwardedValues` to cache policies ([#8381](https://github.com/serverless/serverless/issues/8381)) ([479727e](https://github.com/serverless/serverless/commit/479727e1f4363cef1dd2fa1c20bdb9f7f8493838)) ([Frédéric Barthelet](https://github.com/fredericbarthelet))
- **AWS Deploy:** Update according to shifted CloudFormation limits ([#8433](https://github.com/serverless/serverless/issues/8433)) ([7e9b2ea](https://github.com/serverless/serverless/commit/7e9b2eac74cd9b720ac1aba4e01a31f06476165c)) ([Frédéric Barthelet](https://github.com/fredericbarthelet))
- **Analytics:**
  - Distinguish between npm and other global installation types ([#8428](https://github.com/serverless/serverless/issues/8428)) ([7cc898c](https://github.com/serverless/serverless/commit/7cc898cd0f8ed6cdb63664bed10ecfff74827084))([Mariusz Nowak](https://github.com/medikoo))
  - Report `isAutoUpdateEnabled` ([#8428](https://github.com/serverless/serverless/issues/8428)) ([48a3e11](https://github.com/serverless/serverless/commit/48a3e11f333c4e45a58f6810c1f3137fa953f2b8))([Mariusz Nowak](https://github.com/medikoo))

### Bug Fixes

- **AWS Deploy:** Fix handling of AWS SDK numeric error codes ([#8412](https://github.com/serverless/serverless/issues/8412)) ([6e62e1c](https://github.com/serverless/serverless/commit/6e62e1c5e8f66237e45e83d667e6b50bfb8ea753)) ([Ed Holland](https://github.com/edholland))
- **Config Schema:**
  - Ensure to validate `provider` as set in config file ([#8450](https://github.com/serverless/serverless/issues/8450)) ([b04ab55](https://github.com/serverless/serverless/commit/b04ab55fabd193b879244718ed87047ec961904c))([Mariusz Nowak](https://github.com/medikoo))
  - Fix IAM Policy resource reference schema ([#8453](https://github.com/serverless/serverless/issues/8453)) ([85f823c](https://github.com/serverless/serverless/commit/85f823cf46713b110d0f70892e6130315e1d3972))([Mariusz Nowak](https://github.com/medikoo))
- **Templates:** Ensure service is renamed also in eventual `package-lock.json` ([#8409](https://github.com/serverless/serverless/issues/8409)) ([78f159b](https://github.com/serverless/serverless/commit/78f159b4326f7eb092895bbd11813e470c146dc4)) ([Mark Tse](https://github.com/neverendingqs))

### Maintenance Improvements

- **Standalone:** Seclude standalone utils ([#8428](https://github.com/serverless/serverless/issues/8428)) ([5fcc54a](https://github.com/serverless/serverless/commit/5fcc54ae2aae9aea40d0fec8d42a86ebd21b5a76))([Mariusz Nowak](https://github.com/medikoo))
- **`blluebird` removal:**
  - Replace `BbPromise.props` with `Promise.all` ([#8414](https://github.com/serverless/serverless/issues/8414)) ([2d6824c](https://github.com/serverless/serverless/commit/2d6824cde531ba56758f441b39b5ab018702e866)) ([Piotr Grzesik](https://github.com/pgrzesik))

## [2.8.0](https://github.com/serverless/serverless/compare/v2.7.0...v2.8.0) (2020-10-16)

### Features

- **Config Schema:** Schema for `provider` props of AWS `http` event ([#8383](https://github.com/serverless/serverless/issues/8383)) ([e51e0f2](https://github.com/serverless/serverless/commit/e51e0f22da4625a65e5d7fd7bf3b4b1d5b46dd91)) ([Oz Weiss](https://github.com/thewizarodofoz))

### Bug Fixes

- **Config Schema:** Do not mark `layers[].path` as required ([#8398](https://github.com/serverless/serverless/issues/8398)) (([0394025](https://github.com/serverless/serverless/commit/03940254385e138eb40f2f25bd56fcdbee0c3a22)) ([Mariusz Nowak](https://github.com/medikoo))
- **Config Schema:** Fix AWS `stream` event `consumer` schema([#8405](https://github.com/serverless/serverless/issues/8405)) ([b0fe67d](https://github.com/serverless/serverless/commit/b0fe67d8466c97f0be045d87780e5e78f6611e7b)) ([Mariusz Nowak](https://github.com/medikoo))

### Maintenance Improvements

- **Config Schema:** Convert `oneOf` to more optimal `anyOf` ([#8405](https://github.com/serverless/serverless/issues/8405)) ([2c874e2](https://github.com/serverless/serverless/commit/2c874e22c97fe35290b14736df4b63097d3a9d50)) ([Mariusz Nowak](https://github.com/medikoo))

## [2.7.0](https://github.com/serverless/serverless/compare/v2.6.0...v2.7.0) (2020-10-13)

### Features

- **AWS Websocket:** Support CF intrinsic functions at `arn` ([#8335](https://github.com/serverless/serverless/issues/8335)) ([9303d8e](https://github.com/serverless/serverless/commit/9303d8ecd46059121082c3308e5fe5385e0be38e)) ([Raul Zaldana](https://github.com/zaldanaraul))
- **Config Schema:** Schema for AWS `functions[]` async invocation related properties([#8385](https://github.com/serverless/serverless/issues/8385)) ([719fa3a](https://github.com/serverless/serverless/commit/719fa3a3bf8e5d5dfa135a8225519fc77b719c8e)) ([Frédéric Barthelet](https://github.com/fredericbarthelet))
- **AWS Local Invocation:** Randomize `context.awsRequestId` ([#8380](https://github.com/serverless/serverless/issues/8380)) ([6a81137](https://github.com/serverless/serverless/commit/6a81137406fd2a2283663af93596ba79d23e38ef)) ([Frédéric Barthelet](https://github.com/fredericbarthelet))

### Bug Fixes

- **AWS Deploy:**
  - Fix resolution of CloudFormation error in stack monitoring logic ([#8388](https://github.com/serverless/serverless/issues/8388)) ([4579045](https://github.com/serverless/serverless/commit/4579045ed12ad0ad44c38df7e38f892ebbe5263d)) ([Mariusz Nowak](https://github.com/medikoo))
  - Ensure right handling for overriden (by plugin) `package.artifact` ([#8351](https://github.com/serverless/serverless/issues/8351)) ([661caad](https://github.com/serverless/serverless/commit/661caad22d4d1154aa197bbfc95948ae74bbc1aa)) ([Ryan Roemer](https://github.com/ryan-roemer))
- **AWS Stream:** Fix support for lambdas with provisioned concurrency ([#8342](https://github.com/serverless/serverless/issues/8342)) ([c382d86](https://github.com/serverless/serverless/commit/c382d869a84a5c7c84fd827eb815e0b881737c69)) ([Piotr Grzesik](https://github.com/pgrzesik))
- **AWS S3:** Fix handling of lambda removal permissions ([#8384](https://github.com/serverless/serverless/issues/8384)) ([c2d40ea](https://github.com/serverless/serverless/commit/c2d40ea63baa930dad31bf6950c25852ccd8adf4)) ([Oz Weiss](https://github.com/thewizarodofoz))
- **Config Schema:** Fix API Gateway authorizer schema ([#8389](https://github.com/serverless/serverless/issues/8389)) ([f166546](https://github.com/serverless/serverless/commit/f1665460d4bba7562ad88ecf7a471949bfd1baa4)) ([Mariusz Nowak](https://github.com/medikoo))
- **AWS Local Invocation:** Ensure `IS_LOCAL` env variable in docker ([#8372](https://github.com/serverless/serverless/issues/8372)) ([21babec](https://github.com/serverless/serverless/commit/21babec2ce5d56ecb7ddaad3e89387f6186cc52e)) ([Marek Piotrowski](https://github.com/marekpiotrowski))

## [2.6.0](https://github.com/serverless/serverless/compare/v2.5.0...v2.6.0) (2020-10-09)

### Features

- **Config Schema:** Schema for AWS `http` event ([#8301](https://github.com/serverless/serverless/issues/8301)) ([f235041](https://github.com/serverless/serverless/commit/f235041d0b94e21cf07e11c4b818f44670ff39ae)) ([Oz Weiss](https://github.com/thewizarodofoz))

### Bug Fixes

- **Config Schema:**
  - Revert invalid `oneOf` based validation ([#8376](https://github.com/serverless/serverless/issues/8376)) ([a9b28b6](https://github.com/serverless/serverless/commit/a9b28b6d7f703ce29e92d05fc129a2a3b5fbce2a)) ([Mariusz Nowak](https://github.com/medikoo))
  - Bring back non-array supported variants ([#8366](https://github.com/serverless/serverless/issues/8366)) ([244ae11](https://github.com/serverless/serverless/commit/244ae111c19d6e39b121ac387a38747823af6723)) ([Mariusz Nowak](https://github.com/medikoo))
- Ensure to preserve `undefined` valued service config properties as `undefined` after normalizing for schema ([#8374](https://github.com/serverless/serverless/issues/8374)) ([2e26e07](https://github.com/serverless/serverless/commit/2e26e07f921575dbb10c049eaa7a864867e696c6)) ([Mariusz Nowak](https://github.com/medikoo))

## [2.5.0](https://github.com/serverless/serverless/compare/v2.4.0...v2.5.0) (2020-10-07)

### Features

- **Config Schema:**
  - Schema for AWS `provider` properties ([#8297](https://github.com/serverless/serverless/issues/8297)) ([38c2047](https://github.com/serverless/serverless/commit/38c204762cbe16b00d102fa71409c3c8ba22220b)) ([Frédéric Barthelet](https://github.com/fredericbarthelet))
  - Schema for `layers` ([#8299](https://github.com/serverless/serverless/issues/8299)) ([4168dc1](https://github.com/serverless/serverless/commit/4168dc1f303148012f2027b6fbcbd686749a9357)) ([Oz Weiss](https://github.com/thewizarodofoz))
  - Schema for `provider.logs.restApi` ([#8309](https://github.com/serverless/serverless/issues/8309)) ([dd9a011](https://github.com/serverless/serverless/commit/dd9a011f6073d33db9043f102e0cce84743a8a6b)) ([Frédéric Barthelet](https://github.com/fredericbarthelet))
  - Recognize `Fn::Transport` at `resoures.Resources` ([#8337](https://github.com/serverless/serverless/issues/8337)) ([11a9d37](https://github.com/serverless/serverless/commit/11a9d37f6e89d203b1bced2a30c89d40e9aae041)) ([Raul Zaldana](https://github.com/zaldanaraul))
- Imply a safe primitives coercion on service configuration properties ([#8319](https://github.com/serverless/serverless/issues/8319)) ([6d1ee37](https://github.com/serverless/serverless/commit/6d1ee37004509ccb46737f2a87c6b74799de2cb7)) ([Mariusz Nowak](https://github.com/medikoo))
- Coerce service configuration primitive values to arrays, when array is expected ([#8319](https://github.com/serverless/serverless/issues/8319)) ([a6ff964](https://github.com/serverless/serverless/commit/a6ff964d84834985f485ae657e8fc5ecd6801958)) ([Mariusz Nowak](https://github.com/medikoo))
- **AWS Deploy:** Retry retryable SDK errors in custom resources ([#8338](https://github.com/serverless/serverless/issues/8338)) ([a3ebc01](https://github.com/serverless/serverless/commit/a3ebc01f2bcd6484cfd790bd576bc12962f1b2ff)) ([Pratik Prajapati](https://github.com/pratik-vii))

### Bug Fixes

- **Config Schema:**
  - Fix `cloudFront` event `behavior` schema ([#8308](https://github.com/serverless/serverless/issues/8308)) ([5b740f6](https://github.com/serverless/serverless/commit/5b740f6e1890b105e6aa7d931aed834dd30afb7e)) ([Johannes Edelstam](https://github.com/jede))
  - Fix `Fn::Join` delimiter length ([#8349](https://github.com/serverless/serverless/issues/8349)) ([faa1dce](https://github.com/serverless/serverless/commit/faa1dce9eef4384cda07c8553a0d972c06be0e2f)) ([Geoff Baskwill](https://github.com/glb))
  - Fix `provider.tags` schema ([#8314](https://github.com/serverless/serverless/issues/8314)) ([fc34140](https://github.com/serverless/serverless/commit/fc34140f4ec03958564a5868b339c40056f6b04e)) ([Noel Martin Llevares](https://github.com/dashmug))
  - Recognize `sns` event `displayName` property as optional ([#8323](https://github.com/serverless/serverless/issues/8323)) ([a020a4a](https://github.com/serverless/serverless/commit/a020a4a683f7c5ef3625fc52cb319300b9e302d2)) ([Frédéric Barthelet](https://github.com/fredericbarthelet))
- **Variables:**
  - Fix handling of circular object references ([#8343](https://github.com/serverless/serverless/issues/8343)) ([fd451ca](https://github.com/serverless/serverless/commit/fd451caf901f3bf69a872437643fa38d5eda8924)) ([Mariusz Nowak](https://github.com/medikoo))
  - Fix support for `${self:}` ([#8343](https://github.com/serverless/serverless/issues/8343)) ([ac34110](https://github.com/serverless/serverless/commit/ac3411085246c112db7aca7c5ea6354a0ab7bd08)) ([Mariusz Nowak](https://github.com/medikoo))
- **AWS API Gateway:** Fix resolution of request parameters `required` value ([#8329](https://github.com/serverless/serverless/issues/8329)) ([d2fb696](https://github.com/serverless/serverless/commit/d2fb696ebd25b1b99bd6043523e2c0051bfbac3d)) ([Oz Weiss](https://github.com/thewizarodofoz))
- **AWS Credentials:** Recognize AWS_DEFAULT_PROFILE env variable ([#8354](https://github.com/serverless/serverless/issues/8354)) ([261c16f](https://github.com/serverless/serverless/commit/261c16fc594baf6e7f1884304e722ca23e26286c)) ([Marek Piotrowski](https://github.com/marekpiotrowski))
- **AWS IAM:** Report missing `RoleName` on custom role ([#8219](https://github.com/serverless/serverless/issues/8219)) ([60cfa75](https://github.com/serverless/serverless/commit/60cfa75d6b5ce5b41b70739612d1f128abf05316)) ([David Wells](https://github.com/DavidWells))

## [2.4.0](https://github.com/serverless/serverless/compare/v2.3.0...v2.4.0) (2020-09-30)

### Features

- **Config Schema:**
  - Schema for AWS `alb` event ([#8291](https://github.com/serverless/serverless/issues/8291)) ([c96b429](https://github.com/serverless/serverless/commit/c96b429c6082f203e1cc06c2ae27a40a8a259bcd)) ([Oz Weiss](https://github.com/thewizarodofoz))
  - Schema for AWS `alexaSkill` event ([#8290](https://github.com/serverless/serverless/issues/8290)) ([7f47448](https://github.com/serverless/serverless/commit/7f474481b60c545f3855efc7857474c4277413e0)) ([Piotr Grzesik](https://github.com/pgrzesik))

### Bug Fixes

- **Config Schema:** Recognize deployment valid environment variables format ([#8307](https://github.com/serverless/serverless/issues/8307)) ([eb5e548](https://github.com/serverless/serverless/commit/eb5e54847e6e2f6b89a1b5325df4d8421efe479a)) ([Mariusz Nowak](https://github.com/medikoo))
- **AWS SQS:** Ensure to depend on provisioned alias if needed ([#8298](https://github.com/serverless/serverless/issues/8298)) ([8c4d972](https://github.com/serverless/serverless/commit/8c4d97211aa3dd4c41d9205a3ca0ccaab3564225)) ([Piotr Grzesik](https://github.com/pgrzesik))
- **AWS ALB:** Ensure to treat `provider.alb.authorizers` as optional ([#8295](https://github.com/serverless/serverless/issues/8295)) ([e990c09](https://github.com/serverless/serverless/commit/e990c09edb8fb711152485bed46dfefd827ac92d)) ([Mariusz Nowak](https://github.com/medikoo))

## [2.3.0](https://github.com/serverless/serverless/compare/v2.2.0...v2.3.0) (2020-09-25)

### Features

- **AWS MSK:** Support for MSK through `msk` event ([#8164](https://github.com/serverless/serverless/issues/8164)) ([05d703e](https://github.com/serverless/serverless/commit/05d703e6d5a7b100aaf6203209b0d596a3e70496)) ([Piotr Grzesik](https://github.com/pgrzesik))
- **Config Schema:** Schema for AWS `alexaSmartHome` event ([#8255](https://github.com/serverless/serverless/issues/8255)) ([bd5099e](https://github.com/serverless/serverless/commit/bd5099e15019352ab5ae9b2cd5519eaff50c520e)) ([Oz Weiss](https://github.com/thewizarodofoz))
- Deprecate `awsKmsKeyArn` in favor of `kmsKeyArn` ([#8277](https://github.com/serverless/serverless/issues/8277)) ([a55009e](https://github.com/serverless/serverless/commit/a55009e221de91fee46a343483eb31539352410b)) ([Frédéric Barthelet](https://github.com/fredericbarthelet))

### Bug Fixes

- **AWS Lambda:** Address issues in version hash generation logic, ensure any layer changes influence change of hash ([#8066](https://github.com/serverless/serverless/issues/8066)) ([e43c889](https://github.com/serverless/serverless/commit/e43c889647f45bc93cf3cb1fd45d4a18ad95da58)) ([Patrick Withams](https://github.com/pwithams))
- **Config Schema:** Recognize CF intrinsic functions in vpc config ([#8283](https://github.com/serverless/serverless/issues/8283)) ([e75e998](https://github.com/serverless/serverless/commit/e75e998e9238c8d59653ec2533c9fb7c3f0e546a)) ([Devon Powell](https://github.com/devpow112))
- **Variables:** Ensure no collisions with AWS CloudFormation variables ([#8279](https://github.com/serverless/serverless/issues/8279)) ([2fdeb51](https://github.com/serverless/serverless/commit/2fdeb51174d8fa55cc2704e8e84297471eadec39)) ([Matthieu Napoli](https://github.com/mnapoli))

### Maintenance Improvements

- **`lodash` replacement:**
  - Replace `_.forEach` with `Object.entries().forEach` ([#8280](https://github.com/serverless/serverless/issues/8280)) ([76e02cc](https://github.com/serverless/serverless/commit/76e02cc09c74e18abdc1fccbda81676cf2462598)) ([Piotr Grzesik](https://github.com/pgrzesik))
  - Replace `_.forOwn` with `Object.entries().forEach` ([#8284](https://github.com/serverless/serverless/issues/8284)) ([56c7e44](https://github.com/serverless/serverless/commit/56c7e443a0350027cd5ccf5d4c94dc06f353306f)) ([Piotr Grzesik](https://github.com/pgrzesik))
- **Print:** Read provider values from provider ([#8281](https://github.com/serverless/serverless/issues/8281)) ([b53716a](https://github.com/serverless/serverless/commit/b53716a64c9dacb411690b8b8496adfc8c194ca1)) ([Mariusz Nowak](https://github.com/medikoo))

## [2.2.0](https://github.com/serverless/serverless/compare/v2.1.1...v2.2.0) (2020-09-23)

### Features

- **Config Schema:**
  - Schema for AWS `sqs` event ([#8227](https://github.com/serverless/serverless/issues/8227)) ([4f96ce1](https://github.com/serverless/serverless/commit/4f96ce1042079c08578ef70ddbb4c2def32d6663)) ([Oz Weiss](https://github.com/thewizarodofoz))
  - Schema for `functions[]` properties ([#8222](https://github.com/serverless/serverless/issues/8222)) ([feece9a](https://github.com/serverless/serverless/commit/feece9a2ec5be0f49af7147b84bed76e9ba50155)) ([Frédéric Barthelet](https://github.com/fredericbarthelet))
  - Schema for AWS `cloudfront` event ([#8250](https://github.com/serverless/serverless/issues/8250)) ([8943693](https://github.com/serverless/serverless/commit/8943693c33359749d6685d867c01151cfd8000cf)) ([Oz Weiss](https://github.com/thewizarodofoz))
  - Schema for AWS `cloudwatchLog` event ([#8228](https://github.com/serverless/serverless/issues/8228)) ([42676d3](https://github.com/serverless/serverless/commit/42676d34d4cb33cb59fd54c6a78ed07c965146e5)) ([Oz Weiss](https://github.com/thewizarodofoz))
  - Schema for AWS `websocket` event ([#8218](https://github.com/serverless/serverless/issues/8218)) ([e1ca63c](https://github.com/serverless/serverless/commit/e1ca63c06a824e18fdd92f5c6c3efbf7f5f644d2)) ([Raul Zaldana](https://github.com/zaldanaraul))
- **AWS Lambda:** Support CF intrinsic functions in `fileSystemConfig.arn` ([#8265](https://github.com/serverless/serverless/issues/8265)) ([4bf6543](https://github.com/serverless/serverless/commit/4bf654376f9820efbd78876c72dad95d4cc52831)) ([Piotr Grzesik](https://github.com/pgrzesik))
- Deprecate an attempt to extend nonexistent resources ([#8266](https://github.com/serverless/serverless/issues/8266)) ([0ced414](https://github.com/serverless/serverless/commit/0ced414174c8acf7dd70dd9b5e4b7a525cd8320e)) ([Piotr Grzesik](https://github.com/pgrzesik))

### Bug Fixes

- **AWS Lambda:** Recognize function-wide settings for version hashing ([#8212](https://github.com/serverless/serverless/issues/8212)) ([1fceb89](https://github.com/serverless/serverless/commit/1fceb898d0ea10b00bc6759a5204065c81b560e8)) ([Oz Weiss](https://github.com/thewizarodofoz))
- **AWS Local Invocation:** Fix Dockerfile layer path on Windows ([#8273](https://github.com/serverless/serverless/issues/8273)) ([0164327](https://github.com/serverless/serverless/commit/01643273df742239cd020e7d08941c505e540217)) ([Gábor Lipták](https://github.com/gliptak))
- **AWS SNS:** Fix setup of redrive policy ([#8268](https://github.com/serverless/serverless/issues/8268)) ([3e9e6aa](https://github.com/serverless/serverless/commit/3e9e6aacc675cd7bf92499b9494a15ff9b21981b)) ([5up3r20e](https://github.com/5up3r20e))
- **Config Schema:**
  - Recognize enhanced object syntax for plugins ([#8259](https://github.com/serverless/serverless/issues/8259)) ([4b86fa5](https://github.com/serverless/serverless/commit/4b86fa5759a4b52771bb69d3ea50762b87583765)) ([jimjenkins5](https://github.com/jimjenkins5))
  - Treat explicit `null` or `undefined` as no value ([#8272](https://github.com/serverless/serverless/issues/8272)) ([e5e42ba](https://github.com/serverless/serverless/commit/e5e42bab8cec9c508e465ee259ec75aff183168c)) ([Mariusz Nowak](https://github.com/medikoo))

### Maintenance Improvements

- **`lodash` replacement:**
  - Replace `_.{entries|entriesIn|toPairs}` with `Object.entries` ([#8275](https://github.com/serverless/serverless/issues/8275)) ([b867df1](https://github.com/serverless/serverless/commit/b867df147aea5e1f57a9d275e2a389efbbcf38aa)) ([Piotr Grzesik](https://github.com/pgrzesik))
  - Replace `_.values` with `Object.values` ([#8274](https://github.com/serverless/serverless/issues/8274)) ([57d1ce1](https://github.com/serverless/serverless/commit/57d1ce1a660a0446c77e9bafb174ae3fe0263516)) ([Piotr Grzesik](https://github.com/pgrzesik))
- **Dependencies:**
  - Upgrade "@serverless/utils" to v2 ([#8278](https://github.com/serverless/serverless/issues/8278)) ([ef39e95](https://github.com/serverless/serverless/commit/ef39e958db39b367875af871a7014b4d284f5554)) ([Mariusz Nowak](https://github.com/medikoo))

### [2.1.1](https://github.com/serverless/serverless/compare/v2.1.0...v2.1.1) (2020-09-17)

### Maintenance Improvements

- Ensure to rely on `@serverless/enterprise-plugin` ^4.0.4

## [2.1.0](https://github.com/serverless/serverless/compare/v2.0.0...v2.1.0) (2020-09-16)

### Features

- **Config Schema:**
  - Schema for AWS `cloudwatch` event ([#8230](https://github.com/serverless/serverless/issues/8230)) ([3730fd4](https://github.com/serverless/serverless/commit/3730fd4fd1ca3610415968e4633a0cba275b2e43)) ([Oz Weiss](https://github.com/thewizarodofoz))
  - Schema for AWS `stream` event ([#8201](https://github.com/serverless/serverless/issues/8201)) ([1fb338b](https://github.com/serverless/serverless/commit/1fb338b184ed770bc5d8d162bf5c54336f3d2ddd)) ([Frédéric Barthelet](https://github.com/fredericbarthelet))

### Bug Fixes

- **Config Schema:**
  - Fix CF template extension `Transform`schema ([#8229](https://github.com/serverless/serverless/issues/8229)) ([6961b62](https://github.com/serverless/serverless/commit/6961b629e72aada33ff5a3a12f1a04f686b58329)) ([Michael Wolfenden](https://github.com/michael-wolfenden))
  - Recognize string value at DependsOn ([#8233](https://github.com/serverless/serverless/issues/8233)) ([4c36753](https://github.com/serverless/serverless/commit/4c367535074f7b82799ed4bd16cd5fcdef445eb5)) ([Mariusz Nowak](https://github.com/medikoo))
  - Support `Condition` attribute in `resources.extensions` ([#8217](https://github.com/serverless/serverless/issues/8217)) ([16bae33](https://github.com/serverless/serverless/commit/16bae337448e23484dc10262d9a6be845eb1818a)) ([Geoff Baskwill](https://github.com/glb))
- **CLI:** Workaround config schema error on project initialization ([#8258](https://github.com/serverless/serverless/issues/8258)) ([738c52f](https://github.com/serverless/serverless/commit/738c52f6e544bbf9ae130eac99e676bd22fa29e2)) ([Mariusz Nowak](https://github.com/medikoo))
- Ensure to memoize config file resolution by instance ([#8231](https://github.com/serverless/serverless/issues/8231)) ([3177e40](https://github.com/serverless/serverless/commit/3177e40cee1d91a5b054dd47cdb6f540436cc507)) ([Mariusz Nowak](https://github.com/medikoo))

### Maintenance Improvements

- **Dependencies:**
  - Switch to `fastest-levenshtein` ([#8238](https://github.com/serverless/serverless/issues/8238)) ([0cd9cca](https://github.com/serverless/serverless/commit/0cd9ccaf65a13d01c9e26c9950a6e4dc4a5a53f7)) ([Mariusz Nowak](https://github.com/medikoo))
  - Register `semver-regex` as dev dependency ([#8245](https://github.com/serverless/serverless/issues/8245)) ([4c46663](https://github.com/serverless/serverless/commit/4c4666327e31d0267fff6cd98667c92d7e654422)) ([Mariusz Nowak](https://github.com/medikoo))
  - **Upgrade:**
    - `archiver` to v5 ([#8235](https://github.com/serverless/serverless/issues/8235)) ([389e3eb](https://github.com/serverless/serverless/commit/389e3eb5fba81177c36d5ee83f39802403b90653)) ([Mariusz Nowak](https://github.com/medikoo))
    - `chalk` to v4 ([#8236](https://github.com/serverless/serverless/issues/8236)) ([26628ff](https://github.com/serverless/serverless/commit/26628ff43588b06e6919a1b8f426129d0c7dcea7)) ([Mariusz Nowak](https://github.com/medikoo))
    - `download` to v8 ([#8237](https://github.com/serverless/serverless/issues/8237)) ([5931c7c](https://github.com/serverless/serverless/commit/5931c7cb3df9a0f16208de422b573da9bca46030)) ([Mariusz Nowak](https://github.com/medikoo))
    - `filesize` to v6 ([#8239](https://github.com/serverless/serverless/issues/8239)) ([5616603](https://github.com/serverless/serverless/commit/5616603ba8d38581e1e24312e4ec908212e01f33)) ([Mariusz Nowak](https://github.com/medikoo))
    - `fs-extra` to v9 ([#8240](https://github.com/serverless/serverless/issues/8240)) ([370c097](https://github.com/serverless/serverless/commit/370c09766d4de37bfe8b473843106440881d1554)) ([Mariusz Nowak](https://github.com/medikoo))
    - `get-stdin` to v8 ([#8241](https://github.com/serverless/serverless/issues/8241)) ([372ce54](https://github.com/serverless/serverless/commit/372ce541cdd7d93bba4eaef44ca596b373740e7a)) ([Mariusz Nowak](https://github.com/medikoo))
    - `is-docker` to v2 ([#8242](https://github.com/serverless/serverless/issues/8242)) ([0c78259](https://github.com/serverless/serverless/commit/0c782599fd49d7dd521ee3282fd65ded9b0803fd)) ([Mariusz Nowak](https://github.com/medikoo))
    - `p-limit` to v3 ([#8243](https://github.com/serverless/serverless/issues/8243)) ([e136d8b](https://github.com/serverless/serverless/commit/e136d8bfd4d299a4faa31cf33dd804d3cc1096bc)) ([Mariusz Nowak](https://github.com/medikoo))
    - `semver` to v7 ([#8244](https://github.com/serverless/serverless/issues/8244)) ([c6c3804](https://github.com/serverless/serverless/commit/c6c38048071fc40c67fb57ff7dadb6cf06c97fd7)) ([Mariusz Nowak](https://github.com/medikoo))
    - `untildify` to v4 ([#8246](https://github.com/serverless/serverless/issues/8246)) ([282b9be](https://github.com/serverless/serverless/commit/282b9bee6028f4fd6417241d59afa8f69061268d)) ([Mariusz Nowak](https://github.com/medikoo))
    - `yargs-parser` to v20 ([#8248](https://github.com/serverless/serverless/issues/8248)) ([ce51c8f](https://github.com/serverless/serverless/commit/ce51c8fb6fea254affd51361b6a1cf551b5d8a36)) ([Mariusz Nowak](https://github.com/medikoo))
    - `uuid` to v8 ([#8234](https://github.com/serverless/serverless/issues/8234)) ([b40b11b](https://github.com/serverless/serverless/commit/b40b11b4e2cdaae3cc4923ee9e74e6fa7912b668)) ([Mariusz Nowak](https://github.com/medikoo))
  - **Remove not used:**
    - `cli-progress-footer` ([#8247](https://github.com/serverless/serverless/issues/8247)) ([08cb86a](https://github.com/serverless/serverless/commit/08cb86afe988058cd588cda36f44699bce1a968c)) ([Mariusz Nowak](https://github.com/medikoo))
    - `jwt-decode` ([#8247](https://github.com/serverless/serverless/issues/8247)) ([f38c7c5](https://github.com/serverless/serverless/commit/f38c7c5a9ecac649da3b9ab5338077df08e30d28)) ([Mariusz Nowak](https://github.com/medikoo))
    - `mocha-lcov-reporter` ([#8247](https://github.com/serverless/serverless/issues/8247)) ([822adbd](https://github.com/serverless/serverless/commit/822adbd2a03cbf0d2fd30222d0372cf28c95c467)) ([Mariusz Nowak](https://github.com/medikoo))
    - `rc` dependency ([#8247](https://github.com/serverless/serverless/issues/8247)) ([4f6e354](https://github.com/serverless/serverless/commit/4f6e35431dd31c48a1a86ebd543e8e1934150201)) ([Mariusz Nowak](https://github.com/medikoo))
    - `write-file-atomic` ([#8247](https://github.com/serverless/serverless/issues/8247)) ([c375120](https://github.com/serverless/serverless/commit/c375120285a3d13144d1cbcd7d11160f2f94c8c4)) ([Mariusz Nowak](https://github.com/medikoo))

## [2.0.0](https://github.com/serverless/serverless/compare/v1.83.0...v2.0.0) (2020-09-10)

### ⚠ BREAKING CHANGES

- Node.js version 10 or later is required (dropped support for v6 and v8)
- **CLI:**
  - Locally installed (in service `node_modules`) CLI will be run instead of global one, when globally installed `serverless` CLI is invoked in a context of a service, which has locally installed `serverless`.
  - `slss` alias for `serverless` CLI command was removed. Rely on `sls` or `serverless` instead
  - `bin/serverless` was removed. If you target CLI script directly, point `bin/serverless.js` instead
- **AWS HTTP API:**
  - Default `payload` was changed from `1.0` to `2.0`
  - `timeout` setting as configured directly for `httpApi` event is no longer supported. Timeout value is now unconditionally resolved from function timeout setting (it's to guarantee that configured endpoint has necessary room to process function invocation)
- **AWS ALB:** Support for `providers.alb.authorizers[].allowUnauthenticated` setting was removed. Rely on `providers.alb.authorizers[].onUnauthenticatedRequest` instead

### Features

- **CLI:** Fallback to service local `serverless` installation by default ([#8180](https://github.com/serverless/serverless/issues/8180)) ([dfc7839](https://github.com/serverless/serverless/commit/dfc78396c7c555887163c5f3f60361568eebbfa4)) ([Mariusz Nowak](https://github.com/medikoo))
- **AWS HTTP API:** Switch default payload mode to 2.0 ([#8133](https://github.com/serverless/serverless/issues/8133)) ([1596738](https://github.com/serverless/serverless/commit/1596738cf919bfb5ed702c40f9d3f2b39d529a81)) ([andreizet](https://github.com/andreizet))

### Bug Fixes

- **Packaging:** Fix resolution of files with `.` In their names ([#8130](https://github.com/serverless/serverless/issues/8130)) ([c620af3](https://github.com/serverless/serverless/commit/c620af3cd6eb930e39a02aa4537f748854d0f12a)) ([Christian Musa](https://github.com/crash7))

### Maintenance Improvements

- Drop support for Node.js versions below v10 ([#8131](https://github.com/serverless/serverless/issues/8131)) ([69dd4b9](https://github.com/serverless/serverless/commit/69dd4b97453a7ca34b541313d1063a1e0c1c7876)) ([Mariusz Nowak](https://github.com/medikoo))
- **CLI:**
  - Remove `slss`, `serverless` command alias ([#8161](https://github.com/serverless/serverless/issues/8161)) ([33eef9f](https://github.com/serverless/serverless/commit/33eef9f06b83b889baaa28cab1eaece275790a52)) ([Christian Musa](https://github.com/crash7))
  - Remove deprecated `bin/serverless` file ([#8142](https://github.com/serverless/serverless/issues/8142)) ([4ceaca0](https://github.com/serverless/serverless/commit/4ceaca022a6292b56239a35933499a63ae242479)) ([Piotr Grzesik](https://github.com/pgrzesik))
- **AWS Lambda:** Remove support for async config on destination ([#8138](https://github.com/serverless/serverless/issues/8138)) ([e131f26](https://github.com/serverless/serverless/commit/e131f2661d9a508505ddf8599fb9ac6876c8ef15)) ([Piotr Grzesik](https://github.com/pgrzesik))
- **AWS ALB:** Remove support for `authorizers[].allowUnauthenticated` ([#8160](https://github.com/serverless/serverless/issues/8160)) ([7c304df](https://github.com/serverless/serverless/commit/7c304df5ffcaaf1dbbd90ccf714f55f4a6cc6a0b)) ([morgan-sam](https://github.com/morgan-sam))
- **AWS HTTP API:** Drop support for `timeout` setting ([#8184](https://github.com/serverless/serverless/issues/8184)) ([1cfd1f2](https://github.com/serverless/serverless/commit/1cfd1f25a278679d94e4cd30baf1b2092ff83d8a)) ([Mariusz Nowak](https://github.com/medikoo))
- Replace `mkdrip` with `esnureDir` from `fs-extra` ([#8183](https://github.com/serverless/serverless/issues/8183)) ([1beb8d0](https://github.com/serverless/serverless/commit/1beb8d0246e705d3d724dbd2fb4c6639bc961cba)) ([Mariusz Nowak](https://github.com/medikoo))

## [1.83.3](https://github.com/serverless/serverless/compare/v1.83.2...v1.83.3) (2021-03-23)

### Maintenance Improvements

- Backport `analyticsUrl` from `@serverless/utils@4.0.0` ([#9162](https://github.com/serverless/serverless/pull/9162)) ([a1f6538](https://github.com/serverless/serverless/commit/a1f6538eb5207669ac108fe8e6cf8d12c6e90f20)) ([Piotr Grzesik](https://github.com/pgrzesik))
- Enrich analytics payload with missing properties ([#9162](https://github.com/serverless/serverless/pull/9162)) ([a7b9498](https://github.com/serverless/serverless/commit/a7b9498a94e1130678b2f7c7ee8d8676cecd1521)) ([Piotr Grzesik](https://github.com/pgrzesik))

### [1.83.2](https://github.com/serverless/serverless/compare/v1.83.1...v1.83.2) (2020-11-06)

### Bug Fixes

- **AWS HTTP API:** Ensure to report deprecation at initialization phase ([#8483](https://github.com/serverless/serverless/issues/8469)) ([61a72c6](https://github.com/serverless/serverless/commit/61a72c69ed488bd8ae10819ff12b7a2f5679b8e3)) ([Mariusz Nowak](https://github.com/medikoo))
- Ensure to inspect configuration once it's fully resolved ([#8483](https://github.com/serverless/serverless/issues/8469)) ([1ea4719](https://github.com/serverless/serverless/commit/1ea47193db3f51a33ecf25ae3ba0aa973530644a)) ([Mariusz Nowak](https://github.com/medikoo))

## [1.83.1](https://github.com/serverless/serverless/compare/v1.83.0...v1.83.1) (2020-11-03)

### Bug Fixes

- **Analytics:** Ensure to send payload when having all meta ([#8469](https://github.com/serverless/serverless/issues/8469)) ([78dce94](https://github.com/serverless/serverless/commit/78dce94571a05d0021d58352bd21b80f90c62883)) ([Mariusz Nowak](https://github.com/medikoo))

### Maintanance Improvements

- **AWS Lambda:** Ensure to log deprecation at initialization stage ([#8469](https://github.com/serverless/serverless/issues/8469)) ([2e3ce12](https://github.com/serverless/serverless/commit/2e3ce128b0e55abf42e9d07cb96af82f3194d60c)) ([Mariusz Nowak](https://github.com/medikoo))
- **AWS ALB:** Ensure to log deprecation at initialization stage ([#8469](https://github.com/serverless/serverless/issues/8469)) ([3cf6449](https://github.com/serverless/serverless/commit/3cf6449b78604434a0292513420d2b90faef37ef)) ([Mariusz Nowak](https://github.com/medikoo))
- **AWS HTTP API:** Ensure to log deprecation at initialization stage ([#8469](https://github.com/serverless/serverless/issues/8469)) ([ecd3084](https://github.com/serverless/serverless/commit/ecd30844fc7a748d0ac56679636741c009b2c630)) ([Mariusz Nowak](https://github.com/medikoo))
- **Standalone:** Support non-latest version builds ([#8469](https://github.com/serverless/serverless/issues/8469)) ([8727044](https://github.com/serverless/serverless/commit/8727044b959ed1bb989d97f7fa178e8dcf36b5a0)) ([Mariusz Nowak](https://github.com/medikoo))

## [1.83.0](https://github.com/serverless/serverless/compare/v1.82.0...v1.83.0) (2020-09-10)

### Features

- **Config Schema:**
  - Schema for AWS `resources` section ([#8139](https://github.com/serverless/serverless/issues/8139)) ([00d6f79](https://github.com/serverless/serverless/commit/00d6f79c5022fd1bf1537d4095769916369d30ea)) ([Geoff Baskwill](https://github.com/glb))
  - Schema for AWS `schedule` event ([#8143](https://github.com/serverless/serverless/issues/8143)) ([d9b91e9](https://github.com/serverless/serverless/commit/d9b91e97fb81b6f19c9f95920b509d623bdca37d)) ([Andy Duncan](https://github.com/andyjduncan))
- **AWS Local Invocation:** Resolve CF Ref in env variables ([#8198](https://github.com/serverless/serverless/issues/8198)) ([72745c9](https://github.com/serverless/serverless/commit/72745c9e77476f65604fdc68e8e3c55feffdf90f)) ([Frédéric Barthelet](https://github.com/fredericbarthelet))
- **AWS HTTP API:** Recognize support for CF instructions in authorizers ([#8200](https://github.com/serverless/serverless/issues/8200)) ([428fc79](https://github.com/serverless/serverless/commit/428fc796c178fc5fcb7478d048ba0b2251ab78e9)) ([Frédéric Barthelet](https://github.com/fredericbarthelet))

### Bug Fixes

- **AWS API Gateway:** Fix model resource name generator ([#8204](https://github.com/serverless/serverless/issues/8204)) ([f727631](https://github.com/serverless/serverless/commit/f7276311008134f57f24d85d2b16730c9ab75574)) ([Cole Mujadzic](https://github.com/colemujadzic))
- **AWS Stream:** Fix support for `batchWindow: 0` ([#8202](https://github.com/serverless/serverless/issues/8202)) ([b0547e6](https://github.com/serverless/serverless/commit/b0547e6e1a673eff956f417110ce6bf40fc32f92)) ([Mariusz Nowak](https://github.com/medikoo))
- **Templates:** Add missing property in ruby template ([#8195](https://github.com/serverless/serverless/issues/8195)) ([8f070d5](https://github.com/serverless/serverless/commit/8f070d58c46e7c1d5cbe34b31a34387eaccea505)) ([jkburges](https://github.com/jkburges))

### Maintenance Improvements

- **Config Schema:**
  - Move docs to dedicated website page ([#8207](https://github.com/serverless/serverless/issues/8207)) ([c370295](https://github.com/serverless/serverless/commit/c370295be6a67c5a7c5e2af323b29588cbc1d02e)) ([Mariusz Nowak](https://github.com/medikoo))
  - Unified warning log color scheme ([#8207](https://github.com/serverless/serverless/issues/8207)) ([2c19bf5](https://github.com/serverless/serverless/commit/2c19bf5eaea876f38cf0fd6fb8c453fbfe8d416a)) ([Mariusz Nowak](https://github.com/medikoo))

## [1.82.0](https://github.com/serverless/serverless/compare/v1.81.1...v1.82.0) (2020-09-04)

### Features

- **Config Schema:** Schema for AWS `iot` event ([#8177](https://github.com/serverless/serverless/issues/8177)) ([e55fc36](https://github.com/serverless/serverless/commit/e55fc36e1a3e78d155cbaaa5517c99ecc74a113f)) ([Piotr Grzesik](https://github.com/pgrzesik))
- **Analytics:** Recognize and report four different installation types ([#8188](https://github.com/serverless/serverless/issues/8188)) ([f9e955c](https://github.com/serverless/serverless/commit/f9e955c8f8ae9c1f8d8f883a052f91d57a7ffa4a)) ([Mariusz Nowak](https://github.com/medikoo))

### Maintenance Improvements

- Remove `update-notifier` notifications (as those are now covered by more accurate backend notifications, which also support notifications for multiple majors) ([#8185](https://github.com/serverless/serverless/issues/8185)) ([11fb888](https://github.com/serverless/serverless/commit/11fb8889c8744180919eb3cfae85269a7ff3649f)) ([Mariusz Nowak](https://github.com/medikoo))
- Prevent _is locally installed_ detection on confirmed local installations ([#8188](https://github.com/serverless/serverless/issues/8188)) ([7accad6](https://github.com/serverless/serverless/commit/7accad6eb9ad1d9549c2e0e5c55e11b3f827af6a)) ([Mariusz Nowak](https://github.com/medikoo))

### [1.81.1](https://github.com/serverless/serverless/compare/v1.81.0...v1.81.1) (2020-09-02)

### Bug Fixes

- Revert from `frameworkVersion` requirement plan ([#8178](https://github.com/serverless/serverless/issues/8178)) ([6dd0596](https://github.com/serverless/serverless/commit/6dd0596286666b242b921847ffdeb6628baf3b26)) ([Mariusz Nowak](https://github.com/medikoo))

## [1.81.0](https://github.com/serverless/serverless/compare/v1.80.0...v1.81.0) (2020-09-02)

### Features

- **CLI:**
  - Optionally fallback to local installation of `serverless` ([#8158](https://github.com/serverless/serverless/issues/8158)) ([9fb62f1](https://github.com/serverless/serverless/commit/9fb62f1138fc36e035993740496336af314171aa)) ([Mariusz Nowak](https://github.com/medikoo))
  - Announce `frameworkVersion` requirement ([#8158](https://github.com/serverless/serverless/issues/8158)) ([9f7f9d3](https://github.com/serverless/serverless/commit/9f7f9d398339d9c8ba09ae3b74d3e7bbbca4dcee)) ([Mariusz Nowak](https://github.com/medikoo))
  - Deprecate `slss` CLI alias ([#8156](https://github.com/serverless/serverless/issues/8156)) ([a2d1031](https://github.com/serverless/serverless/commit/a2d1031fb88ac750685b5940b60c0b241c90e319)) ([Christian Musa](https://github.com/crash7))
- **Config Schema:** Schema for AWS `sns` event ([#8112](https://github.com/serverless/serverless/issues/8112)) ([87fd3c1](https://github.com/serverless/serverless/commit/87fd3c17fb7d975b37c952293480bdc5ea4a8226)) ([Frédéric Barthelet](https://github.com/fredericbarthelet))
- **AWS Local Invocation:** Resolve `Fn::ImportValue` instructions in env vars ([#8157](https://github.com/serverless/serverless/issues/8157)) ([06ed01b](https://github.com/serverless/serverless/commit/06ed01b8742260c01411d5e371ab56a6c02219f6)) ([Frédéric Barthelet](https://github.com/fredericbarthelet))
- **AWS API Gateway:** Allow to opt-out from default request templates ([#8159](https://github.com/serverless/serverless/issues/8159)) ([7aad819](https://github.com/serverless/serverless/commit/7aad8193787f591cd3186b2f86e0f9bec23f4dcf)) ([Joaquín Ormaechea](https://github.com/jormaechea))
- **AWS HTTP API:** Support CF functions at `httpApi.authorizer.id` ([#8171](https://github.com/serverless/serverless/issues/8171)) ([453b802](https://github.com/serverless/serverless/commit/453b8026409e5fdd107fc9cefb7da8ec4b1e8f14)) ([Frédéric Barthelet](https://github.com/fredericbarthelet))
- **Templates:**
  - Ensure `frameworkVersion` in all templates ([#8175](https://github.com/serverless/serverless/issues/8175)) ([3089abc](https://github.com/serverless/serverless/commit/3089abc5c48335375ed8f9a67814e3b4cf82f53d)) ([Mariusz Nowak](https://github.com/medikoo))
  - Upgrade `google-nodejs` template ([#8152](https://github.com/serverless/serverless/issues/8152)) ([40fb8ae](https://github.com/serverless/serverless/commit/40fb8ae1123b4f898ff008602242d5b5bba24b6b)) ([Viacheslav Dobromyslov](https://github.com/dobromyslov))
- **Standalone:** Prevent accidental upgrades to a new major ([#8136](https://github.com/serverless/serverless/issues/8136)) ([56aa5aa](https://github.com/serverless/serverless/commit/56aa5aa15abed64db6758aecd8c27719928b5a14)) ([Mariusz Nowak](https://github.com/medikoo))
- **Analytics:**
  - Introduce `isLocallyInstalled` characteristics ([#8158](https://github.com/serverless/serverless/issues/8158)) ([246e4a6](https://github.com/serverless/serverless/commit/246e4a6756571e00f84b0f0567a305be402d5512)) ([Mariusz Nowak](https://github.com/medikoo))
  - Send info on reported deprecations ([#8136](https://github.com/serverless/serverless/issues/8136)) ([83c4b16](https://github.com/serverless/serverless/commit/83c4b167ee69d4bbd1933e415319a40a27b11daa)) ([Mariusz Nowak](https://github.com/medikoo))

### Bug Fixes

- **Packaging:** Ensure to include eventual `aws-sdk` dependency if installed ([#8145](https://github.com/serverless/serverless/issues/8145)) ([2561ae8](https://github.com/serverless/serverless/commit/2561ae800e04dd197302d5692cf6eab72185cc11)) ([Mariusz Nowak](https://github.com/medikoo))
- **Templates:** Rename folder `vscode` to `.vscode` ([#8168](https://github.com/serverless/serverless/issues/8168)) ([f308382](https://github.com/serverless/serverless/commit/f3083828b448d08c98969c2f956248bbce75de57))([Frédéric Barthelet](https://github.com/fredericbarthelet))
- **Config Schema:** Ensure to validate direct config where applicable ([#8144](https://github.com/serverless/serverless/issues/8144)) ([af60319](https://github.com/serverless/serverless/commit/af603198a1522094ca0607c24e9325657a41e442)) ([Mariusz Nowak](https://github.com/medikoo))
- Fix handling of invalid range put into `frameworkVersion` ([#8175](https://github.com/serverless/serverless/issues/8175)) ([0d5a480](https://github.com/serverless/serverless/commit/0d5a480fd0fe7abbc1998b9f72707589541f0639)) ([Mariusz Nowak](https://github.com/medikoo))
- Fix handling of pre-releases in `frameworkVersion` validation ([#8166](https://github.com/serverless/serverless/issues/8166)) ([c0fb04a](https://github.com/serverless/serverless/commit/c0fb04af3d2ec35436e02778b3a23f75f45ad7bb)) ([Mariusz Nowak](https://github.com/medikoo))

### Maintenance Improvements

- **Config Schema:**
  - Define AWS definitions in context of a provider ([#8144](https://github.com/serverless/serverless/issues/8144)) ([c79cae2](https://github.com/serverless/serverless/commit/c79cae2308af0b038ef6fcfcf28be8841493e745)) ([Mariusz Nowak](https://github.com/medikoo))
  - Treat `resources` as fully provider specific ([#8144](https://github.com/serverless/serverless/issues/8144)) ([6d7e967](https://github.com/serverless/serverless/commit/6d7e96722721c8a5c614bea2802af7142011d35f)) ([Mariusz Nowak](https://github.com/medikoo))
- **CLI:**
  - Do not notify of update when new major is published (as that's in scope of backend notifications) ([#8136](https://github.com/serverless/serverless/issues/8136)) ([230f34a](https://github.com/serverless/serverless/commit/230f34aa9905636e53e1e63b769024f934689e6b)) ([Mariusz Nowak](https://github.com/medikoo))
  - Improve presentation of multi-line backend notifications ([#8136](https://github.com/serverless/serverless/issues/8136)) ([1abb3c0](https://github.com/serverless/serverless/commit/1abb3c05b58e744bdfa24879921cdaf91438d6f5)) ([Mariusz Nowak](https://github.com/medikoo))
- **AWS HTTP API:** Convert `timeout` usage warnings to deprecations ([#8172](https://github.com/serverless/serverless/issues/8172)) ([3b294fb](https://github.com/serverless/serverless/commit/3b294fb1dbe9f22a6754b64530120a37ab4d16aa)) ([Mariusz Nowak](https://github.com/medikoo))
- Seclude IAM role resource name resolution logic ([#8167](https://github.com/serverless/serverless/issues/8167)) ([6d7103d](https://github.com/serverless/serverless/commit/6d7103da02dcbc4f89949dcebdf4ac6745b91776)) ([Mariusz Nowak](https://github.com/medikoo))
- Expose `serverless.onExitPromise` for internal processing ([#8146](https://github.com/serverless/serverless/issues/8146)) ([0ab1283](https://github.com/serverless/serverless/commit/0ab12832182ab1b34f70d3a5f17d012a4f61b10a)) ([Georges Biaux](https://github.com/georgesbiaux))
- Auto align multi-line deprecation messages ([#8158](https://github.com/serverless/serverless/issues/8158)) ([9cb86a4](https://github.com/serverless/serverless/commit/9cb86a4af2ee0bdda605e5eb4fa14d964e5fe404)) ([Mariusz Nowak](https://github.com/medikoo))

## [1.80.0](https://github.com/serverless/serverless/compare/v1.79.0...v1.80.0) (2020-08-26)

### Features

- **AWS Lambda:** Support EFS mounts ([#8042](https://github.com/serverless/serverless/issues/8042)) ([149f64a](https://github.com/serverless/serverless/commit/149f64ad1c8cec41bfc72ceebcb7c8095b2f8c5c)) ([Piotr Grzesik](https://github.com/pgrzesik))
- **Config Schema:**
  - Schema for AWS `eventBridge` event ([#8114](https://github.com/serverless/serverless/issues/8114)) ([796ce0b](https://github.com/serverless/serverless/commit/796ce0b5ddaf893878912b5edeeec54718bf04ad)) ([Frédéric Barthelet](https://github.com/fredericbarthelet))
  - Schema for AWS `cognitoPool` event ([#8105](https://github.com/serverless/serverless/issues/8105)) ([184cb48](https://github.com/serverless/serverless/commit/184cb48033ce92f771188c27c0ad3e541adab528)) ([Frédéric Barthelet](https://github.com/fredericbarthelet))
- **Plugins:** Fallback plugins search to global installation folder ([#8038](https://github.com/serverless/serverless/issues/8038)) ([82f6db7](https://github.com/serverless/serverless/commit/82f6db7a1fcd27cd723b9100538355dd297774d5)) ([Derek Kulinski](https://github.com/takeda))

### Bug Fixes

- **Config Schema:** Fix recognition of some required properties ([#8108](https://github.com/serverless/serverless/issues/8108)) ([1dd42b0](https://github.com/serverless/serverless/commit/1dd42b0c62d6eb0cc6036fe1529e85e05c616a09)) ([Mariusz Nowak](https://github.com/medikoo))

### Performance Improvements

- **Packaging:** Exclude `aws-sdk` dependency (as it's provided in AWS environment unconditionally) ([#8103](https://github.com/serverless/serverless/issues/8103)) ([f45da3c](https://github.com/serverless/serverless/commit/f45da3c7b168d34e7d3c520068dc24364753a74a)) ([Yogendra Sharma](https://github.com/Yogendra0Sharma))
- **Packaging:** Remove `aws-sdk` installation step when packaging custom resource lambda ([#8110](https://github.com/serverless/serverless/issues/8110)) ([258c692](https://github.com/serverless/serverless/commit/258c692c47c911d77efe880f41134801bdea314a)) ([Sedat Can Yalçın](https://github.com/sedat))

### Maintenance Improvements

- **AWS Deploy:** Refactor out `async` dependency in CloudFormation stack deployment monitoring logic ([#8132](https://github.com/serverless/serverless/issues/8132)) ([f9bcaae](https://github.com/serverless/serverless/commit/f9bcaaead90fd8691a85941f4d5216d5357037ad)) ([Mariusz Nowak](https://github.com/medikoo))
- Adjust deprecation logs to reflect warning format ([#8108](https://github.com/serverless/serverless/issues/8108)) ([b0938c7](https://github.com/serverless/serverless/commit/b0938c7d9bd946c5c9af6bae99ae6f7931242ba6)) ([Mariusz Nowak](https://github.com/medikoo))

## [1.79.0](https://github.com/serverless/serverless/compare/v1.78.1...v1.79.0) (2020-08-19)

### Features

- **Config Schema:**
  - AWS HTTP API schema ([#8068](https://github.com/serverless/serverless/issues/8068)) ([f091c07](https://github.com/serverless/serverless/commit/f091c07992a414f2534c9de80caf76faf2744367)) ([Frédéric Barthelet](https://github.com/fredericbarthelet))
  - Schema for AWS API Gateway's `provider.resourcePolicy` ([#8051](https://github.com/serverless/serverless/issues/8051)) ([20d9c64](https://github.com/serverless/serverless/commit/20d9c6414af9a06e2479d203e62aa6427a80f87f)) ([Geoff Baskwill](https://github.com/glb))

### Bug Fixes

- **AWS API Gateway:** Fix referencing provisioned authorizers ([#8059](https://github.com/serverless/serverless/issues/8059)) ([5a691f4](https://github.com/serverless/serverless/commit/5a691f44573180e1dd5a833aeae196b89a24b697)) ([Mariusz Nowak](https://github.com/medikoo))
- **AWS SQS:** Fix referencing lambdas with provisioned concurrency ([#8059](https://github.com/serverless/serverless/issues/8059)) ([2abb9ad](https://github.com/serverless/serverless/commit/2abb9ad8552d4edc77df5fe1c542373997443950)) ([Mariusz Nowak](https://github.com/medikoo))
- **AWS Credentials:** Fix authentication error message resolution ([#8062](https://github.com/serverless/serverless/issues/8062)) ([2faa20e](https://github.com/serverless/serverless/commit/2faa20e8354d65eed767f88f52919e47edd32866)) ([Mariusz Nowak](https://github.com/medikoo))
- **AWS Lambda:** Ensure to respect `maximumRetryAttempts` set to `0` ([#8048](https://github.com/serverless/serverless/issues/8048)) ([bab0d56](https://github.com/serverless/serverless/commit/bab0d56bd9be6ba1afe0eef352c8732dd7fe4f73)) ([Mariusz Nowak](https://github.com/medikoo))
- **Config Schema:**
  - Report configuration errors as warnings (so it's less confusing) ([#8101](https://github.com/serverless/serverless/issues/8101)) ([e1ee0dc](https://github.com/serverless/serverless/commit/e1ee0dc6f9cf03c872e65d1e258e1162e2d6071e)) ([Mariusz Nowak](https://github.com/medikoo))
  - Recognize catch-all pattern in `disabledDeprecations` property ([#8091](https://github.com/serverless/serverless/issues/8091)) ([c9ee6d5](https://github.com/serverless/serverless/commit/c9ee6d53b688561a154b55dc4fd4fca648ff2ab1)) ([Mariusz Nowak](https://github.com/medikoo))
- **CLI:** Mark `help` as command that doesn't depend on external plugins ([#8056](https://github.com/serverless/serverless/issues/8056)) ([4660acd](https://github.com/serverless/serverless/commit/4660acd324cfa6c786245ea581691a23758ce960)) ([Mariusz Nowak](https://github.com/medikoo))
- **Dashboard:** Ensure service independent commands work unconditionally ([#8056](https://github.com/serverless/serverless/issues/8056)) ([d8a73b8](https://github.com/serverless/serverless/commit/d8a73b8326825b3020fa238057072c837d188d3c)) ([Mariusz Nowak](https://github.com/medikoo))
- **Templates:**
  - Ensure ES7+ support in `aws-nodejs-ecma-script` ([#8064](https://github.com/serverless/serverless/issues/8064)) ([e7efca4](https://github.com/serverless/serverless/commit/e7efca4b421f19b65d88b4bfe973ce5a9ab14d3c)) ([Sam Hulick](https://github.com/ffxsam))
  - Fix `SystemTextJson` initialization in `aws-sharp` ([#8092](https://github.com/serverless/serverless/issues/8092)) ([0490e8b](https://github.com/serverless/serverless/commit/0490e8be2024cd705bbece379897381b88f87148)) ([Matt Davis](https://github.com/mattsonlyattack))
- **Variabless:** Show promises resolution status less frequently (to not interfere with eventual MFA input) ([#8062](https://github.com/serverless/serverless/issues/8062)) ([516603a](https://github.com/serverless/serverless/commit/516603af90b9e1260433c615f8f8f2ad2c68b41d)) ([Mariusz Nowak](https://github.com/medikoo))

### [1.78.1](https://github.com/serverless/serverless/compare/v1.78.0...v1.78.1) (2020-08-04)

### Bug Fixes

- **Config Schema:**
  - Ensure schema for core properties (`frameworkVersion` and `disabledDeprecations`) ([#8044](https://github.com/serverless/serverless/issues/8044)) ([a3f624e](https://github.com/serverless/serverless/commit/a3f624e25cb257afc5d8668a8a5e63e6c67d8827)) ([Mariusz Nowak](https://github.com/medikoo))
  - Fix errors normalization for `oneOf` case ([#8044](https://github.com/serverless/serverless/issues/8044)) ([f4803ee](https://github.com/serverless/serverless/commit/f4803ee363253ebefc1c509d8d808db53bcc6e7a)) ([Mariusz Nowak](https://github.com/medikoo))
  - Fix errors normalization with external refs ([#8044](https://github.com/serverless/serverless/issues/8044)) ([d171f54](https://github.com/serverless/serverless/commit/d171f5476d260f90ff0fe9916aed4a0eea49dfde)) ([Mariusz Nowak](https://github.com/medikoo))

### Maintenance Improvements

- Expose `isStandalone` for metrics ([#8045](https://github.com/serverless/serverless/issues/8045)) ([0ad5cd7](https://github.com/serverless/serverless/commit/0ad5cd7a6333e96b0a041e688bb5eb0a26b98c30)) ([Mariusz Nowak](https://github.com/medikoo))

## [1.78.0](https://github.com/serverless/serverless/compare/v1.77.1...v1.78.0) (2020-08-03)

### Features

- Schema based validation of service config ([#7335](https://github.com/serverless/serverless/issues/7335)) ([268f714](https://github.com/serverless/serverless/commit/268f714357ea909e6897d3377331ed7b1a38e5f5)) ([Petr Reshetin](https://github.com/preshetin) & [Mariusz Nowak](https://github.com/medikoo))
- **AWS Lambda:** Support `maximumEventAge` and `maximumRetryAttempts` ([#7987](https://github.com/serverless/serverless/issues/7987)) ([8573ec1](https://github.com/serverless/serverless/commit/8573ec1e50e4d49baf1a5ae178c32851902f073d)) ([Piotr Grzesik](https://github.com/pgrzesik))

### Bug Fixes

- **AWS EventBridge:**
  - Fix handling of events removal ([#8004](https://github.com/serverless/serverless/issues/8004)) ([41d19b3](https://github.com/serverless/serverless/commit/41d19b3834609ae6bf96439df554b99a082ccb0f)) ([Daniil Bratchenko](https://github.com/bratchenko))
  - Fix attaching lambdas to "default" stage ([#7995](https://github.com/serverless/serverless/issues/7995)) ([b53f080](https://github.com/serverless/serverless/commit/b53f080a4dfc8439333090d2a177ac0272b6d1fe)) ([Pavle Portic](https://github.com/TheEdgeOfCat))
- **Templates:** Ensure missing Kotlin dependencies ([#8010](https://github.com/serverless/serverless/issues/8010)) ([15fae3b](https://github.com/serverless/serverless/commit/15fae3bfb286dfdf72b14f7443a5683d0e4db7de)) ([Diego Marzo](https://github.com/diegomarzo))
- Set `versionFunctions` to true only in AWS provider case ([9897120](https://github.com/serverless/serverless/commit/9897120a8adae59205e5d84d1bdca442621f51b4)) ([Mariusz Nowak](https://github.com/medikoo))

### [1.77.1](https://github.com/serverless/serverless/compare/v1.77.0...v1.77.1) (2020-07-28)

### Bug Fixes

- **AWS Local Invocation:** Ensure java wrappers are moved to runtimeWrappers ([#7999](https://github.com/serverless/serverless/issues/7999)) ([03531d8](https://github.com/serverless/serverless/commit/03531d8bc6bce44a445e34e5046eaef6d95d0aa1)) ([Yuji Yamano](https://github.com/yyamano))
- **AWS Credentials:**
  - Improve AWS SDK workaround ([#8002](https://github.com/serverless/serverless/issues/8002)) ([32cde98](https://github.com/serverless/serverless/commit/32cde98750a91449d352187a8e2f042a38eb3f64)) ([Mariusz Nowak](https://github.com/medikoo))
  - Improve credentials error recognition ([#8002](https://github.com/serverless/serverless/issues/8002)) ([863bc51](https://github.com/serverless/serverless/commit/863bc51904778dbfcb984c663517172c8292ff9d)) ([Mariusz Nowak](https://github.com/medikoo))

## [1.77.0](https://github.com/serverless/serverless/compare/v1.76.1...v1.77.0) (2020-07-27)

### Features

- **Templates:** Add `aws-kotlin-jvm-gradle-kts` template ([#7992](https://github.com/serverless/serverless/issues/7992)) ([4727216](https://github.com/serverless/serverless/commit/4727216760e16d5a11402f74fdcf38c70a8634be)) ([Diego Marzo](https://github.com/diegomarzo))

### Bug Fixes

- **Standalone:** Ensure local invocation wrappers are accessible ([#7982](https://github.com/serverless/serverless/issues/7982)) ([527233d](https://github.com/serverless/serverless/commit/527233d2637977544169e6799d9359c86425de18)) ([Mariusz Nowak](https://github.com/medikoo))
- Fix aws-sdk workaround ([#7984](https://github.com/serverless/serverless/issues/7984)) ([de38640](https://github.com/serverless/serverless/commit/de386405b206d3ebace105992e9c7eb7ad6d7f94)) ([Mariusz Nowak](https://github.com/medikoo))
- **Templates:** Add aws-lambda-java-events support to Java ([#7986](https://github.com/serverless/serverless/issues/7986)) ([ab99b65](https://github.com/serverless/serverless/commit/ab99b657a3c613b3e9ba072e084d159f5ac6c073)) ([Yuji Yamano](https://github.com/yyamano))
- Recognize final DELETE_COMPLETE event with verbose flag ([#7979](https://github.com/serverless/serverless/issues/7979)) ([e980625](https://github.com/serverless/serverless/commit/e980625f586f55da4559b362a9dcd7275e9001bb)) ([devops hipster in training.](https://github.com/herebebogans))
- **AWS API Gateway:** Ensure correct type for StatusCode property ([#7977](https://github.com/serverless/serverless/issues/7977)) ([d0edb5d](https://github.com/serverless/serverless/commit/d0edb5d85991bd6563610c768da80e0791735bc8)) ([Lucas Astrada](https://github.com/Undre4m))

### [1.76.1](https://github.com/serverless/serverless/compare/v1.76.0...v1.76.1) (2020-07-23)

### Bug Fixes

- Ensure to package CLI script ([a687e91](https://github.com/serverless/serverless/commit/a687e9190d861f11ec1fc9a194335b3012b246b9)) ([Mariusz Nowak](https://github.com/medikoo))

## [1.76.0](https://github.com/serverless/serverless/compare/v1.75.1...v1.76.0) (2020-07-23)

### Features

- **AWS ALB:** Support health check configuration for target groups ([#7947](https://github.com/serverless/serverless/issues/7947)) ([a2f977c](https://github.com/serverless/serverless/commit/a2f977c8ced67e5002ce5735ce30d44cc36b17be)) ([David Septimus](https://github.com/DavidSeptimus))
- **Templates:** Upgrade `gradle-wrapper` and `gradle` in Java runtime templates ([#7972](https://github.com/serverless/serverless/issues/7972)) ([6da0964](https://github.com/serverless/serverless/commit/6da09649bb6cbc9074d5dec574856acc8eaa388d)) ([Yuji Yamano](https://github.com/yyamano))

### Bug Fixes

- Fix AWS missing credentials handling ([#7963](https://github.com/serverless/serverless/issues/7963)) ([7af0cd8](https://github.com/serverless/serverless/commit/7af0cd8c280e0f4fc374e859c0223bc0c3455f63)) ([Mariusz Nowak](https://github.com/medikoo))
- Fix packaged files permissions ([#7965](https://github.com/serverless/serverless/issues/7965)) ([cae2885](https://github.com/serverless/serverless/commit/cae28851df435fd9eb0d651fde520862125d5deb)) ([Mariusz Nowak](https://github.com/medikoo))
- **AWS Local Invocation:** Add `java11` support. ([#7956](https://github.com/serverless/serverless/issues/7956)) ([dc1edc1](https://github.com/serverless/serverless/commit/dc1edc10c0088f57b104b8296df6f78d6205b4a0)) ([Yuji Yamano](https://github.com/yyamano))
- **Templates:**
  - Fix java `invoke-bridge` build error handling ([#7968](https://github.com/serverless/serverless/issues/7968)) ([87e7480](https://github.com/serverless/serverless/commit/87e7480663fe7d3513687e9127fdca8b143cf1d6)) ([Yuji Yamano](https://github.com/yyamano))
  - Fix incomplete migration into dayjs from moment ([#7961](https://github.com/serverless/serverless/issues/7961)) ([d5ce246](https://github.com/serverless/serverless/commit/d5ce24681e3a75eccce290a52e045664878b9387)) ([Yuji Yamano](https://github.com/yyamano))
  - Set `ContextClassLoader` for `groovy` and `clojure` ([#7955](https://github.com/serverless/serverless/issues/7955)) ([25263fd](https://github.com/serverless/serverless/commit/25263fd473584e51c81bb3c5cedd4b9005dfd984)) ([Yuji Yamano](https://github.com/yyamano))
  - Upgrade Java 3rd party libraries used for invokeLocal([#7930](https://github.com/serverless/serverless/issues/7930)) ([851b856](https://github.com/serverless/serverless/commit/851b85629dbff510ceb1865fd9a1a48a75940ebd)) ([Yuji Yamano](https://github.com/yyamano))

### Maintenance Improvements

- Remove no longger needed Node.js deprecation logs supression ([#7964](https://github.com/serverless/serverless/issues/7964)) ([af89ab8](https://github.com/serverless/serverless/commit/af89ab8994aaaa12e578b2bad72ddc8a948e765c)) ([Mariusz Nowak](https://github.com/medikoo))
- **CLI:**
  - Cleanup components CLI resolution logic ([#7964](https://github.com/serverless/serverless/issues/7964)) ([cf1d51d](https://github.com/serverless/serverless/commit/cf1d51dbb9b218dfc1cebfa1bf3c5f6eb1ab248b))([Mariusz Nowak](https://github.com/medikoo))
  - Seclude Framework CLI script ([#7964](https://github.com/serverless/serverless/issues/7964)) ([dc826b4](https://github.com/serverless/serverless/commit/dc826b4fdd387bfef0cc74a69e0370815011901b))([Mariusz Nowak](https://github.com/medikoo))

### [1.75.1](https://github.com/serverless/serverless/compare/v1.75.0...v1.75.1) (2020-07-16)

### Bug Fixes

- **CLI:** Ensure `--version` is only top level command option ([#7949](https://github.com/serverless/serverless/issues/7949)) ([1f7534c](https://github.com/serverless/serverless/commit/1f7534c4d89a0e37e61a8eea76f6f0241909d265)) ([Mariusz Nowak](https://github.com/medikoo))
- **AWS Deploy:** Fix resolution of SLS_AWS_REQUEST_MAX_RETRIES setting ([da1b75a](https://github.com/serverless/serverless/commit/da1b75ac889f99a82afa5606e4e0f1f7f3ee2bcf)) ([Mariusz Nowak](https://github.com/medikoo))

## [1.75.0](https://github.com/serverless/serverless/compare/v1.74.1...v1.75.0) (2020-07-15)

### Features

- **AWS HTTP API:**
  - Allow use of CF ImportValue for httpApi id ([#7905](https://github.com/serverless/serverless/issues/7905)) ([5a444c4](https://github.com/serverless/serverless/commit/5a444c415ce31b2c219be47390be165a8da233ea)) ([Frédéric Barthelet](https://github.com/fredericbarthelet))
  - Deprecate payload 1.0 default ([#7919](https://github.com/serverless/serverless/issues/7919)) ([ec954f6](https://github.com/serverless/serverless/commit/ec954f61220f48b379bf4903820bdbb7c2352caf)) ([andreizet](https://github.com/andreizet))
- **AWS API Gateway:** Support integration mapping of request headers [#7897](https://github.com/serverless/serverless/issues/7897) ([56b335f](https://github.com/serverless/serverless/commit/56b335f99930aa9c2a35ce28e68dfea6d5bf3b7f)) ([Ben Arena](https://github.com/benarena))
- **AWS Deploy:** Support customization of request retries count ([6c2fabf](https://github.com/serverless/serverless/commit/6c2fabf9b98fea921a497c7ad15f4943e78c9b73)) ([Mariusz Nowak](https://github.com/medikoo))
- **Templates:**
  - Improve TypeScript template ([#7934](https://github.com/serverless/serverless/issues/7934)) ([5e322c8](https://github.com/serverless/serverless/commit/5e322c87358cd33e7c703ae3ab5e9f1cf863c7e1)) ([Frédéric Barthelet](https://github.com/fredericbarthelet))
  - Upgrade azure-nodejs template ([#7918](https://github.com/serverless/serverless/issues/7918)) ([a88cf00](https://github.com/serverless/serverless/commit/a88cf00ae7d306341771d9445f3aba6f06d46fa7)) ([Ian Anderson](https://github.com/getfatday))
- Deprecate not maintained Node.js versions ([#7918](https://github.com/serverless/serverless/issues/7918)) ([a1f2fdb](https://github.com/serverless/serverless/commit/a1f2fdb5cf077a51d7427dd7fc803d6f60dd5cc9)) ([Mariusz Nowak](https://github.com/medikoo))
- Expose `logDeprecation` through which plugins may signal deprecations [#7941](https://github.com/serverless/serverless/issues/7941) ([f444a8d](https://github.com/serverless/serverless/commit/f444a8d0a11434d89f1e2b2df5045850c45664c9)) ([Mariusz Nowak](https://github.com/medikoo))
- Send list of sevice npm dependencies for notifications generator [#7940](https://github.com/serverless/serverless/issues/7940) ([dba0548](https://github.com/serverless/serverless/commit/dba05481d10d0ffbf198990c9b460bb0b0ad24d2)) ([Mariusz Nowak](https://github.com/medikoo))

### Bug Fixes

- **CLI:**
  - Ensure to show help and version in context of invalid service [#7924](https://github.com/serverless/serverless/issues/7924) ([3ffa549](https://github.com/serverless/serverless/commit/3ffa54918342aeb9c334631c6f710aba234ba241)) ([Mariusz Nowak](https://github.com/medikoo))
  - Show interactive help unconditionally on `--help-interactive` [#7924](https://github.com/serverless/serverless/issues/7924) ([ff0af1e](https://github.com/serverless/serverless/commit/ff0af1e6ac8b89b4d610c141c78fe0fea843a5de)) ([Mariusz Nowak](https://github.com/medikoo))
  - Show version info unconditionally on `-v` or `--version` [#7924](https://github.com/serverless/serverless/issues/7924) ([c042dd5](https://github.com/serverless/serverless/commit/c042dd5144e4e283e565da97933d03bc70b3c8e9)) ([Mariusz Nowak](https://github.com/medikoo))
  - Communicate access to Components CLI [#7942](https://github.com/serverless/serverless/issues/7942) ([79b4718](https://github.com/serverless/serverless/commit/79b4718dec5de1d567af25d1abd0e46d87ff1c6e)) ([Mariusz Nowak](https://github.com/medikoo))
  - Ensure deprecation logs support mute settings from service config [#7941](https://github.com/serverless/serverless/issues/7941) ([4e69c76](https://github.com/serverless/serverless/commit/4e69c76e07a862981e8a9ea9011c98098c9da347)) ([Mariusz Nowak](https://github.com/medikoo))
- **Templates:** Fix `PackageReference` in _aws-fsharp_ template ([#7914](https://github.com/serverless/serverless/issues/7914)) ([7848b6d](https://github.com/serverless/serverless/commit/7848b6d033ec4a7c64186e5f2306351128100be4)) ([Matt Davis](https://github.com/mattsonlyattack))
- Improve error handling in config file resolution [#7924](https://github.com/serverless/serverless/issues/7924) ([de2c68d](https://github.com/serverless/serverless/commit/de2c68d02312f047aa7f83b0b339074b40df7854)) ([Mariusz Nowak](https://github.com/medikoo))
- Throw operational error as operational [#7924](https://github.com/serverless/serverless/issues/7924) ([f965e44](https://github.com/serverless/serverless/commit/f965e446946048691889a7f3723c19ac747b8fe2)) ([Mariusz Nowak](https://github.com/medikoo))

### Maintenance Improvements

- **`lodash` replacement:**
  - Replace `_.concat` with `array.concat` ([#7851](https://github.com/serverless/serverless/issues/7851)) ([fce0b18](https://github.com/serverless/serverless/commit/fce0b1886448d91be21aa64b778c98d95bb47b87)) ([RT](https://github.com/RT1918))
  - Replace `_.findKey` with `Object.keys(object).find` ([#7881](https://github.com/serverless/serverless/issues/7881)) ([d6cf036](https://github.com/serverless/serverless/commit/d6cf036c1647ce68d75b15e831e00f1cec6a97be)) ([Duc Nguyen](https://github.com/vietduc01100001))
  - Replace `_.has` with better counterparts ([#7915](https://github.com/serverless/serverless/issues/7915)) ([7bbd04a](https://github.com/serverless/serverless/commit/7bbd04a6933c1631646f16670e3d85c357450e7a)) ([andreizet](https://github.com/andreizet))
  - Replace `_.keyBy` with native constructs ([#7882](https://github.com/serverless/serverless/issues/7882)) ([e7163ce](https://github.com/serverless/serverless/commit/e7163ceaaceeb93971350b7ccd9cc618b15e4f9b)) ([Duc Nguyen](https://github.com/vietduc01100001))
  - Replace `_.some` usage with `array.some` ([#7901](https://github.com/serverless/serverless/issues/7901)) ([75bf185](https://github.com/serverless/serverless/commit/75bf185785dc2b0a91b6500f353df92990e90f47)) ([Piotr Grzesik](https://github.com/pgrzesik))
  - Replace `_.toString` with native `String` ([#7893](https://github.com/serverless/serverless/issues/7893)) ([028e467](https://github.com/serverless/serverless/commit/028e46720251901279b8230cf76deca721ee4ae6)) ([Anh Dev](https://github.com/anhdevit))

### [1.74.1](https://github.com/serverless/serverless/compare/v1.74.0...v1.74.1) (2020-06-29)

### Bug Fixes

- **AWS Deploy:** Ensure no duplicate (case-insensitive) stack tags ([#7887](https://github.com/serverless/serverless/issues/7887)) ([71919f1](https://github.com/serverless/serverless/commit/71919f1d1f34386fa3429e3e47196c849218f82b)) ([MickVanDuijn](https://github.com/MickVanDuijn))
- **Standalone:**
  - Ensure reliable access from China ([#7891](https://github.com/serverless/serverless/issues/7891)) ([6fccede](https://github.com/serverless/serverless/commit/6fccedea4ac5a3a546d36b19d2e0701defd9ed85)) ([Mariusz Nowak](https://github.com/medikoo))
  - Support SLS_GEO_LOCATION env var ([#7891](https://github.com/serverless/serverless/issues/7891)) ([474df11](https://github.com/serverless/serverless/commit/474df11288a0431bb14947c4a08ae34edecb4164)) ([Mariusz Nowak](https://github.com/medikoo))

### Maintenance Improvements

- **`lodash` replacement:**
  - Remove `_.isInteger` ([#7878](https://github.com/serverless/serverless/issues/7878)) ([3b19a5a](https://github.com/serverless/serverless/commit/3b19a5a6b191fdb0dac5a81d1244159e0da9e0bd)) ([Dai Van Nguyen](https://github.com/nvdai2401))

## [1.74.0](https://github.com/serverless/serverless/compare/v1.73.1...v1.74.0) (2020-06-26)

### Features

- **AWS ALB:** Support built-in authentication through `onUnauthenticatedRequest` ([#7780](https://github.com/serverless/serverless/issues/7780)) ([b976677](https://github.com/serverless/serverless/commit/b9766775148b15f8b19fd9d657149813cb5e8bfa)) ([Kamaz](https://github.com/kamaz))

### Bug Fixes

- **AWS HTTP API:** Respect logRetentionInDays setting ([#7856](https://github.com/serverless/serverless/issues/7856)) ([9dad77c](https://github.com/serverless/serverless/commit/9dad77ce1b12218f3c38b62c716d4dbc9d68bb5d)) ([Jonne Deprez](https://github.com/jonnedeprez))
- **AWS Websocket:** Fix resources dependency chain ([9c0f646](https://github.com/serverless/serverless/commit/9c0f6461b73976958ebdd7e2762c6d1fbd469da1)) ([Mariusz Nowak](https://github.com/medikoo))

### Maintenance Improvements

- **`lodash` replacement:**
  - Remove `_.isBoolean` usage ([#7880](https://github.com/serverless/serverless/issues/7880)) ([57f70f9](https://github.com/serverless/serverless/commit/57f70f93eb3c24b802c842fb6e395591a70a3270)) ([Anh Dev](https://github.com/anhdevit))
  - Replace `_.chain` with native constructs ([#7862](https://github.com/serverless/serverless/issues/7862)) ([288cb25](https://github.com/serverless/serverless/commit/288cb255acda29b15e10b10efcddee1b491a9b5d)) ([Nguyễn Việt Đức](https://github.com/vietduc01100001))
  - Replace `_.compact` with `array.filter(Boolean)` ([#7858](https://github.com/serverless/serverless/issues/7858)) ([7e68a0c](https://github.com/serverless/serverless/commit/7e68a0c90f19ff9d8cfaab8f064628e72db2a054)) ([Çalgan Aygün](https://github.com/calganaygun))
  - Replace `_.isEmpty` with native counterparts ([#7873](https://github.com/serverless/serverless/issues/7873)) ([4c33476](https://github.com/serverless/serverless/commit/4c33476210d355b9b822909685a951a4d970f467)) ([Dai Van Nguyen](https://github.com/nvdai2401))
  - Replace `_.min` with native constructs ([#7840](https://github.com/serverless/serverless/issues/7840)) ([ee94dce](https://github.com/serverless/serverless/commit/ee94dce47ce989c7af2d54fc8c7dc24beab43ee8)) ([Nguyễn Việt Đức](https://github.com/vietduc01100001))
  - Replace `_.parseInt` with `Number` ([#7877](https://github.com/serverless/serverless/issues/7877)) ([f2e1942](https://github.com/serverless/serverless/commit/f2e19420e9a639b1523958cb406d7bd178571248)) ([Dai Van Nguyen](https://github.com/nvdai2401))
  - Replace `_.pullAllWith` with native constructs ([#7861](https://github.com/serverless/serverless/issues/7861)) ([f6743e9](https://github.com/serverless/serverless/commit/f6743e9b35bf821109ffb18039ea9cf419a7ad18)) ([Çalgan Aygün](https://github.com/calganaygun))
  - Replace `_.reduce` with `array.reduce` ([#7883](https://github.com/serverless/serverless/issues/7883)) ([297f7d8](https://github.com/serverless/serverless/commit/297f7d85e07469f8157dfb6befb697f8dc0305d7)) ([Dai Van Nguyen](https://github.com/nvdai2401))
  - Replace `_.sortBy` with `array.sort` ([#7823](https://github.com/serverless/serverless/issues/7823)) ([57e4212](https://github.com/serverless/serverless/commit/57e4212671ea3027fab9482e6006933e4c5b6c55)) ([Nguyễn Việt Đức](https://github.com/vietduc01100001))

### [1.73.1](https://github.com/serverless/serverless/compare/v1.73.0...v1.73.1) (2020-06-16)

### Bug Fixes

- **AWS API Gateway:** Fix handling of `usagePlan` array ([85cc447](https://github.com/serverless/serverless/commit/85cc4476b35b144ed28e71302230df2d626a4e60)) ([Mariusz Nowak](https://github.com/medikoo))

## [1.73.0](https://github.com/serverless/serverless/compare/v1.72.0...v1.73.0) (2020-06-16)

### Features

- **AWS Stream:** Add support for `maximumRecordAgeInSeconds` property ([#7833](https://github.com/serverless/serverless/issues/7833)) ([003fcfb](https://github.com/serverless/serverless/commit/003fcfb8fc1b083e01daa2e478086ee89e74c644)) ([Demián Rodriguez](https://github.com/demian85))
- Drop old and support new analytics endpoint, display notifications as returned by backend ([#7811](https://github.com/serverless/serverless/issues/7811)) ([49b5914](https://github.com/serverless/serverless/commit/49b5914378038a9a35433e40233e9f49acd0e964)) ([Mariusz Nowak](https://github.com/medikoo))

### Bug Fixes

- **AWS SQS:** Revert support for `maximumRetryAttempts` option ([#7832](https://github.com/serverless/serverless/issues/7832)) ([5a5a986](https://github.com/serverless/serverless/commit/5a5a9864149e962375bb252adcaf32bbe10662da)) ([Mariusz Nowak](https://github.com/medikoo))
- Ensure `serverless.ts` is handled properly at plugin commands ([#7806](https://github.com/serverless/serverless/issues/7806)) ([dc96b9a](https://github.com/serverless/serverless/commit/dc96b9a876b04e10ced474b7bb32416a204c67a3)) ([Bryan Hunter](https://github.com/bryan-hunter))

### Maintenance Improvements

- **`lodash` replacement:**
  - Replace `_.first`with `array[0]` ([#7816](https://github.com/serverless/serverless/issues/7816)) ([a527744](https://github.com/serverless/serverless/commit/a527744606a7dd9dd9caf0a376eb615f0b81a40f)) ([Chris Villanueva](https://github.com/chrisVillanueva))
  - Replace `_.head` with `array[0]` ([#7817](https://github.com/serverless/serverless/issues/7817)) ([8991ceb](https://github.com/serverless/serverless/commit/8991ceb209884f72beba0ab8b166a258c0af3e1d)) ([Chris Villanueva](https://github.com/chrisVillanueva))
  - Replace `_.includes` with `val.includes` ([#7818](https://github.com/serverless/serverless/issues/7818)) ([77fbb59](https://github.com/serverless/serverless/commit/77fbb5969b31bdd0d2220019f896df5a9f36e6fe)) ([Chris Villanueva](https://github.com/chrisVillanueva))
  - Replace `_.indexOf` with `arr.includes` ([#7825](https://github.com/serverless/serverless/issues/7825)) ([332524d](https://github.com/serverless/serverless/commit/332524dae73cb102c244d3b568ec880f9bc816aa)) ([Nguyễn Việt Đức](https://github.com/vietduc01100001))
  - Replace `_.isFunction` with `typeof value === 'function'` ([#7810](https://github.com/serverless/serverless/issues/7810)) ([e42ab2c](https://github.com/serverless/serverless/commit/e42ab2cda65d3986ce78f81da10c7149019162a2)) ([Wing-Kam](https://github.com/wingkwong))
  - Replace `_.isNil(value)` with `value == null` ([#7809](https://github.com/serverless/serverless/issues/7809)) ([6cf4901](https://github.com/serverless/serverless/commit/6cf4901a8907ddfb36dc45ee1e094a7dff401360)) ([Wing-Kam](https://github.com/wingkwong))
  - Replace `_.isString(value)` with `typeof value === 'string'` ([#7812](https://github.com/serverless/serverless/issues/7812)) ([9f3ee94](https://github.com/serverless/serverless/commit/9f3ee94a74a4d9d80451143a5f212d0b6f790a5f)) ([Wing-Kam](https://github.com/wingkwong))
  - Replace `_.isUndefined` with native checks ([#7826](https://github.com/serverless/serverless/issues/7826)) ([20cef81](https://github.com/serverless/serverless/commit/20cef81555473311128ed425125d017c1ab6729c)) ([Nguyễn Việt Đức](https://github.com/vietduc01100001))
  - Replace `_.join` with `array.join` ([#7805](https://github.com/serverless/serverless/issues/7805)) ([5cf46bf](https://github.com/serverless/serverless/commit/5cf46bf109287bcd327e6f45f58b3f392cc345de)) ([Chris Villanueva](https://github.com/chrisVillanueva))
  - Replace `_.map` with `array.map` ([#7827](https://github.com/serverless/serverless/issues/7827)) ([4c6f8be](https://github.com/serverless/serverless/commit/4c6f8be5ccae88034e19f72a53996208dd4a56d5)) ([Nguyễn Việt Đức](https://github.com/vietduc01100001))
  - Replace `_.nth` with `array[index]` ([#7841](https://github.com/serverless/serverless/issues/7841)) ([d5de0ec](https://github.com/serverless/serverless/commit/d5de0ec56aabff10ab6de8913b1b68730aa63fcd)) ([Nguyễn Việt Đức](https://github.com/vietduc01100001))
  - Replace `_.repeat` with `string.repeat` ([#7842](https://github.com/serverless/serverless/issues/7842)) ([a549517](https://github.com/serverless/serverless/commit/a5495174413cead282dc09959ec251ee8444a06a)) ([Nguyễn Việt Đức](https://github.com/vietduc01100001))
  - Replace `_.replace` with `string.replace` ([#7843](https://github.com/serverless/serverless/issues/7843)) ([aaa2f96](https://github.com/serverless/serverless/commit/aaa2f965a73ade5c691f0f935c5d37283ba7cd8a)) ([Nguyễn Việt Đức](https://github.com/vietduc01100001))
  - Replace `_.split` with `string.split` ([#7820](https://github.com/serverless/serverless/issues/7820)) ([053f5f4](https://github.com/serverless/serverless/commit/053f5f420b45e9dec794e82d1bc23a2731a077ff)) ([srd2014](https://github.com/srd2014))
  - Replace `_.takeRight` with `array.slice` ([#7831](https://github.com/serverless/serverless/issues/7831)) ([3b3db7a](https://github.com/serverless/serverless/commit/3b3db7ad29996e204bdef605d0c191cd610148d2)) ([Jishnu Mohan P R](https://github.com/jishnu-mohan))
  - Replace `_.toUpper(string)` with `string.toUpperCase` ([#7808](https://github.com/serverless/serverless/issues/7808)) ([22a4ed2](https://github.com/serverless/serverless/commit/22a4ed27e262cbf13cb0df14df32a2c4bc2a0c9d)) ([Wing-Kam](https://github.com/wingkwong))
  - Replace `_.unset` with `delete` ([#7813](https://github.com/serverless/serverless/issues/7813)) ([e39cdfd](https://github.com/serverless/serverless/commit/e39cdfdf02adba8b83f4bbf83208fdf81e32c1d7)) ([Chris Villanueva](https://github.com/chrisVillanueva))
- Switch to `@serverless/util/config` ([#7811](https://github.com/serverless/serverless/issues/7811)) ([96afed4](https://github.com/serverless/serverless/commit/96afed438cde47a9fc75736ba22485ec90c7eb5a)) ([Mariusz Nowak](https://github.com/medikoo))

## [1.72.0](https://github.com/serverless/serverless/compare/v1.71.3...v1.72.0) (2020-06-02)

### Features

- **AWS API Gateway:**
  - Simplify referencing local CognitoUserPool ([#7799](https://github.com/serverless/serverless/issues/7799)) ([2e4377e](https://github.com/serverless/serverless/commit/2e4377ecf038401456c3fca29feeab624846a300)) ([Alex DeBrie](https://github.com/alexdebrie))
  - Support `customerId` in API keys ([#7786](https://github.com/serverless/serverless/issues/7786)) ([c6894b5](https://github.com/serverless/serverless/commit/c6894b5129c14a43fce0017187cf69aa1bdc9185)) ([Greg Campion](https://github.com/gcampionpae))
  - Support toggling CloudWatch metrics ([#7754](https://github.com/serverless/serverless/issues/7754)) ([87d40aa](https://github.com/serverless/serverless/commit/87d40aa8a7fea136a9c05d6e3c350b0d24a58183)) ([Satoru Kikuchi](https://github.com/s-kikuchi))
- **AWS HTTP API:** Support externally configured JWT authorizers ([#7789](https://github.com/serverless/serverless/issues/7789)) ([4074739](https://github.com/serverless/serverless/commit/4074739476e22631b0e06a9d23a2e21d8f29c21e)) ([Michał Mrozek](https://github.com/Michsior14))
- **CLI:**
  - Deprecations logger ([#7741](https://github.com/serverless/serverless/issues/7741)) ([6f32f23](https://github.com/serverless/serverless/commit/6f32f236d8c44464b34e8c666e4ecbb3abe287d4)) ([Ahmad Mahmoud Mohammad](https://github.com/AhmedFat7y) & [Mariusz Nowak](https://github.com/medikoo))
  - Deprecate `bin/serverless` binary ([#7759](https://github.com/serverless/serverless/issues/7759)) ([a60d2c7](https://github.com/serverless/serverless/commit/a60d2c7dd8648a17c9ca09c363d3ab88b797a11c)) ([Mariusz Nowak](https://github.com/medikoo))
- **Templates:** Azure C# template ([#7738](https://github.com/serverless/serverless/issues/7738)) ([9611137](https://github.com/serverless/serverless/commit/96111379823fc1fc68835b9bcdb4f0f585ff554e)) ([Tanner Barlow](https://github.com/tbarlow12))
- **Variables:** Support non-function exports in js files ([#7540](https://github.com/serverless/serverless/issues/7540)) ([89ba272](https://github.com/serverless/serverless/commit/89ba272a63a153df0655c85a5d5a2487580c73a1)) ([Steven Rapp](https://github.com/srapp))
- Support `serverless.ts` (TypeScript type) as configuration input ([#7755](https://github.com/serverless/serverless/issues/7755)) ([4db8b63](https://github.com/serverless/serverless/commit/4db8b630a285d40b117d7043f024cb3e036951b4)) ([Bryan Hunter](https://github.com/bryan-hunter))

### Bug Fixes

- **AWS API Gateway:**
  - Fix API key names resolution ([#7804](https://github.com/serverless/serverless/issues/7804)) ([f9f6a3b](https://github.com/serverless/serverless/commit/f9f6a3b560f70b81ce0ab6f802e05596bd700916)) ([Mariusz Nowak](https://github.com/medikoo))
  - Apply contentHandling only to successful responses ([#7757](https://github.com/serverless/serverless/issues/7757)) ([aa48f0a](https://github.com/serverless/serverless/commit/aa48f0a0766fc07e6e3ca4bb7ba4b6ad3427cc03)) ([Thomas Aribart](https://github.com/ThomasAribart))
- Downgrade `uuid` to v3 ([#7778](https://github.com/serverless/serverless/issues/7778)) ([e9be1c8](https://github.com/serverless/serverless/commit/e9be1c8c6f3b6f105f0e6d9f4383e7cbe16e62ff)) ([Mariusz Nowak](https://github.com/medikoo))

### Maintenance Improvements

- **`lodash` replacement:**
  - Replace `_.assign` and `_.extend` with `Object.assign` ([#7766](https://github.com/serverless/serverless/issues/7766)) ([85e9cd4](https://github.com/serverless/serverless/commit/85e9cd4455bb631be921a12a37f2174fd50ecec6)) ([Nguyễn Việt Đức](https://github.com/vietduc01100001))
  - Replace `_.every` with `array.every` ([#7764](https://github.com/serverless/serverless/issues/7764)) ([d1721cb](https://github.com/serverless/serverless/commit/d1721cb2b4b5a6b3621eba78dbe27eead21f9164)) ([Chris Villanueva](https://github.com/chrisVillanueva))
  - Replace `_.filter` with `array.filter` ([#7775](https://github.com/serverless/serverless/issues/7775)) ([dac7c56](https://github.com/serverless/serverless/commit/dac7c56b26dbe2b3489e88329dd70e0787c73087)) ([Midhun Rajendran](https://github.com/rmidhun23))
  - Replace `_.keys` with `Object.keys` ([#7784](https://github.com/serverless/serverless/issues/7784)) ([d43241e](https://github.com/serverless/serverless/commit/d43241ea8bacc43d3105ba8600674a7564cb6895)) ([Chris Villanueva](https://github.com/chrisVillanueva))
  - Replace `_.find` with `array.find` ([#7782](https://github.com/serverless/serverless/issues/7782)) ([0036962](https://github.com/serverless/serverless/commit/003696260c43acf2415fa6b05a212ea57bdec3d4)) ([Chris Villanueva](https://github.com/chrisVillanueva))
  - Replace `_.forEach` and `_.each` with array.forEach ([#7748](https://github.com/serverless/serverless/issues/7748)) ([5e0af21](https://github.com/serverless/serverless/commit/5e0af21313b1061666b355b2b83737eb5f2dccf0)) ([Tatsuno Yasuhiro](https://github.com/exoego))
  - Replace `_.size` with native counterparts ([#7798](https://github.com/serverless/serverless/issues/7798)) ([2b00928](https://github.com/serverless/serverless/commit/2b00928f87901bfd432f34e181d85aed65837841)) ([Chris Villanueva](https://github.com/chrisVillanueva))
- **Dependency upgrades:**
  - Replace `inquirer` with `@serverless/inquirer` ([#7729](https://github.com/serverless/serverless/issues/7729)) ([4724cb8](https://github.com/serverless/serverless/commit/4724cb8eeb16a35695c1f4b166b81c0cc2e4ddae)) ([Ahmad Mahmoud Mohammad](https://github.com/AhmedFat7y))
  - Upgrade `json-refs` to v3 ([#7763](https://github.com/serverless/serverless/issues/7763)) ([97e99fc](https://github.com/serverless/serverless/commit/97e99fc8f09feb45f31d4934c3f5cb1db2e0193a)) ([Frédéric Barthelet](https://github.com/fredericbarthelet))
  - Upgrade `globby` to v9 ([#7750](https://github.com/serverless/serverless/issues/7750)) ([b245596](https://github.com/serverless/serverless/commit/b245596dbb76e6cdea081e3c6510976587e7e82f)) ([Nguyễn Việt Đức](https://github.com/vietduc01100001))

### [1.71.3](https://github.com/serverless/serverless/compare/v1.71.2...v1.71.3) (2020-05-20)

### Bug Fixes

- **AWS Deploy:** Fix packaging logic after regression introduced with [#7742](https://github.com/serverless/serverless/issues/7742) ([b97e2b4](https://github.com/serverless/serverless/commit/b97e2b421138def7131069771fc820e81edafc73)) ([Mariusz Nowak](https://github.com/medikoo))

### [1.71.2](https://github.com/serverless/serverless/compare/v1.71.1...v1.71.2) (2020-05-20)

### Bug Fixes

- **AWS CloudFront:** Fix merge of template configuration ([#7739](https://github.com/serverless/serverless/issues/7739)) ([304a502](https://github.com/serverless/serverless/commit/304a50261dbccfe73b7eb9f6e6210209f63051ad)) ([Antonio Caiazzo](https://github.com/antoniocaiazzo))
- **AWS Local Invocation:** Ensure to mount as read only in docker ([#7622](https://github.com/serverless/serverless/issues/7622)) ([4252422](https://github.com/serverless/serverless/commit/4252422a94857eb3b446562ba3b24188f0116f19)) ([Alex Soto](https://github.com/apsoto))
- **AWS Deploy:** Fix changes detection when user package artifact is involved ([#7742](https://github.com/serverless/serverless/issues/7742)) ([05499e6](https://github.com/serverless/serverless/commit/05499e6083d4b36ba9b80b271b2becf4249dbbc6)) ([Tatsuno Yasuhiro](https://github.com/exoego))

### Performance Improvements

- **AWS Deploy:** Do not re-upload unchanged lambda layers ([#7680](https://github.com/serverless/serverless/issues/7680)) ([2b9f63e](https://github.com/serverless/serverless/commit/2b9f63e3329d6e28c0a87d58658b0afde557053e)) ([Tatsuno Yasuhiro](https://github.com/exoego))

### Maintenance Improvements

- Replace `_.{startsWith,endsWith,includes}` with native methods ([#7715](https://github.com/serverless/serverless/issues/7715)) ([8bb5517](https://github.com/serverless/serverless/commit/8bb55174562c379ae14e5d1b90db3ed2b25038bd)) ([Tatsuno Yasuhiro](https://github.com/exoego))
- Upgrade `globby` to v9 ([#7750](https://github.com/serverless/serverless/issues/7750)) ([b245596](https://github.com/serverless/serverless/commit/b245596dbb76e6cdea081e3c6510976587e7e82f)) ([Nguyễn Việt Đức](https://github.com/vietduc01100001))

### [1.71.1](https://github.com/serverless/serverless/compare/v1.71.0...v1.71.1) (2020-05-15)

### Bug Fixes

- **CLI:** Fix handling of singular `--config` param ([7bcad68](https://github.com/serverless/serverless/commit/7bcad688c515a8c504f8958b7e15f3ac6d90e0d0)) ([Mariusz Nowak](https://github.com/medikoo))
- **Standalone:** Workaround `fs-extra` v8 bug in chocolatey package generation script ([548bd98](https://github.com/serverless/serverless/commit/548bd986e4dafcae207ae80c3a8c3f956fbce037)) ([Mariusz Nowak](https://github.com/medikoo))

## [1.71.0](https://github.com/serverless/serverless/compare/v1.70.1...v1.71.0) (2020-05-15)

### Features

- **AWS Lambda:** Support `disableLogs` setting for functions, to disable generation of log group resources ([#7720](https://github.com/serverless/serverless/issues/7720)) ([3144be8](https://github.com/serverless/serverless/commit/3144be82d1a5cd966ed5fb7851cc481e71fe4608)) ([Ahmad Mahmoud Mohammad](https://github.com/AhmedFat7y))
- Support `provider.stackParameters` for configuring CloudFormation deployment Parameters ([#7677](https://github.com/serverless/serverless/issues/7677)) ([a0a43a6](https://github.com/serverless/serverless/commit/a0a43a68f339f6995937a0743fe042e9e11784f9)) ([Nikody Keating](https://github.com/nkeating-mutualofenumclaw))

### Bug Fixes

- **AWS API Gateway:**
  - Fix handling of stage specific settings when nested stacks are involved ([#7735](https://github.com/serverless/serverless/issues/7735)) ([cf1692f](https://github.com/serverless/serverless/commit/cf1692f1a42c3756619869c7cdba24c660141522)) ([Mariusz Nowak](https://github.com/medikoo))
  - Improve stage settings preliminary configuration and validation ([#7735](https://github.com/serverless/serverless/issues/7735)) ([e472a04](https://github.com/serverless/serverless/commit/e472a0491a720863ab44fb81b6fada0da21507e3)) ([Mariusz Nowak](https://github.com/medikoo))
- **AWS CloudFront:** Ensure Lambda@Edge setup comes with no VPC configuration or environment variables set ([#7721](https://github.com/serverless/serverless/issues/7721)) ([a1472ba](https://github.com/serverless/serverless/commit/a1472ba6f0f10bb801de944661079174fec1a062)) ([Ahmad Mahmoud Mohammad](https://github.com/AhmedFat7y))
- **AWS IAM:** Remove IAM role from function's `DependsOn` section ([#7722](https://github.com/serverless/serverless/issues/7722)) ([d8222fa](https://github.com/serverless/serverless/commit/d8222fa0dc80ac4f6e7c23b3ccfd0d91f80b3e2e)) ([Ahmad Mahmoud Mohammad](https://github.com/AhmedFat7y))
- **CLI:** Reject multitple `--config` params ([#7728](https://github.com/serverless/serverless/issues/7728)) ([ca2a73f](https://github.com/serverless/serverless/commit/ca2a73f91a86ae41b4cf48384177c0fd74ff4f1f)) ([Ahmad Mahmoud Mohammad](https://github.com/AhmedFat7y))

### Maintenance Improvements

- Upgrade `fs-extra` to v8 ([#7719](https://github.com/serverless/serverless/issues/7719)) ([c106d53](https://github.com/serverless/serverless/commit/c106d5363830e9dc31a5714f56abfb26b0a5db37)) ([Kenan Christian Dimas](https://github.com/kenanchristian))

## [1.70.1](https://github.com/serverless/serverless/compare/v1.70.0...v1.70.1) (2020-05-11)

### Bug Fixes

- **AWS IAM:** Fix role and policy name resolution ([#7694](https://github.com/serverless/serverless/pull/7694)) ([08dc745](https://github.com/serverless/serverless/commit/08dc745cbfa403860bc7e08cbaf10cd90f15be05)) ([Mariusz Nowak](https://github.com/medikoo))
- **Standalone:** Ensure pkg bug workaround is applied on WIndows ([#7699](https://github.com/serverless/serverless/pull/7699)) ([8bc6d54](https://github.com/serverless/serverless/commit/8bc6d542f8b45aee74463ec732272dcf39c14132)) ([Mariusz Nowak](https://github.com/medikoo))

### Enhancements

- **Templates:**
  - Update aws-csharp to .NET Core 3.1 ([#7708](https://github.com/serverless/serverless/issues/7708)) ([46df82e](https://github.com/serverless/serverless/commit/46df82ea92ced3ba7542f6de5da6cfda73554ffc)) ([Joseph Woodward](https://github.com/JosephWoodward))
  - Update aws-fsharp to .NET Core 3.1 ([#7709](https://github.com/serverless/serverless/issues/7709)) ([a5a136f](https://github.com/serverless/serverless/commit/a5a136f982f19043cf4cf3236db1ac2d17c8a266)) ([Stuart Lang](https://github.com/slang25))

### Maintenance Improvements

- Replace `_.isArray` with native `Array.isArray` ([#7703](https://github.com/serverless/serverless/issues/7703)) ([3fe2e98](https://github.com/serverless/serverless/commit/3fe2e98f15d3a78571b3aa0894be1632e2f5ab51)) ([Tatsuno Yasuhiro](https://github.com/exoego))
- Upgrade `archiver` to v3 ([#7712](https://github.com/serverless/serverless/issues/7712)) ([dd9bf9](https://github.com/serverless/serverless/commit/dd9bf9a7996af5a3baf003d166ec34e1eb695b2b)) ([Frédéric Barthelet](https://github.com/fredericbarthelet))
- Upgrade `uuid` to v8 ([#7707](https://github.com/serverless/serverless/issues/7707)) ([5b4fd0](https://github.com/serverless/serverless/commit/5b4fd0fd962f84532a9dfa8469f9c76b26d78ecf)) ([Kazuki Takahashi](https://github.com/cuzkop))

## [1.70.0](https://github.com/serverless/serverless/compare/v1.69.0...v1.70.0) (2020-05-07)

### Features

- **Variables:** Support boolean and integer fallbacks ([#7632](https://github.com/serverless/serverless/issues/7632)) ([f22bffc](https://github.com/serverless/serverless/commit/f22bffc2b49e0badef8a3253478337808222964c)) ([Frédéric Barthelet](https://github.com/fredericbarthelet))
- **AWS API Gateway:** Support singular string value for CORS header ([#7668](https://github.com/serverless/serverless/pull/7668)) ([fb4ea15](https://github.com/serverless/serverless/commit/fb4ea153f0a30f18aad5b93456a1b26ed2d189ac)) ([Ahmad Mahmoud Mohammad](https://github.com/AhmedFat7y))

### Bug Fixes

- **AWS API Gateway:**
  - Ensure to update stage only for deployed API's ([#7663](https://github.com/serverless/serverless/pull/7663)) ([81953ef](https://github.com/serverless/serverless/commit/81953ef74c0c80256d8f8235df0bbb4fc8eeb1b9)) ([Mariusz Nowak](https://github.com/medikoo))
  - Fix visibility of ..-Allow-Credentials CORS header ([#7576](https://github.com/serverless/serverless/pull/7576)) ([bd9fbfb](https://github.com/serverless/serverless/commit/bd9fbfb392afc2dc95f7d83864bfdc4dc1602728)) ([Thomas Aribart](https://github.com/ThomasAribart))
- **AWS Stream:** Fix handling of configuration properties ([#7682](https://github.com/serverless/serverless/issues/7682)) ([7e1dd66](https://github.com/serverless/serverless/commit/7e1dd66f8ee72010826a7a56b7cae2479c852a60)) ([Jagdeep Singh](https://github.com/jagdeep-singh))
- **AWS Deploy** Improve logic responsible for generation of custom resource lambda archive ([#7684](https://github.com/serverless/serverless/pull/7684)) ([6b3a78](https://github.com/serverless/serverless/commit/6b3a78950c4d02049b76675a3df093891de4317a)) ([Mariusz Nowak](https://github.com/medikoo))
- **AWS EventBridge:** Ensure no duplicate event bus IAM policies ([#7644](https://github.com/serverless/serverless/issues/7644)) ([a1fde35](https://github.com/serverless/serverless/commit/a1fde35db47db76b18ddcb006e4faab22f58dc73)) ([Thomas Aribart](https://github.com/ThomasAribart))
- Fix function version param handling in `rollback function` command ([#7648](https://github.com/serverless/serverless/pull/)) ([03ad56b](https://github.com/serverless/serverless/commit/03ad56b8e189f236222431856dd43afbebdce417)) ([](https://github.com/)) ([Ahmad Mahmoud Mohammad](https://github.com/AhmedFat7y))

## [1.69.0](https://github.com/serverless/serverless/compare/v1.68.0...v1.69.0) (2020-04-29)

### Features

- **AWS HTTP API:** Support payload format version customization ([#7623](https://github.com/serverless/serverless/issues/7623)) ([4c2a52d](https://github.com/serverless/serverless/commit/4c2a52d1bf8fdb15683c09a8db800aa0e5842950)) ([Eugene Girshov](https://github.com/egirshov))
- **AWS API Gateway:** Support Open API `operationId` setting ([#7617](https://github.com/serverless/serverless/issues/7617)) ([23bbcea](https://github.com/serverless/serverless/commit/23bbcea65c3571798435aefc6d6dc9151814cab8)) ([Ryan Toussaint](https://github.com/ryantoussaint))
- **AWS SQS:** Support `maximumRetryAttempts` option ([#7620](https://github.com/serverless/serverless/issues/7620)) ([9416e72](https://github.com/serverless/serverless/commit/9416e72cba58c0a83b6bad07cdb740d36d131e96)) ([Conrad Kurth](https://github.com/ConradKurth))
- **Variables:** Support region selection on AWS SSM variables ([#7625](https://github.com/serverless/serverless/issues/7625)) ([7d3636f](https://github.com/serverless/serverless/commit/7d3636f9682c7c9929a9061f105ed232d139aa56)) ([Frédéric Barthelet](https://github.com/fredericbarthelet))

### Bug Fixes

- **AWS API Gateway:** Fix origin wildcard handling with `cors: true` ([#7482](https://github.com/serverless/serverless/issues/7482)) ([57fec3f](https://github.com/serverless/serverless/commit/57fec3f3d0429411b19f65d69cac85306b5ef950)) ([Bhuser](https://github.com/Bhuser))
- **AWS HTTP API:** Fix default log format ([#7612](https://github.com/serverless/serverless/issues/7612)) ([90ceecd](https://github.com/serverless/serverless/commit/90ceecd00d2e623f3d8a0aef13aa5a23e496d057)) ([Mariusz Nowak](https://github.com/medikoo))
- **AWS Info:** Fix calculation of resources count ([#7587](https://github.com/serverless/serverless/issues/7587)) ([946d32c](https://github.com/serverless/serverless/commit/946d32cb48dbcdc3f02a8c1521b7f5cabf1eb1f9)) ([herebebogans](https://github.com/herebebogans))
- **AWS S3:** Fix error message generation ([#7564](https://github.com/serverless/serverless/issues/7564)) ([2e56dea](https://github.com/serverless/serverless/commit/2e56dea5652540cf5d82c9d35a999c8c921fa020)) ([John Mortlock](https://github.com/jmortlock))
- **AWS Stream:** Fix configuration of boolean `Enabled` setting ([#7552](https://github.com/serverless/serverless/issues/7552)) ([10c016f](https://github.com/serverless/serverless/commit/10c016f35378e91910ee2cda3df87ddb592e95ab)) ([Clar Charron](https://github.com/clar-cmp))

## [1.68.0](https://github.com/serverless/serverless/compare/v1.67.3...v1.68.0) (2020-04-22)

### Features

- **AWS ALB:** Cognito and Oidc authentication support ([#7372](https://github.com/serverless/serverless/issues/7372)) ([8c644f1](https://github.com/serverless/serverless/commit/8c644f1b07d355544328bd008e831b40aea57af7)) ([Tatenda Chawanzwa](https://github.com/shadrech))
- **AWS Local Invocation:** Support `ruby2.7` runtime ([#7538](https://github.com/serverless/serverless/issues/7538)) ([a6b3154](https://github.com/serverless/serverless/commit/a6b3154deebdcd530afa0c716a6d7efca13de6f2)) ([Yotaro](https://github.com/yotaro-fujii))
- **Templates:** Support SSH format download template urls ([#7588](https://github.com/serverless/serverless/issues/7588)) ([d3bf39a](https://github.com/serverless/serverless/commit/d3bf39aa05f861cc8dc5115b1a7350af3b1916d9)) ([Yuga Sun](https://github.com/yugasun))

### Bug Fixes

- **AWS HTTP API:** Support API name customization ([#7434](https://github.com/serverless/serverless/issues/7434)) ([7479a9a](https://github.com/serverless/serverless/commit/7479a9ae82b44fb06de3ab84094b18e8f72affc4)) ([Eugene Girshov](https://github.com/egirshov))
- **AWS SQS:** Fix resolution of `Enabled` property ([#7532](https://github.com/serverless/serverless/issues/7532)) ([8abae84](https://github.com/serverless/serverless/commit/8abae84b8003567b6cb8affae018245a806a272b)), closes [#7438](https://github.com/serverless/serverless/issues/7438) ([Michael Wolfenden](https://github.com/michael-wolfenden))
- **Templates:** Fix Azure Functions Python template ([#7452](https://github.com/serverless/serverless/issues/7452)) ([345b9e6](https://github.com/serverless/serverless/commit/345b9e654b246ef3186a0f3fdd56901a6316af2b)) ([Tanner Barlow](https://github.com/tbarlow12))

### [1.67.3](https://github.com/serverless/serverless/compare/v1.67.2...v1.67.3) (2020-04-08)

### Bug Fixes

- **Components:** Handle gently initialization errors ([#7556](https://github.com/serverless/serverless/issues/7556)) ([7b0c18e](https://github.com/serverless/serverless/commit/7b0c18ededa149687942fb3318fefb26656e9e9d)) ([Mariusz Nowak](https://github.com/medikoo))

### [1.67.2](https://github.com/serverless/serverless/compare/v1.67.1...v1.67.2) (2020-04-08)

## [1.67.1](https://github.com/serverless/serverless/compare/v1.67.0...v1.67.1) (2020-04-07)

### Bug Fixes

- **Standalone:** Improve performance in China by supporting dedicated mirror for binary downloads ([#7521](https://github.com/serverless/serverless/issues/7521)) ([8e85fe6](https://github.com/serverless/serverless/commit/8e85fe611b4b4d619e0ad4fd347d669af6418634)) ([Mariusz Nowak](https://github.com/medikoo))
- **AWS ALB:** Fix handling of provisioned concurrency ([#7285](https://github.com/serverless/serverless/issues/7285)) ([3138ef1](https://github.com/serverless/serverless/commit/3138ef1771a31a52429777241f67dcf07a69bebd)) ([Edward Goubely](https://github.com/cbm-egoubely))
- Recognize AWS Web Identify Credentials ([#7442](https://github.com/serverless/serverless/issues/7442)) ([001f56c](https://github.com/serverless/serverless/commit/001f56cf5a4c8b4ffeb6f9e9fcc27e73d2f10789)) ([Thomas Schaaf](https://github.com/thomaschaaf))

## [1.67.0](https://github.com/serverless/serverless/compare/v1.66.0...v1.67.0) (2020-03-19)

### Features

- **AWS Websocket:** `routeResponseSelectionExpression` setting ([#7233](https://github.com/serverless/serverless/issues/7233)) ([2d25e67](https://github.com/serverless/serverless/commit/2d25e678cb1390d3cfb8899f424ff4638b239ddc)), closes [#6130](https://github.com/serverless/serverless/issues/6130) ([DougHamil](https://github.com/DougHamil))

### Bug Fixes

- **AWS Lambda:** Respect external IAM role at destinations ([#7476](https://github.com/serverless/serverless/pull/7476)) ([7a3a45f](https://github.com/serverless/serverless/commit/7a3a45f0b3f2b42a0ab68b6f638d3d97fda7cf31)), closes [#7448](https://github.com/serverless/serverless/issues/7448) ([Mariusz Nowak](https://github.com/medikoo))
- **Templates:** Fix support for `~/..` paths ([#7381](https://github.com/serverless/serverless/issues/7381)) ([962506b](https://github.com/serverless/serverless/commit/962506b4356545870e18d570756240e602b5f541)) ([Ada Ye](https://github.com/yyylksdy))
- **AWS HTTP API:** Do not validate timeout when no `httpApi` event ([#7467](https://github.com/serverless/serverless/pull/7467)) ([841aac9](https://github.com/serverless/serverless/commit/841aac941fdfc65f55b321382cfd349bd5caa209)) ([Mariusz Nowak](https://github.com/medikoo))

## [1.66.0](https://github.com/serverless/serverless/compare/v1.65.0...v1.66.0) (2020-03-09)

### Features

- **AWS Lambda:** Support configuration of destinations ([#7261](https://github.com/serverless/serverless/pull/7261)) ([8ed6a6e](https://github.com/serverless/serverless/commit/8ed6a6e7d7efc2857c68acf6e7c641f6ad8fb37c)) ([Mariusz Nowak](https://github.com/medikoo))

### Bug Fixes

- **AWS Cognito:** Fix pool update handling ([#7418](https://github.com/serverless/serverless/pull/7418)) ([0898664](https://github.com/serverless/serverless/commit/0898664c6807a6f0530281be2615d210470420fe)) ([Mariusz Nowak](https://github.com/medikoo))
- **AWS HTTP API:** Ensure function `timeout` setting is respected ([#7420](https://github.com/serverless/serverless/pull/7420)) ([b52a41d](https://github.com/serverless/serverless/commit/b52a41d9ee08efc875815b239c7d25d32b3be92f)) ([Mariusz Nowak](https://github.com/medikoo))
- **AWS Websocket:** Fix AWS partition support ([#7430](https://github.com/serverless/serverless/issues/7430)) ([9b627fb](https://github.com/serverless/serverless/commit/9b627fbf7e69d123f60e31c27289788fed7115ae)) ([Austin J. Alexander](https://github.com/austinjalexander))
- **AWS S3:** Add source account to lambda permissions for S3 events ([#7417](https://github.com/serverless/serverless/issues/7417)) ([7d67f33](https://github.com/serverless/serverless/commit/7d67f33b085c29ce0e57431629e33e657b93c474)) ([Callum Smits](https://github.com/callumsmits))
- **Variables:** Relax pattern to allow non-ascii defaults ([#7431](https://github.com/serverless/serverless/issues/7431)) ([7310782](https://github.com/serverless/serverless/commit/73107822945a878abbdebe2309e8e9d87cc2858a)) ([Arben Bakiu](https://github.com/arbbakbenny))
- **Standalone:** Fix logic responsible for notifications about new versions ([#7412](https://github.com/serverless/serverless/pull/7412)) ([1565d03](https://github.com/serverless/serverless/commit/1565d038313b7939d6c9d9fdf8bfb4f95fd7027e)) ([AJ Stuyvenberg](https://github.com/astuyve))

## [1.65.0](https://github.com/serverless/serverless/compare/v1.64.1...v1.65.0) (2020-02-28)

### Features

- **AWS HTTP API:**
  - Support access logs configuration ([#7385](https://github.com/serverless/serverless/pull/7385)) ([f2cb89a](https://github.com/serverless/serverless/commit/f2cb89a3cadc34235ccd62c35beb165942fb60d6)) ([Mariusz Nowak](https://github.com/medikoo))
  - Support attachment to externally created API ([#7396](https://github.com/serverless/serverless/pull/7396)) ([f47b340](https://github.com/serverless/serverless/commit/f47b340e4fbe5163595225d450e857ae36211d98)) ([Mariusz Nowak](https://github.com/medikoo))
  - Support `timeout` configuration ([#7401](https://github.com/serverless/serverless/pull/7401)) ([df9846d](https://github.com/serverless/serverless/commit/df9846d9afa56bb7d5d8bc07b6a58c2f58eaf59e)) ([Mariusz Nowak](https://github.com/medikoo))
- **Components:** Support Cloud Components ([#7390](https://github.com/serverless/serverless/issues/7390)) ([0ed52f6](https://github.com/serverless/serverless/commit/0ed52f61de98101fd570bc6e7794a74ab7afa0ff)) ([Eslam Hefnawy](https://github.com/eahefnawy))
- **AWS API Gateway:** Support association of VPC endpoint ids ([#7382](https://github.com/serverless/serverless/issues/7382)) ([19012a9](https://github.com/serverless/serverless/commit/19012a9068357f307693823bc56bb2ce1d881a64)) ([Alexandre Tremblay](https://github.com/altrem))
- **AWS CloudFormation:** Support `resource.extensions` for safe resource extensions ([#7352](https://github.com/serverless/serverless/issues/7352)) ([08ec261](https://github.com/serverless/serverless/commit/08ec261a3cd34e7225f471cbeab8cef605ac61fc)) ([Geoff Baskwill](https://github.com/glb))

### Bug Fixes

- **AWS Local Invocation:**
  - Ensure AWS creds resolution for local docker invocation ([#7375](https://github.com/serverless/serverless/issues/7375)) ([90b3a8f](https://github.com/serverless/serverless/commit/90b3a8f81eea8fb27c24b2b05888e7f386ee47bd)) ([frozenbonito](https://github.com/frozenbonito))
  - Ensure AWS env vars in local invocation made with docker ([#7349](https://github.com/serverless/serverless/issues/7349)) ([c09f718](https://github.com/serverless/serverless/commit/c09f71897a67fe8ec98d460075f0f02b397f8ee5)) ([frozenbonito](https://github.com/frozenbonito))
  - Fix handler resolution (multi `.` case) for local invocation ([#7398](https://github.com/serverless/serverless/issues/7398)) ([d84e9e7](https://github.com/serverless/serverless/commit/d84e9e7d1e440b5bfaae39b4cfefd83f8ac2e8b9)) ([Arben Bakiu](https://github.com/arbbakbenny))
- **Standalone:** Ensure to bundle local invocation non Node.js artifcats ([#7409](https://github.com/serverless/serverless/pull/7409)) ([506ad86](https://github.com/serverless/serverless/commit/506ad863da1ceb78d2d8a0573dbc03c0db56f098)) ([Mariusz Nowak](https://github.com/medikoo))
- **AWS EventBridge:** Ensure AWS EventBrigde target ids fit 64 chars limit ([#7359](https://github.com/serverless/serverless/issues/7359)) ([103fdac](https://github.com/serverless/serverless/commit/103fdacc294ab87f4bd079847d05d9448fd4b494)) ([Frédéric Barthelet](https://github.com/fredericbarthelet))
- **AWS IAM:** Ensure consistency in role and policy names ([#7357](https://github.com/serverless/serverless/issues/7357)) ([9a0aaa8](https://github.com/serverless/serverless/commit/9a0aaa843b19cb5bc0ddfe9a25b96e3c64d82749)) ([Thomas Schaaf](https://github.com/thomaschaaf))
- **AWS SNS:** Fix handling of `redrivePolicy` ([#7277](https://github.com/serverless/serverless/issues/7277)) ([292b1ca](https://github.com/serverless/serverless/commit/292b1caf58583a7935673e22fc7f505b9f9871bc)) ([tcastelli](https://github.com/tcastelli))

### [1.64.1](https://github.com/serverless/serverless/compare/v1.64.0...v1.64.1) (2020-02-26)

### Bug Fixes

- **AWS HTTP API:** Configure default stage explicity ([#7383](https://github.com/serverless/serverless/issues/7383)) ([3d79a7a](https://github.com/serverless/serverless/commit/3d79a7a169fdc2c43c86d6b509f9151af32665dc)) ([Mariusz Nowak](https://github.com/medikoo))
- Follow symlinks when writing a config ([#7374](https://github.com/serverless/serverless/issues/7374)) ([3e1e1f4](https://github.com/serverless/serverless/commit/3e1e1f486c4f6e283e172c99d9a38838bfbe2ab6)) ([Neil Locketz](https://github.com/c0d3d))
- Service state path resolution ([#7388](https://github.com/serverless/serverless/issues/7388)) ([5017f03](https://github.com/serverless/serverless/commit/5017f038d6a8f35fc25ec7a239358a30ca15b745)) ([Arben Bakiu](https://github.com/arbbakbenny))
- When packaging do not crash on deps with no package.json ([#7368](https://github.com/serverless/serverless/issues/7368)) ([8518000](https://github.com/serverless/serverless/commit/8518000d4fbf3a6cf0a6e2f81bd6421e017a1b5f)) ([darko1979](https://github.com/darko1979))

## [1.64.0](https://github.com/serverless/serverless/compare/v1.63.0...v1.64.0) (2020-02-18)

### Features

- **AWS HTTP API:**
  - Support CORS configuration ([#7336](https://github.com/serverless/serverless/issues/7336)) ([ca69387](https://github.com/serverless/serverless/commit/ca693872855a59799ec22079d20d048b40ab33a1)) ([Mariusz Nowak](https://github.com/medikoo))
  - Support JWT authorizers ([#7346](https://github.com/serverless/serverless/issues/7346)) ([fbf99fa](https://github.com/serverless/serverless/commit/fbf99fa2abf9ce3bc13fc4a6c8439a650d3eaa4e)) ([Mariusz Nowak](https://github.com/medikoo))
- **AWS API Gateway:**
  - Support `provider.logs.restApi.roleManagedExternally` ([#7333](https://github.com/serverless/serverless/issues/7333)) ([9b701a4](https://github.com/serverless/serverless/commit/9b701a405627273fb54e411eb4e87bc085282c6b)) ([coyoteecd](https://github.com/coyoteecd))  
    (so CloudWatch IAM role access can be handled externally)
  - Support `authorizer.managedExternally` option for `http` event authorizers ([#7327](https://github.com/serverless/serverless/issues/7327)) ([7abb23e](https://github.com/serverless/serverless/commit/7abb23edc8dfbe5005ac716aa137330741759929)) ([Geoff Baskwill](https://github.com/glb))  
    (so permissions for lambda authorizers are handled externally)
- **AWS IAM:** Support `provider.rolePermissionsBoundary` to set IAM boundary ([#7319](https://github.com/serverless/serverless/issues/7319)) ([09466b5](https://github.com/serverless/serverless/commit/09466b5a172a743b1c2d5c1045c08f5c2ad32a2e)) ([Thomas Schaaf](https://github.com/thomaschaaf))
- **AWS ALB:** Support `provider.alb.targetGroupPrefix` setting ([#7322](https://github.com/serverless/serverless/issues/7322)) ([3910df1](https://github.com/serverless/serverless/commit/3910df1ba6a8b39367ce8d51adb90216251be2ba)) ([isen-ng](https://github.com/isen-ng) & [jinhong-](https://github.com/jinhong-))  
  (so ALB target groups are prefixed with common strings, and can be easily referenced externally)
- **AWS Kinesis:** Support Enhanced Fan-out (Consumer) streams ([#7320](https://github.com/serverless/serverless/issues/7320)) ([9eba218](https://github.com/serverless/serverless/commit/9eba2187f9565b39d31e88572c06ea2ccaa4bade)) ([Zac Charles](https://github.com/zaccharles))
- **AWS Local invocation:** Improve performance of invocations in Docker containers ([#7178](https://github.com/serverless/serverless/issues/7178)) ([f6d9bfd](https://github.com/serverless/serverless/commit/f6d9bfd6c6bb5cd49ee67ce20e35e78090c18ab3)) ([Richard Davison](https://github.com/richarddd))
- **AWS Deploy:**
  - Support `deploymentBucket.maxPreviousDeploymentArtifacts` customization ([#7283](https://github.com/serverless/serverless/issues/7283)) ([0241468](https://github.com/serverless/serverless/commit/024146885a913f545ebf8b0f5f6734b7650c64cc)) ([Edmundo Santos](https://github.com/rdsedmundo))
  - Support tweaking max concurrent artifact uploads count ([#7295](https://github.com/serverless/serverless/issues/7295)) ([0592a27](https://github.com/serverless/serverless/commit/0592a27dbc084eb9b96791f24c1ef636395e42dc)) ([Edmundo Santos](https://github.com/rdsedmundo))

### Bug Fixes

- **AWS HTTP API:** (design fix) Instead of creating AWS stage, publish to default stage in all cases ([#7331](https://github.com/serverless/serverless/issues/7331)) ([44c2342](https://github.com/serverless/serverless/commit/44c2342aeba76bd98c097a78be1d762eeccbbfd3)) ([Mariusz Nowak](https://github.com/medikoo))
- **AWS API Gateway:** Limit permission scope of authorizers ([#7300](https://github.com/serverless/serverless/issues/7300)) ([c05dcb3](https://github.com/serverless/serverless/commit/c05dcb3432c16fe5cf25bc3c796f9feb92e5421a)) ([Philipp Muens](https://github.com/pmuens))
- **AWS Websocket:** Fix route names normalization ([#7294](https://github.com/serverless/serverless/issues/7294)) ([33291c8](https://github.com/serverless/serverless/commit/33291c8d08c8edd82e807b8fbe3f1796bcfdb4ac)) ([tom-marsh](https://github.com/tom-marsh))

## [1.63.0](https://github.com/serverless/serverless/compare/v1.62.0...v1.63.0) (2020-02-05)

### Features

- **AWS HTTP API:** Initial basic routes configuration support ([69170d0](https://github.com/serverless/serverless/commit/69170d09a8595605cce9c9c8cafe0d676ea87746))
- Support `destinations` config on stream events ([#7262](https://github.com/serverless/serverless/issues/7262)) ([ea4ac26](https://github.com/serverless/serverless/commit/ea4ac262ea4b9efdebc1fc357ffe906900295823))
- Support rich and reusable S3 buckets configuration ([#7156](https://github.com/serverless/serverless/issues/7156)) ([382c0bf](https://github.com/serverless/serverless/commit/382c0bfc21b98fdadb8ad86340a97f6cc18ce84d))

### Bug Fixes

- Fix `sls logs` so it also covers output from aliases ([#7270](https://github.com/serverless/serverless/issues/7270)) ([4468805](https://github.com/serverless/serverless/commit/4468805d2a93224b63d99dc04f6c6056226af689)), closes [#7214](https://github.com/serverless/serverless/issues/7214)
- **Standalone:** Ensure to use proper CLI params parser ([f426ed7](https://github.com/serverless/serverless/commit/f426ed7077c67eac9785452b312ca1e179c201bf))

### [1.62.0](https://github.com/serverless/serverless/compare/v1.61.3...v1.62.0) (2020-01-29)

### Features

- Support `redrivePolicy` configuration on SNS events ([#7239](https://github.com/serverless/serverless/issues/7239)) ([4f27378](https://github.com/serverless/serverless/commit/4f273785f4b7cceaffd2fb6b9255e4187962d53c))
- Ensure deterministic WebSockets deployment id (so deployments are skipped when no changes are detected) ([#7248](https://github.com/serverless/serverless/issues/7248)) ([9f0131f](https://github.com/serverless/serverless/commit/9f0131fedf60e9104f38702d01e103b9a3b0f629))
- `azure-nodejs-typescript` template ([#7252](https://github.com/serverless/serverless/issues/7252)) ([0549d85](https://github.com/serverless/serverless/commit/0549d85bc0254a10d3314613892e335da2bc3722))

### Bug Fixes

- **Variables:** When resolving SSM parameter, ensure to retrieve status code from AWS error correctly ([bc5bbbe](https://github.com/serverless/serverless/commit/bc5bbbed3c050eb69262b3f9b6fbd53c563c9fb2)), closes [#7237](https://github.com/serverless/serverless/issues/7237)
- Do not overwrite `go.mod` on `make` in Go template ([#7245](https://github.com/serverless/serverless/issues/7245)) ([1793cf8](https://github.com/serverless/serverless/commit/1793cf8d7a55b85fc6505ae493dcca2292e443d2))

### [1.61.3](https://github.com/serverless/serverless/compare/v1.61.2...v1.61.3) (2020-01-21)

### Improvements

- Support `code` parameter on `ServerlessError` ([f6c5179](https://github.com/serverless/serverless/commit/f6c51796f886573679d3500b2007a314c8e4bd4d))

### [1.61.2](https://github.com/serverless/serverless/compare/v1.61.1...v1.61.2) (2020-01-15)

### Bug Fixes

- Separate AWS region and credentials resolution concern ([91525e8](https://github.com/serverless/serverless/commit/91525e889f08eefe0451df65e1207d53978030ef)). Fixes [serverless/enterprise-plugin#340](https://github.com/serverless/enterprise-plugin/issues/340)

### [1.61.1](https://github.com/serverless/serverless/compare/v1.61.0...v1.61.1) (2020-01-14)

### Bug Fixes

- **AWS APIGW:** Fix default resource policy configuration ([8814671](https://github.com/serverless/serverless/commit/8814671435a2b78ec281e527227e1b4a0fbbe093))
  Fixes regression introduced with [#7138](https://github.com/serverless/serverless/issues/7138)
  Closes [#7194](https://github.com/serverless/serverless/issues/7194) and [#7211](https://github.com/serverless/serverless/issues/7211)

## [1.61.0](https://github.com/serverless/serverless/compare/v1.60.5...v1.61.0) (2020-01-13)

### Features

- **Standalone:** Windows Chocolatey PM integration ([85b196f](https://github.com/serverless/serverless/commit/85b196ff4dd9fb64594bc1b362f882ee350dd01e))
- Add support for plain .git template URLs ([3cfa750](https://github.com/serverless/serverless/commit/3cfa7502e233819d060140b356483d9fd8799800))
- Enhance configuration options of cloudFront event ([#7170](https://github.com/serverless/serverless/issues/7170)) ([9591d5a](https://github.com/serverless/serverless/commit/9591d5a232c641155613d23b0f88ca05ea51b436)), closes [#7151](https://github.com/serverless/serverless/issues/7151), addresses [#6843](https://github.com/serverless/serverless/issues/6843) [#6785](https://github.com/serverless/serverless/issues/6785)
- Support `BisectBatchOnFunctionError` option on event streams ([#7105](https://github.com/serverless/serverless/issues/7105)) ([560ceee](https://github.com/serverless/serverless/commit/560ceee5b3abf90999c61074b8a94d5ef31e967b))
- support `RollbackConfiguration` in service config ([#7193](https://github.com/serverless/serverless/issues/7193)) ([5973c9f](https://github.com/serverless/serverless/commit/5973c9fd58631beaea45047345cac8d348e93911))

### Bug Fixes

- Fix CLI params resolution (switch to `yargs-parser`) ([#7187](https://github.com/serverless/serverless/issues/7187)) ([780fb46](https://github.com/serverless/serverless/commit/780fb46e726faf147ba16d190307bf1948ee53b3)), closes [#6083](https://github.com/serverless/serverless/issues/6083)
- **AWS Lambda:** Do not break permission resource ([5e63cee](https://github.com/serverless/serverless/commit/5e63cee340591af5aaa65828a6907fca445d76e4)), closes [#7189](https://github.com/serverless/serverless/issues/7189)
- Ensure CF stacks are deleted on failed creation attempt ([#7158](https://github.com/serverless/serverless/issues/7158)) ([53a18cb](https://github.com/serverless/serverless/commit/53a18cbff6d3d2d6698e98cf0dd8a7eba21fdf58)), closes [#6612](https://github.com/serverless/serverless/issues/6612)
- Fix and improve openwhisk-java-maven templates ([#7164](https://github.com/serverless/serverless/issues/7164)) ([41d7d0b](https://github.com/serverless/serverless/commit/41d7d0bf0798188284f38e0f4e3effadad1f8d42))
- Remove hard-coded AWS partitions ([#7175](https://github.com/serverless/serverless/issues/7175)) ([3236adb](https://github.com/serverless/serverless/commit/3236adb040f186cd606e5656cf85a05bd183e822))

### [1.60.5](https://github.com/serverless/serverless/compare/v1.60.4...v1.60.5) (2020-01-03)

### Bug Fixes

- **Standalone**
  - Ensure dashboard plugin policies are bundled ([4b5f531](https://github.com/serverless/serverless/commit/4b5f531d9ec293f1f228d572cd265361530135f7))
  - Ensure dashboard wrapper is bundled ([994555d](https://github.com/serverless/serverless/commit/994555d7d6eb7bf960adceed4a59a4f667a9d92d))
  - Workaround `pkg` [#420](https://github.com/zeit/pkg/issues/420) bug ([c94a614](https://github.com/serverless/serverless/commit/c94a6146762a2d50c9d746e70a699ffc9cffd9c8))
- **AWS Lambda:** Fix provisioned concurrency setup issues (remove no longer needed AWS issue workaround) ([4821ad2](https://github.com/serverless/serverless/commit/4821ad21a5da5622a5686a7dc6eafdcd90ffe538)), closes [#7137](https://github.com/serverless/serverless/issues/7137)
- **CLI**
  - Fix ambiguity of `-v` option ([074647c](https://github.com/serverless/serverless/commit/074647c50244b11573e5ece1cfd7429da0a9bf2f))
  - Recognize CLI aliases as documented ([7a804e1](https://github.com/serverless/serverless/commit/7a804e1c06b0991e2f9371b3bb794c660e2514d4)), closes [#7106](https://github.com/serverless/serverless/issues/7106)
- **Plugins:** Fix resolution of config when installing plugin ([b5dbdaf](https://github.com/serverless/serverless/commit/b5dbdafe5b4b03608ebb10d024fb6587e1ea7a40)), closes [#7130](https://github.com/serverless/serverless/issues/7130)
- **AWS APIGW:** Fix handling of removal of `resourcePolicy` setting ([e662a91](https://github.com/serverless/serverless/commit/e662a91d92651111c86b6e72eed57075be95decb)), closes [#6789](https://github.com/serverless/serverless/issues/6789)
- **Variables:** Ensure no same object instances are shared across config ([4893f7d](https://github.com/serverless/serverless/commit/4893f7d0c2168d3aa39b04ac040cd1797ed31431)), closes [#7098](https://github.com/serverless/serverless/issues/7098)

### [1.60.4](https://github.com/serverless/serverless/compare/v1.60.3...v1.60.4) (2019-12-23)

### Bug Fixes

- **AWS APIGW:** Fix handling of provisionedConcurrency: 0 setting ([efe6d02](https://github.com/serverless/serverless/commit/efe6d02e1ad9fa760a97f2c24d427e9791bcfd45)), closes [#7133](https://github.com/serverless/serverless/issues/7133)

### [1.60.3](https://github.com/serverless/serverless/compare/v1.60.2...v1.60.3) (2019-12-23)

### Bug Fixes

- **AWS APIGW:** Fix Rest API id detection when no API GW involved ([81096ca](https://github.com/serverless/serverless/commit/81096caf3d8e98932cd4314495a4fc107fab297a)), regression introduced with [#7126](https://github.com/serverless/serverless/issues/7126)

### [1.60.2](https://github.com/serverless/serverless/compare/v1.60.1...v1.60.2) (2019-12-23)

### Bug Fixes

- **AWS Lambda**
  - **Fix provisioned concurrency setup (closes [#7059](https://github.com/serverless/serverless/issues/7059)):**
    - Fix provisioned concurrency configuration. Configure on alias, and not on version. Thanks to that it can work with versioning enabled and changes to provisioned concurrency configuration are not immune to `Internal Failure` ([04a7657](https://github.com/serverless/serverless/commit/04a765715f3bb2cd5a41a9273b0623c2fe900691))
    - Workaround AWS issue related to alias redeployments ([56b9d3d](https://github.com/serverless/serverless/commit/56b9d3d41213f0fc90a48af1bcaf92233854acbb))
    - Ensure API Gateway endpoints point provisioned version ([67d27ed](https://github.com/serverless/serverless/commit/67d27edbfe420e5133d2acf970979bdfaa1d5905)),
  - Fix CloudWatch logs creation access ([a2db989](https://github.com/serverless/serverless/commit/a2db9895398d90c42a613d0b1328f1b124aada0c)), closes [#6241](https://github.com/serverless/serverless/issues/6241) [#6692](https://github.com/serverless/serverless/issues/6692)
- **AWS API Gateway:**
  - Ensure to apply API GW stage settings in case of services having no endpoints configured ([e93e6f4](https://github.com/serverless/serverless/commit/e93e6f4028971b210310dc60dff04bf33ca1d3b9)), closes [#7036](https://github.com/serverless/serverless/issues/7036)
- Fix custom resource lambda artifact generation ([7132af3](https://github.com/serverless/serverless/commit/7132af3217b6b46b5098bf6f2a96c50e27b588ef))

### [1.60.1](https://github.com/serverless/serverless/compare/v1.60.0...v1.60.1) (2019-12-20)

### Bug Fixes

- Ensure necessary IAM role for handling existing cognito pools ([5c6de5c](https://github.com/serverless/serverless/commit/5c6de5c3ace69c1c5b91f1e1698d6e65f7a0e9af)), closes [#6579](https://github.com/serverless/serverless/issues/6579)
- Fix support for relative plugins.localPath ([10ba8cb](https://github.com/serverless/serverless/commit/10ba8cbc46b751a63a7a604140ab28549d491b5c)), closes [#7117](https://github.com/serverless/serverless/issues/7117)
- Support different AWS partitions ([f353144](https://github.com/serverless/serverless/commit/f3531445f82276ba0bc14044452b64d240df47e9))

## [1.60.0](https://github.com/serverless/serverless/compare/v1.59.3...v1.60.0) (2019-12-18)

### Features

- **Binary installer**
  - `uninstall` command for installed binaries ([53e596f](https://github.com/serverless/serverless/commit/53e596fa6708aa1c3a4359c5679a898cfbd406ec))
  - `upgrade` command for installed binaries ([c4efd66](https://github.com/serverless/serverless/commit/c4efd66e4e9a808d8c79511af6cca7bc653bdec4))
  - Configure binaries generation ([49f6e1e](https://github.com/serverless/serverless/commit/49f6e1e8a57929862c79b6fea90c7515469bca7c))
  - Linux & macOS binary installer ([f0f9698](https://github.com/serverless/serverless/commit/f0f96980ee94727177f9306ab5bf31ac8e7e209b))
  - Recognise as standalone ([59bea09](https://github.com/serverless/serverless/commit/59bea09dad12bd8484042e773e5a1c716aaec4a7))
  - Script to upload generated binaries to GitHub release ([5563b28](https://github.com/serverless/serverless/commit/5563b284f265e20db5058922e65e08425e978efc))
- Draw CLI boxes with `boxen` package ([80f9a65](https://github.com/serverless/serverless/commit/80f9a6570fc139da1da7b0e53778d7fdc1ff507b))
- MaximumRetryAttempts config for stream ([998b6fd](https://github.com/serverless/serverless/commit/998b6fd296f54d5a05f1609b29cc09fbc541935f)), closes [#7012](https://github.com/serverless/serverless/issues/7012)
- Memoize resolution of dev deps exclusion paths ([#7091](https://github.com/serverless/serverless/issues/7091)) ([5143c2a](https://github.com/serverless/serverless/commit/5143c2ad3af84e198fb256b8cebf585aac3886e6))
- Support CF instructions in awsKmsKeyArn setting ([#7083](https://github.com/serverless/serverless/issues/7083)) ([f9b6507](https://github.com/serverless/serverless/commit/f9b650782539808e796c1544a9dc7f2d02603db1))
- Unconditionally display browser url ([c900900](https://github.com/serverless/serverless/commit/c90090048847c4280081a7b7fb1a8c3171cc7771))
- Update and improve aws-kotlin-jvm-gradle template ([#7072](https://github.com/serverless/serverless/issues/7072)) ([0b3a08a](https://github.com/serverless/serverless/commit/0b3a08afaaf520fe6c3d4ebaac1a12fbd83c1fe4))

### Bug Fixes

- Ensure not to autocomplete hidden commands ([3f7f532](https://github.com/serverless/serverless/commit/3f7f532b88c9bdcc25a2b53a93e11484131c28ab))
- Fix AWS partition reference in APIGW CloudWatch role setup ([fc74c28](https://github.com/serverless/serverless/commit/fc74c287f68deb20266d011d9376d13117c11161)), closes [#7100](https://github.com/serverless/serverless/issues/7100)
- Fix credentials validation in EC2 environment ([#6977](https://github.com/serverless/serverless/issues/6977)) ([f8ee027](https://github.com/serverless/serverless/commit/f8ee0279037ba35b4c32f5872fcff4e741898db1))
- Prevent uncaught exception in case of `open` util issue ([f29d169](https://github.com/serverless/serverless/commit/f29d1697dd89a418ca4aacac23b64b928e68f643))
- Recognize falsy values as CLI options defaults ([#7071](https://github.com/serverless/serverless/issues/7071)) ([7e0e903](https://github.com/serverless/serverless/commit/7e0e903c798cc6c5370a74048202cd0480e2be3d))

### [1.59.3](https://github.com/serverless/serverless/compare/v1.59.2...v1.59.3) (2019-12-09)

### Bug Fixes

- Do not set optional ParallelizationFactor when not explicitly set ([e74d1a0](https://github.com/serverless/serverless/commit/e74d1a0a6486fba1ca09c5eb54b36fcf552d60f4)), closes [#7049](https://github.com/serverless/serverless/issues/7049)
- Fix provisioned concurrency support ([be0ebb7](https://github.com/serverless/serverless/commit/be0ebb76e7d3860587a986c9da48209870e7990d)), closes [#7059](https://github.com/serverless/serverless/issues/7059)

### [1.59.2](https://github.com/serverless/serverless/compare/v1.59.1...v1.59.2) (2019-12-06)

### Bug Fixes

- Ensure to not create cognito pools marked as 'existing' ([fe546c5](https://github.com/serverless/serverless/commit/fe546c50d35b88b24556257182aacd9e24f07d1b))

### [1.59.1](https://github.com/serverless/serverless/compare/v1.59.0...v1.59.1) (2019-12-05)

### Bug Fixes

- Fix mishandling of cachedCredentials in invokeLocal ([699e78d](https://github.com/serverless/serverless/commit/699e78d251b7cbb3e6553c6d8554c2bf568be1fb)), closes [#7050](https://github.com/serverless/serverless/issues/7050), regression introduced with [#7044](https://github.com/serverless/serverless/issues/7044)

# 1.59.0 (2019-12-04)

- [Fix spelling and typos in docs, code variables and code comments](https://github.com/serverless/serverless/pull/6986)
- [Code cleanup and refactoring](https://github.com/serverless/serverless/pull/6990)
- [Add support for contentHandling - Fixes gh-6949](https://github.com/serverless/serverless/pull/6987)
- [Fix deployment bucket SSE documentation](https://github.com/serverless/serverless/pull/7000)
- [Make authorizer type check from #6150 case insensitive](https://github.com/serverless/serverless/pull/7001)
- [Govcloud custom resource fix](https://github.com/serverless/serverless/pull/6996)
- [Lint and style patches](https://github.com/serverless/serverless/pull/7004)
- [Fix/cors omit access control allow credentials on false](https://github.com/serverless/serverless/pull/6999)
- [Fix: remove `$context.status` from websocket access log format](https://github.com/serverless/serverless/pull/7014)
- [Clarifying Azure setup](https://github.com/serverless/serverless/pull/7015)
- [Expose ParallelizationFactor prop for Kinesis Streams](https://github.com/serverless/serverless/pull/7024)
- [Replace moment with dayjs](https://github.com/serverless/serverless/pull/7025)
- [Update AWS SQS event docs regarding FIFO queue trigger for Lambda](https://github.com/serverless/serverless/pull/7029)
- [Awsprovider - adding support for SDK sub-classes.](https://github.com/serverless/serverless/pull/7031)
- [Provide backoff for retryable aws requests and the option to adjust the cf status check interval via an environment variable](https://github.com/serverless/serverless/pull/6981)
- [Add page for best practices on CI/CD](https://github.com/serverless/serverless/pull/6988)
- [Optimize custom resources generation](https://github.com/serverless/serverless/pull/7032)
- [Update API GW stage settings only when explicitly set](https://github.com/serverless/serverless/pull/7033)
- [Do not apply APIGW wide settings on externally referenced APIGW](https://github.com/serverless/serverless/pull/7034)
- [Enable Content Trust checking when pulling lambci/lambda images](https://github.com/serverless/serverless/pull/6992)
- [Fix resolution of user configured APIGW](https://github.com/serverless/serverless/pull/7039)
- [Add option to change log level for websocket logs](https://github.com/serverless/serverless/pull/7035)
- [Support lambda provisioned concurrency](https://github.com/serverless/serverless/pull/7043)
- [Fix AWS creds handling](https://github.com/serverless/serverless/pull/7044)
- [Fix lambda provisioned concurrency setup](https://github.com/serverless/serverless/pull/7045)

## Meta

- [Comparison since last release](https://github.com/serverless/serverless/compare/v1.58.0...v1.59.0)

# 1.58.0 (2019-11-20)

- [Fix missing ALB trigger in console](https://github.com/serverless/serverless/pull/6926)
- [Add support for vpc link integration discussed as part of #5025](https://github.com/serverless/serverless/pull/6051)
- [Setup Codecov](https://github.com/serverless/serverless/pull/6924)
- [Fix handling of China region in S3 bucket policy](https://github.com/serverless/serverless/pull/6934)
- [Fix policy definition](https://github.com/serverless/serverless/pull/6937)
- [Fix typo in Tencent docs](https://github.com/serverless/serverless/pull/6935)
- [Add Knative provider template](https://github.com/serverless/serverless/pull/6936)
- [Add Knative documentation](https://github.com/serverless/serverless/pull/6930)
- [PLAT-1798 - set env vars for AWS creds from cached credentials…](https://github.com/serverless/serverless/pull/6938)
- [Add azure python to cli](https://github.com/serverless/serverless/pull/6945)
- [updated providers menu order in docs](https://github.com/serverless/serverless/pull/6955)
- [Update API Gateway tagging to use partition for deployed region](https://github.com/serverless/serverless/pull/6948)
- [Fix: use normalized maps in zipService.js](https://github.com/serverless/serverless/pull/6705)
- [Add support for multi-value headers in ALB events](https://github.com/serverless/serverless/pull/6940)
- [Improve config error handling](https://github.com/serverless/serverless/pull/6962)
- [sls-flask starter kit](https://github.com/serverless/serverless/pull/6967)
- [Add variable completion report if variable progress was reported](https://github.com/serverless/serverless/pull/6966)
- [Update docs links](https://github.com/serverless/serverless/pull/6975)
- [Update documentation to include information about tags](https://github.com/serverless/serverless/pull/6982)
- [Python3.8 support!](https://github.com/serverless/serverless/pull/6978)
- [Updates to CI/CD settings for the beta](https://github.com/serverless/serverless/pull/6972)
- [rename output variables to outputs](https://github.com/serverless/serverless/pull/6971)
- [Fix Tencent Template and Readme](https://github.com/serverless/serverless/pull/6984)
- [Default to Nodejs12.x runtime](https://github.com/serverless/serverless/pull/6983)
- [#6162: Support multiple schemas, don't overwrite RequestModels for each](https://github.com/serverless/serverless/pull/6954)
- [Support empty deploymentPrefix](https://github.com/serverless/serverless/pull/6941)

## Meta

- [Comparison since last release](https://github.com/serverless/serverless/compare/v1.57.0...v1.58.0)

# 1.57.0 (2019-11-06)

- [Note about how to move services to new apps](https://github.com/serverless/serverless/pull/6912)
- [Allow casting to boolean in Serverless variables](https://github.com/serverless/serverless/pull/6869)
- [Create distinct target groups for different ALBs](https://github.com/serverless/serverless/pull/6383)
- [sls create --help improvements](https://github.com/serverless/serverless/pull/6919)
- [Fix race conditions handling in stats requests](https://github.com/serverless/serverless/pull/6920)
- [Update AWS Limits on Lambda@Edge](https://github.com/serverless/serverless/pull/6922)
- [Fixes bug with sns-cross-region definition using psuedo params](https://github.com/serverless/serverless/pull/6879)
- [Add tencent-plugins english version docs](https://github.com/serverless/serverless/pull/6916)

## Meta

- [Comparison since last release](https://github.com/serverless/serverless/compare/v1.56.1...v1.57.0)

# 1.56.1 (2019-10-31)

- [Fix deployment bucket policy handling with custom bucket ](https://github.com/serverless/serverless/pull/6909)
- [Feat: aws-nodejs-typescript template improvements](https://github.com/serverless/serverless/pull/6904)

## Meta

- [Comparison since last release](https://github.com/serverless/serverless/compare/v1.56.0...v1.56.1)

# 1.56.0 (2019-10-31)

- [AWS - deployment bucket policy for HTTPS only](https://github.com/serverless/serverless/pull/6823)
- [Docs on renamed outputs and expanded support](https://github.com/serverless/serverless/pull/6870)
- [Fix minor typo](https://github.com/serverless/serverless/pull/6877)
- [Added mock integration documentation example](https://github.com/serverless/serverless/pull/6883)
- [Fix region error handling in Lambda@Edge implementation](https://github.com/serverless/serverless/pull/6886)
- [Allow specifying ApiGateway logs role ARN](https://github.com/serverless/serverless/pull/6747)
- [Adds unused memory alert](https://github.com/serverless/serverless/pull/6889)
- [Find origin by domain name and path](https://github.com/serverless/serverless/pull/6880)
- [fix minor typo in kubeless docs](https://github.com/serverless/serverless/pull/6896)
- [Add tencent provider create-template](https://github.com/serverless/serverless/pull/6898)

## Meta

- [Comparison since last release](https://github.com/serverless/serverless/compare/v1.55.1...v1.56.0)

# 1.55.1 (2019-10-23)

- [Allow plugins to customize what flags are supported during interactive cli](https://github.com/serverless/serverless/pull/6697)

## Meta

- [Comparison since last release](https://github.com/serverless/serverless/compare/v1.55.0...v1.55.1)

# 1.55.0 (2019-10-23)

- [Allow empty arrays in overrides](https://github.com/serverless/serverless/pull/6813)
- [Make question mark available as variables fallback](https://github.com/serverless/serverless/pull/6808)
- [Improve plugins resolution and initialization flow](https://github.com/serverless/serverless/pull/6814)
- [Azure Python template](https://github.com/serverless/serverless/pull/6822)
- [Chore - stop using deprecated 'new Buffer()' method.](https://github.com/serverless/serverless/pull/6829)
- [AWS - adding naming function for S3 compiled template file name.](https://github.com/serverless/serverless/pull/6828)
- [Span docs! and full `serverless_sdk` docs](https://github.com/serverless/serverless/pull/6809)
- [Fix perms with several CloudWatch log subscriptions](https://github.com/serverless/serverless/pull/6827)
- [Fixing an Azure docs broken link](https://github.com/serverless/serverless/pull/6838)
- [Adding note to Azure nodejs template](https://github.com/serverless/serverless/pull/6839)
- [Updated Azure Functions documentation](https://github.com/serverless/serverless/pull/6840)
- [Support for NotAction and NotResource in IAM role statements](https://github.com/serverless/serverless/pull/6842)
- [added frontmatter to sdk docs](https://github.com/serverless/serverless/pull/6845)
- [Setup <tab> completion via CLI command and interactive CLI step](https://github.com/serverless/serverless/pull/6835)
- [Upgrade gradle version](https://github.com/serverless/serverless/pull/6855)
- [Update Google provider documentation for functions](https://github.com/serverless/serverless/pull/6854)
- [SNS integration tests](https://github.com/serverless/serverless/pull/6846)
- [SQS integration tests](https://github.com/serverless/serverless/pull/6847)
- [Streams integration tests](https://github.com/serverless/serverless/pull/6848)
- [Improvements on SQS docs as suggested on #6516](https://github.com/serverless/serverless/pull/6853)
- [Schedule integration tests](https://github.com/serverless/serverless/pull/6851)
- [Update event documentation](https://github.com/serverless/serverless/pull/6857)
- [Upgrade groovy/gradle/plugin versions and dependencies (aws-groovy-gradle)](https://github.com/serverless/serverless/pull/6862)
- [Upgrade gradle/plugins version and dependencies (aws-clojure-gradle)](https://github.com/serverless/serverless/pull/6861)
- [IoT integration tests](https://github.com/serverless/serverless/pull/6837)
- [Update https-proxy-agent dependency](https://github.com/serverless/serverless/pull/6866)
- [Allow to use Ref in stream arn property](https://github.com/serverless/serverless/pull/6856)
- [Add Tests for resolveFilePathsFromPatterns()](https://github.com/serverless/serverless/pull/6825)
- [Integration tests improvements and fixes](https://github.com/serverless/serverless/pull/6867)
- [Honor cfnRole in custom resources](https://github.com/serverless/serverless/pull/6871)

## Meta

- [Comparison since last release](https://github.com/serverless/serverless/compare/v1.54.0...v1.55.0)

# 1.54.0 (2019-10-09)

- [Fixing typos in variable names](https://github.com/serverless/serverless/pull/6746)
- [Simplify GitHub Issue / PR templates](https://github.com/serverless/serverless/pull/6753)
- [Capture and span docs](https://github.com/serverless/serverless/pull/6757)
- [Automate keeping the sfe-next branch upto date](https://github.com/serverless/serverless/pull/6743)
- [Update dependencies in aws-scala-sbt template](https://github.com/serverless/serverless/pull/6754)
- [PR Template --> Hide useful scripts in expandable section](https://github.com/serverless/serverless/pull/6763)
- [Doc refactoring and new features](https://github.com/serverless/serverless/pull/6758)
- [doc: add cosmosdb events doc](https://github.com/serverless/serverless/pull/6794)
- [Showcase how to use AWS SDK in sls helpers](https://github.com/serverless/serverless/pull/6788)
- [Issue 4867 - Allowing InvokeBridge to find handleRequest method from super classes](https://github.com/serverless/serverless/pull/6791)
- [Update Azure environment variable documentation](https://github.com/serverless/serverless/pull/6798)
- [Update quick-start.md](https://github.com/serverless/serverless/pull/6802)
- [Add Questions issue template that navigate users to forums](https://github.com/serverless/serverless/pull/6786)
- [Update SLS Deploy Documentation](https://github.com/serverless/serverless/pull/6790)
- [S3 Block Public Access](https://github.com/serverless/serverless/pull/6779)
- [Documentation for CI/CD](https://github.com/serverless/serverless/pull/6767)
- [Added logging Implementation for serverless openwhisk-nodejs template](https://github.com/serverless/serverless/pull/6806)

## Meta

- [Comparison since last release](https://github.com/serverless/serverless/compare/v1.53.0...v1.54.0)

# 1.53.0 (2019-09-25)

- [Respect logRetentionInDays in log group for websocket](https://github.com/serverless/serverless/pull/6658)
- [Remove requirement for an existing AWS profile on sls package command](https://github.com/serverless/serverless/pull/6564)
- [Adding docs on using captureError](https://github.com/serverless/serverless/pull/6670)
- [Make minor correction to CONTRIBUTING.md.](https://github.com/serverless/serverless/pull/6682)
- [[Docs] Added clarification on specifying SNS ARN](https://github.com/serverless/serverless/pull/6678)
- [Fix regular expression escaping in aws plugin.](https://github.com/serverless/serverless/pull/6689)
- [Update Azure quickstart and Azure Node.js project README](https://github.com/serverless/serverless/pull/6376)
- [Update Azure CLI Reference Docs](https://github.com/serverless/serverless/pull/6380)
- [Docs: update and clean up hello world app documentation](https://github.com/serverless/serverless/pull/6664)
- [Update Azure provider guide docs](https://github.com/serverless/serverless/pull/6403)
- [Update azure nodejs template](https://github.com/serverless/serverless/pull/6626)
- [Move common test utils to @serverless/test](https://github.com/serverless/serverless/pull/6660)
- [Add testing docs](https://github.com/serverless/serverless/pull/6696)
- [Add aliyun provider](https://github.com/serverless/serverless/pull/4922)
- [Update homepage in package.json to point to the docs](https://github.com/serverless/serverless/pull/6703)
- [Fix typo](https://github.com/serverless/serverless/pull/6712)
- [Truncated aliyun events menuText](https://github.com/serverless/serverless/pull/6708)
- [Added Components Versions](https://github.com/serverless/serverless/pull/6702)
- [Add commas when specifying Google roles for legibility](https://github.com/serverless/serverless/pull/6707)
- [Add Theodo to the consultants section of the README](https://github.com/serverless/serverless/pull/6713)
- [Remove incorrect AWS Access Role test instruction](https://github.com/serverless/serverless/pull/6686)
- [Feat: add qualifier option to invoke command](https://github.com/serverless/serverless/pull/6711)
- [Upgrade @serverless/test to v2](https://github.com/serverless/serverless/pull/6714)
- [Allow plugins not in registry to be installed](https://github.com/serverless/serverless/pull/6719)
- [PLAT-1599 Modularize interactive AWS setup](https://github.com/serverless/serverless/pull/6639)
- [Documented url+zip deploy strategy for serverless-kubeless](https://github.com/serverless/serverless/pull/6721)
- [Improve message for Windows users in AWS credentials setup](https://github.com/serverless/serverless/pull/6728)
- [Fix custom resources install](https://github.com/serverless/serverless/pull/6742)
- [Add support for MaximumBatchingWindowInSeconds property on stream events](https://github.com/serverless/serverless/pull/6741)
- [Alibaba Docs Update](https://github.com/serverless/serverless/pull/6744)
- [Update Jackson versions](https://github.com/serverless/serverless/pull/6748)
- [Improvements to stats handling](https://github.com/serverless/serverless/pull/6749)

## Meta

- [Comparison since last release](https://github.com/serverless/serverless/compare/v1.52.2...v1.53.0)

# 1.52.2 (2019-09-20)

- [Lock graceful-fs at 4.2.1](https://github.com/serverless/serverless/pull/6717)

## Meta

- [Comparison since last release](https://github.com/serverless/serverless/compare/v1.52.1...v1.52.2)

# 1.52.1 (2019-09-19)

- [Change how enterprise plugin async init is preformed](https://github.com/serverless/serverless/pull/6687)

## Meta

- [Comparison since last release](https://github.com/serverless/serverless/compare/v1.52.0...v1.52.1)

# 1.52.0 (2019-09-11)

- [Add initialize lifecycle event](https://github.com/serverless/serverless/pull/6601)
- [Fix API Gateway name not being resolved API Gateway Resource not in main stack](https://github.com/serverless/serverless/pull/6611)
- [Support optional CloudWatch logs writing for custom resource lambdas](https://github.com/serverless/serverless/pull/6608)
- [Ensure inquirer's chalk override works through symlinks](https://github.com/serverless/serverless/pull/6616)
- [Fixes aws partition name in apigateway resourceArn to support GovCloud](https://github.com/serverless/serverless/pull/6615)
- [Do not retry on AWS 403 errors](https://github.com/serverless/serverless/pull/6618)
- [Fix overriding package settings after packaging function](https://github.com/serverless/serverless/pull/6606)
- [null](https://github.com/serverless/serverless/pull/1)
- [Download templates from a Bitbucket Server](https://github.com/serverless/serverless/pull/6604)
- [Update Readme to replace SC5.io with nordcloud.com](https://github.com/serverless/serverless/pull/6622)
- [Add plugin hooks to define config variable getters](https://github.com/serverless/serverless/pull/6566)
- [Allow for tail on GetAtt parsing](https://github.com/serverless/serverless/pull/6624)
- [Resolve empty config object for an empty config file](https://github.com/serverless/serverless/pull/6631)
- [Remove enterprise from upgrade notes](https://github.com/serverless/serverless/pull/6625)
- [Add support for Lambda@Edge](https://github.com/serverless/serverless/pull/6512)
- [Tests for interactive CLI ](https://github.com/serverless/serverless/pull/6635)
- [Support functions without events in CloudFront remove logging](https://github.com/serverless/serverless/pull/6645)
- [Add support for Condition and DependsOn](https://github.com/serverless/serverless/pull/6642)
- [Improve plugin loading error reporting](https://github.com/serverless/serverless/pull/6646)
- [Use hooks to log Lambda@Edge removal reminder](https://github.com/serverless/serverless/pull/6652)
- [Quickfix "too many open files" issue on Windows](https://github.com/serverless/serverless/pull/6653)
- [Bump sfe plugin!](https://github.com/serverless/serverless/pull/6654)
- [replace use of tenant with org in docs & templates](https://github.com/serverless/serverless/pull/6655)
- [Update insights.md](https://github.com/serverless/serverless/pull/6663)

## Meta

- [Comparison since last release](https://github.com/serverless/serverless/compare/v1.51.0...v1.52.0)

# 1.51.0 (2019-08-28)

- [AWS API Gateway customize log level](https://github.com/serverless/serverless/pull/6542)
- [Fix retained layer logical id](https://github.com/serverless/serverless/pull/6545)
- [add docs for options misused in #6546](https://github.com/serverless/serverless/pull/6547)
- [Fix: Remove Bluebird promise warning when NODE_ENV=development](https://github.com/serverless/serverless/pull/6556)
- [AWS API Gateway set value of provider.logRetentionInDays for log group expiration](https://github.com/serverless/serverless/pull/6548)
- [Fix support for external websocketApiId](https://github.com/serverless/serverless/pull/6543)
- [Ensure AWS SDK is mocked for tests that call it](https://github.com/serverless/serverless/pull/6571)
- [do not log warnings on empty arrays](https://github.com/serverless/serverless/pull/6554)
- [API Gateway enable/disable access/execution logs](https://github.com/serverless/serverless/pull/6578)
- [Allow unresolved Rest API id with provider.tags setting](https://github.com/serverless/serverless/pull/6586)
- [Improve error reporting](https://github.com/serverless/serverless/pull/6585)
- [Fix exclusion of Yarn logs in Lambda packages](https://github.com/serverless/serverless/pull/6589)
- [Improve Rest API id resolution for SDK updates](https://github.com/serverless/serverless/pull/6587)
- [Fix ServerlessError handling](https://github.com/serverless/serverless/pull/6588)
- [Style updates for docs](https://github.com/serverless/serverless/pull/6596)
- [PLAT-1629 - Fix custom resource lambda naming](https://github.com/serverless/serverless/pull/6599)
- [Ensure API Gateway CloudWatch role is setup via custom resource](https://github.com/serverless/serverless/pull/6591)

## Meta

- [Comparison since last release](https://github.com/serverless/serverless/compare/v1.50.1...v1.51.0)

# 1.50.1 (2019-08-26)

- [add `interactiveCli:end lifecycle hook & bump dashboard plugin dep`](https://github.com/serverless/serverless/pull/6549)

## Meta

- [Comparison since last release](https://github.com/serverless/serverless/compare/v1.50.0...v1.50.1)

# 1.50.0 (2019-08-14)

- [Render event information in aws-ruby handler template](https://github.com/serverless/serverless/pull/6478)
- [Adding ap-south-1 to supported region list](https://github.com/serverless/serverless/pull/6473)
- [Fix invalid path char in GoLang packaging on Windows](https://github.com/serverless/serverless/pull/6484)
- [Multiple event definitions for existing S3 bucket](https://github.com/serverless/serverless/pull/6477)
- [Remove Enterprise and Platform from log info](https://github.com/serverless/serverless/pull/6501)
- [Allow AWS Subscription Filters to be reordered](https://github.com/serverless/serverless/pull/6471)
- [Check if more than 1 existing bucket is configured](https://github.com/serverless/serverless/pull/6506)
- [Multiple event definitions for existing Cognito User Pools](https://github.com/serverless/serverless/pull/6491)
- [Improve error handling](https://github.com/serverless/serverless/pull/6502)
- [Add PreTokenGeneration & UserMigration Cognito triggers](https://github.com/serverless/serverless/pull/6511)
- [Add Twilio Runtime to create templates](https://github.com/serverless/serverless/pull/6467)
- [Update kubeless guide docs](https://github.com/serverless/serverless/pull/6513)
- [Fix ImportValue handling in existing S3 buckets #6416](https://github.com/serverless/serverless/pull/6417)
- [Improve interactive AWS creds flow](https://github.com/serverless/serverless/pull/6449)
- [Retain existing Cognito User Pool config](https://github.com/serverless/serverless/pull/6519)
- [Switch integration tests runner from Jest to Mocha](https://github.com/serverless/serverless/pull/6517)
- [Change strategy for deciding to deploy new function.](https://github.com/serverless/serverless/pull/6520)
- [Fix support for EventBridge partner event sources](https://github.com/serverless/serverless/pull/6518)
- [fix(GITHUB-6525-5172): Rewrite copyDirContentsSyncAllow to call fs-extra::copySync() on the directories instead of calling it on the files to copy individually](https://github.com/serverless/serverless/pull/6526)
- [Do not crash CI on Coveralls error](https://github.com/serverless/serverless/pull/6535)
- [Only add merged IAM policies for Lambda when they will be used (#6262)](https://github.com/serverless/serverless/pull/6534)
- [Setup APIGW CloudWatch role via custom resource](https://github.com/serverless/serverless/pull/6531)
- [Fix deploy command if package.individually set on a function-level](https://github.com/serverless/serverless/pull/6537)

## Meta

- [Comparison since last release](https://github.com/serverless/serverless/compare/v1.49.0...v1.50.0)

# 1.49.0 (2019-07-30)

- [Remove hard coded partition when validating subscription filters](https://github.com/serverless/serverless/pull/6446)
- [Fix cross-account/cross-regions SNS subscriptions to topics with the same name](https://github.com/serverless/serverless/pull/6445)
- [Add EventBridge event source](https://github.com/serverless/serverless/pull/6397)
- [Update invoke-local.md documentation](https://github.com/serverless/serverless/pull/6466)
- [Doc new insights](https://github.com/serverless/serverless/pull/6469)
- [New error insight alert doc update to reflect per execution inspection](https://github.com/serverless/serverless/pull/6472)
- [Existing S3 bucket fixes](https://github.com/serverless/serverless/pull/6456)

## Meta

- [Comparison since last release](https://github.com/serverless/serverless/compare/v1.48.4...v1.49.0)

# 1.48.4 (2019-07-25)

- [Add note for supported version of existing bucket feature](https://github.com/serverless/serverless/pull/6435)
- [Support in interactive flow for SFE provided AWS creds](https://github.com/serverless/serverless/pull/6440)
- [Fix sls package regression caused by cred fail fast](https://github.com/serverless/serverless/pull/6447)

## Meta

- [Comparison since last release](https://github.com/serverless/serverless/compare/v1.48.3...v1.48.4)

# 1.48.3 (2019-07-23)

- [Issue 6364 request path](https://github.com/serverless/serverless/pull/6422)
- [Remove spaces from Cognito Pool Name](https://github.com/serverless/serverless/pull/6419)
- [Use slss.io for links](https://github.com/serverless/serverless/pull/6428)
- [Fix regression in EC2 & CodeBuild caused by missing creds check](https://github.com/serverless/serverless/pull/6427<Paste>)

## Meta

- [Comparison since last release](https://github.com/serverless/serverless/compare/v1.48.2...v1.48.3)

# 1.48.2 (2019-07-19)

- [Fix issues in post install and pre uninstall scripts](https://github.com/serverless/serverless/pull/6415)
-

## Meta

- [Comparison since last release](https://github.com/serverless/serverless/compare/v1.48.1...v1.48.2)

# 1.48.1 (2019-07-19)

- [Use Python3 for Python in interactive setup](https://github.com/serverless/serverless/pull/6406)
- [Fixing broken link for Node install.](https://github.com/serverless/serverless/pull/6405)
- [Added Cloud Build option for serverless deploy guide](https://github.com/serverless/serverless/pull/6401)
- [Changed AWS subscription filters to use function object name](https://github.com/serverless/serverless/pull/6402)
- [Strip trailing comment when renaming a service](https://github.com/serverless/serverless/pull/6408)
- [Improve tracking reliability](https://github.com/serverless/serverless/pull/6410)

## Meta

- [Comparison since last release](https://github.com/serverless/serverless/compare/v1.48.0...v1.48.1)

# 1.48.0 (2019-07-18)

- [SFE plugin & sdk version info](https://github.com/serverless/serverless/pull/6344)
- [Allow optionally splitting SSM parameter value for StringList type](https://github.com/serverless/serverless/pull/6365)
- [Cross region SNS Trigger](https://github.com/serverless/serverless/pull/6366)
- [Fix typo](https://github.com/serverless/serverless/pull/6379)
- [Add SLS_NO_WARNINGS env var](https://github.com/serverless/serverless/pull/6345)
- [Fix async S3 test](https://github.com/serverless/serverless/pull/6385)
- [Fix AWS secret access key validation in interactive CLI](https://github.com/serverless/serverless/pull/6387)
- [Improve post install message](https://github.com/serverless/serverless/pull/6388)
- [PLAT-1385 Ensure expected service name in interactively created project](https://github.com/serverless/serverless/pull/6386)
- [Updated gradle and kotlin.js gradle plugin fixing #5598](https://github.com/serverless/serverless/pull/6372)
- [actually update the right aws creds link interactive setup aws](https://github.com/serverless/serverless/pull/6395)
- [Integrating Components](https://github.com/serverless/serverless/pull/6350)
- [Add support for existing Cognito User Pools](https://github.com/serverless/serverless/pull/6362)
- [Add the missing colon](https://github.com/serverless/serverless/pull/6398)

## Meta

- [Comparison since last release](https://github.com/serverless/serverless/compare/v1.47.0...v1.48.0)

# 1.47.0 (2019-07-10)

- [Add Onica as a Consultant](https://github.com/serverless/serverless/pull/6300)
- [Correct typo](https://github.com/serverless/serverless/pull/6301)
- [Adapt new ESLint and Prettier configuration](https://github.com/serverless/serverless/pull/6284)
- [Ensure deploy is triggered in CI](https://github.com/serverless/serverless/pull/6306)
- [Remove jsbeautify configuration](https://github.com/serverless/serverless/pull/6309)
- [Improve PR template](https://github.com/serverless/serverless/pull/6308)
- [Allow users to specify API Gateway Access Log format](https://github.com/serverless/serverless/pull/6299)
- [Fix service.provider.region resolution](https://github.com/serverless/serverless/pull/6317)
- [Add null as a consultant](https://github.com/serverless/serverless/pull/6323)
- [Update very minor typo in credentials.md](https://github.com/serverless/serverless/pull/6321)
- [Expose non-errors in informative way](https://github.com/serverless/serverless/pull/6318)
- [Fix async leaks detection conditional](https://github.com/serverless/serverless/pull/6319)
- [Typo fix in AWS ALB event documentation](https://github.com/serverless/serverless/pull/6325)
- [Websockets: fix passing log group ARN](https://github.com/serverless/serverless/pull/6310)
- [Specify invoke local option in the guide](https://github.com/serverless/serverless/pull/6327)
- [Update Webpack version and usage of aws-nodejs-ecma-script template](https://github.com/serverless/serverless/pull/6324)
- [Make ALB event target group names unique](https://github.com/serverless/serverless/pull/6322)
- [Improve Travis CI conf](https://github.com/serverless/serverless/pull/6330)
- [Support for Github Entreprise in sls create](https://github.com/serverless/serverless/pull/6332)
- [Merge patch 1.46.1 release artifacts back into master](https://github.com/serverless/serverless/pull/6343)
- [Add support for existing S3 buckets](https://github.com/serverless/serverless/pull/6290)
- [PLAT-1202 - Interactive `serverless` create](https://github.com/serverless/serverless/pull/6294)
- [PLAT-1091 - message in `npm i` output about the `serverless` quickstart command](https://github.com/serverless/serverless/pull/6238)

## Meta

- [Comparison since last release](https://github.com/serverless/serverless/compare/v1.46.1...v1.47.0)

# 1.46.1 (2019-06-28)

- [Fix service.provider.region resolution](https://github.com/serverless/serverless/pull/6317)
- [Ensure deploy is triggered in CI](https://github.com/serverless/serverless/pull/6306)

## Meta

- [Comparison since last release](https://github.com/serverless/serverless/compare/v1.46.0...v1.46.1)

# 1.46.0 (2019-06-26)

- [Fix formatting issue with Markdown link](https://github.com/serverless/serverless/pull/6228)
- [Update docs | dont use provider.tags with shared API Gateway](https://github.com/serverless/serverless/pull/6225)
- [Fix: Update azure template](https://github.com/serverless/serverless/pull/6258)
- [Improve user message](https://github.com/serverless/serverless/pull/6254)
- [Reference custom ApiGateway for models and request validators if conf…](https://github.com/serverless/serverless/pull/6231)
- [Ensure integration tests do not fail when run concurrently](https://github.com/serverless/serverless/pull/6256)
- [Improve integration test experience](https://github.com/serverless/serverless/pull/6253)
- [Fix lambda integration timeout response template](https://github.com/serverless/serverless/pull/6255)
- [Fix duplicate packaging issue](https://github.com/serverless/serverless/pull/6244)
- [Fix Travis configuration for branch/tag runs](https://github.com/serverless/serverless/pull/6265)
- [fixed a typo 🖊](https://github.com/serverless/serverless/pull/6275)
- [Fix #6267](https://github.com/serverless/serverless/pull/6268)
- [#6017 Allow to load plugin from path](https://github.com/serverless/serverless/pull/6261)
- [Added correction based on community feedback](https://github.com/serverless/serverless/pull/6286)
- [Remove package-lock.json and shrinkwrap scripts](https://github.com/serverless/serverless/pull/6280)
- [Remove README redundant link](https://github.com/serverless/serverless/pull/6288)
- [Remove default stage value in provider object](https://github.com/serverless/serverless/pull/6200)
- [Use naming to get stackName](https://github.com/serverless/serverless/pull/6285)
- [Fix typo in link to ALB docs](https://github.com/serverless/serverless/pull/6292)
- [Add ip, method, header and query conditions to ALB events](https://github.com/serverless/serverless/pull/6293)
- [Feature/support external websocket api](https://github.com/serverless/serverless/pull/6272)

## Meta

- [Comparison since last release](https://github.com/serverless/serverless/compare/v1.45.1...v1.46.0)

# 1.45.1 (2019-06-12)

- [Fix IAM policies setup for functions with custom name](https://github.com/serverless/serverless/pull/6240)
- [Fix Travis CI deploy config](https://github.com/serverless/serverless/pull/6234)

## Meta

- [Comparison since last release](https://github.com/serverless/serverless/compare/v1.45.0...v1.45.1)

# 1.45.0 (2019-06-12)

- [Add `--config` option](https://github.com/serverless/serverless/pull/6216)
- [Fix and improve ESlint config](https://github.com/serverless/serverless/pull/6188)
- [Tests: Fix mocha config](https://github.com/serverless/serverless/pull/6187)
- [Thorough integration testing](https://github.com/serverless/serverless/pull/6148)
- [Tests: Isolation improvements](https://github.com/serverless/serverless/pull/6186)
- [Add support for Websocket Logs](https://github.com/serverless/serverless/pull/6088)
- [Cleanup and improve Travis CI configuration](https://github.com/serverless/serverless/pull/6178)
- [Tests: Fix stub configuration](https://github.com/serverless/serverless/pull/6205)
- [Tests: Upgrade Sinon](https://github.com/serverless/serverless/pull/6206)
- [Add Application Load Balancer event source](https://github.com/serverless/serverless/pull/6073)
- [Do not run integration tests for PR's](https://github.com/serverless/serverless/pull/6207)
- [Adding a validation to validation.js script](https://github.com/serverless/serverless/pull/6192)
- [Tests: Upgrade dependencies, improve isolation and experience on Windows](https://github.com/serverless/serverless/pull/6208)
- [Add support for S3 hosted package artifacts](https://github.com/serverless/serverless/pull/6196)
- [Remove root README generator](https://github.com/serverless/serverless/pull/6215)
- [Myho/npm lint fix](https://github.com/serverless/serverless/pull/6217)
- [Use common prefix for log groups permissions at Lambdas' execution roles](https://github.com/serverless/serverless/pull/6212)
- [Update Scala version to 2.13.0 for aws-scala-sbt template](https://github.com/serverless/serverless/pull/6222)

## Meta

- [Comparison since last release](https://github.com/serverless/serverless/compare/v1.44.1...v1.45.0)

# 1.44.1 (2019-05-28)

- [Fix enterprise plugin lookup in global yarn installs](https://github.com/serverless/serverless/pull/6183)

## Meta

- [Comparison since last release](https://github.com/serverless/serverless/compare/v1.44.0...v1.44.1)

# 1.44.0 (2019-05-28)

- [Built in integration of Serverless Enterprise](https://github.com/serverless/serverless/pull/6074)
- [Setup Travis Windows support / Remove AppVeyor](https://github.com/serverless/serverless/pull/6132)
- [Update required Node.js version / Add version check](https://github.com/serverless/serverless/pull/6077)
- [Add scopes for cognito type APIGW referenced authorizer ](https://github.com/serverless/serverless/pull/6150)
- [Do not throw error if authorizer has empty claims](https://github.com/serverless/serverless/pull/6121)
- [Tests: Patch mocha bugs and fix broken async flow cases](https://github.com/serverless/serverless/pull/6157)
- [Fix tagging API Gateway stage fails if tag contains special characters like space](https://github.com/serverless/serverless/pull/6139)
- [Solve the problem of principal format in China region](https://github.com/serverless/serverless/pull/6127)
- [Upgrade mocha, switch from istanbul to nyc, improve tests configuration](https://github.com/serverless/serverless/pull/6169)

## Meta

- [Comparison since last release](https://github.com/serverless/serverless/compare/v1.43.0...v1.44.0)

# 1.43.0 (2019-05-20)

- [Update services.md](https://github.com/serverless/serverless/pull/6138)
- [Azure: exclude development dependency files when packaging functions](https://github.com/serverless/serverless/pull/6137)
- [Update release process docs and toolings](https://github.com/serverless/serverless/pull/6113)
- [Update AWS Node.js runtime to version 10](https://github.com/serverless/serverless/pull/6142)
- [Fix tests setup issues](https://github.com/serverless/serverless/pull/6147)

## Meta

- [Comparison since last release](https://github.com/serverless/serverless/compare/v1.42.3...v1.43.0)

# 1.42.3 (2019-05-14)

- [Update deploy.md](https://github.com/serverless/serverless/pull/6110)
- [Adding a more specific example of how to package individually](https://github.com/serverless/serverless/pull/6108)
- [Update Azure Functions Template](https://github.com/serverless/serverless/pull/6106)
- [Update cloudflare documentation](https://github.com/serverless/serverless/pull/6105)
- [Azure template update](https://github.com/serverless/serverless/pull/6122)
- [Remove not used module](https://github.com/serverless/serverless/pull/6095)
- [Support color output in tests](https://github.com/serverless/serverless/pull/6119)
- [Fix validation after API Gateway deployment](https://github.com/serverless/serverless/pull/6128)
- [Improve handling of custom API Gateway options](https://github.com/serverless/serverless/pull/6129)

## Meta

- [Comparison since last release](https://github.com/serverless/serverless/compare/v1.42.2...v1.42.3)

# 1.42.2 (2019-05-10)

- [Fix restApiId resolution in post CF deployment phase](https://github.com/serverless/serverless/pull/6111)

## Meta

- [Comparison since last release](https://github.com/serverless/serverless/compare/v1.42.1...v1.42.2)

# 1.42.1 (2019-05-09)

- [Fix bug with `cors: true`](https://github.com/serverless/serverless/pull/6104)

## Meta

- [Comparison since last release](https://github.com/serverless/serverless/compare/v1.42.0...v1.42.1)

# 1.42.0 (2019-05-09)

- [Update cors.md](https://github.com/serverless/serverless/pull/6027)
- [Add tags to AWS APIGateway Stage](https://github.com/serverless/serverless/pull/5851)
- [Remove safeguards when using API Gateway Stage resource settings](https://github.com/serverless/serverless/pull/6040)
- [Enable Setting Amazon API Gateway API Key Value](https://github.com/serverless/serverless/pull/5982)
- [Add more specific sub command error handling](https://github.com/serverless/serverless/pull/6038)
- [Use region pseudo parameter](https://github.com/serverless/serverless/pull/6026)
- [Add authorization scopes support for cognito user pool integration](https://github.com/serverless/serverless/pull/6000)
- [Merging v1.41.1 changes back into master](https://github.com/serverless/serverless/pull/6042)
- [Support wildcard in API Gateway cors domains](https://github.com/serverless/serverless/pull/6043)
- [Support setting both proxy and ca file for awsprovider AWS config agent](https://github.com/serverless/serverless/pull/5952)
- [Fix doc: How to update serverless](https://github.com/serverless/serverless/pull/6052)
- [Update event.md](https://github.com/serverless/serverless/pull/6061)
- [Allow Fn::Join in stream event arns](https://github.com/serverless/serverless/pull/6064)
- [Fix markup error with Authe1.42.0 (2019-05-09)ntication value](https://github.com/serverless/serverless/pull/6068)
- [Drop duplicate paragraph in aws/guide/credentials](https://github.com/serverless/serverless/pull/6075)
- [Improve integration test of aws-scala-sbt](https://github.com/serverless/serverless/pull/6079)
- [Highlight skipping of deployments](https://github.com/serverless/serverless/pull/6070)
- [Add support for API Gateway REST API Logs](https://github.com/serverless/serverless/pull/6057)
- [Implement logging with Log4j2 for aws-scala-sbt](https://github.com/serverless/serverless/pull/6078)
- [Update serverless.yml.md](https://github.com/serverless/serverless/pull/6085)
- [Fixed three small typos in doc](https://github.com/serverless/serverless/pull/6092)
- [fixed small errors in spotinst docs](https://github.com/serverless/serverless/pull/6093)
- [Add support for API Gateway Binary Media Types](https://github.com/serverless/serverless/pull/6063)
- [SDK based API Gateway Stage updates](https://github.com/serverless/serverless/pull/6084)

## Meta

- [Comparison since last release](https://github.com/serverless/serverless/compare/v1.41.1...v1.42.0)

# 1.41.1 (2019-04-23)

- [Remove safeguards when using API Gateway Stage resource settings](https://github.com/serverless/serverless/pull/6040)

## Meta

- [Comparison since last release](https://github.com/serverless/serverless/compare/v1.41.0...v1.41.1)

# 1.41.0 (2019-04-18)

- [Add error message when provider does not exist](https://github.com/serverless/serverless/pull/5964)
- [The code for removing comments is easy to read](https://github.com/serverless/serverless/pull/5973)
- [Added rust template for Cloudflare WASM](https://github.com/serverless/serverless/pull/5971)
- [Remove useless variable assignment](https://github.com/serverless/serverless/pull/5991)
- [Merge identical IF-branches](https://github.com/serverless/serverless/pull/5989)
- [eslint: Mark as root config](https://github.com/serverless/serverless/pull/5998)
- [#4750 Java invoke local support for handlers that implement RequestStreamHandler](https://github.com/serverless/serverless/pull/5954)
- [#5993: Ability to pass args for docker run command during invoke local docker](https://github.com/serverless/serverless/pull/5994)
- [Add additional Capability when Transform is detected](https://github.com/serverless/serverless/pull/5997)
- [#5990: Fix layer download caching during invoke local docker](https://github.com/serverless/serverless/pull/5992)
- [#5947: Ensure invoke local docker runs lambda with the dependencies](https://github.com/serverless/serverless/pull/5977)
- [Updating Node.js runtime version](https://github.com/serverless/serverless/pull/6011)
- [Make it easier on the eyes of serverless newcomers](https://github.com/serverless/serverless/pull/6013)
- [Allow specifying a retention policy for lambda layers](https://github.com/serverless/serverless/pull/6010)
- [Update quick-start.md](https://github.com/serverless/serverless/pull/6018)
- [Add AWS x-ray support for API Gateway](https://github.com/serverless/serverless/pull/5692)
- [Add support for multiple usage plans](https://github.com/serverless/serverless/pull/5970)
- [#5945: Invoke local docker to pass env vars to lambda container](https://github.com/serverless/serverless/pull/5988)
- [Update newsletter + enterprise link in readme](https://github.com/serverless/serverless/pull/6023)

## Meta

- [Comparison since last release](https://github.com/serverless/serverless/compare/v1.40.0...v1.41.0)

# 1.40.0 (2019-03-28)

- [Align error logging](https://github.com/serverless/serverless/pull/5937)
- [Fixing minor typo](https://github.com/serverless/serverless/pull/5943)
- [Documentation tweak around shared authorizers](https://github.com/serverless/serverless/pull/5944)
- [Support for asynchronous lambda invocation with integration type AWS](https://github.com/serverless/serverless/pull/5898)
- [Add unit tests for getLocalAccessKey function](https://github.com/serverless/serverless/pull/5948)
- [Document changes from #4951](https://github.com/serverless/serverless/pull/5949)
- [Added ability to create custom stack names and API names](https://github.com/serverless/serverless/pull/4951)
- [Fixes #5188 "Failed to fetch the event types list due the error: API …](https://github.com/serverless/serverless/pull/5335)
- [Allow \* in variable string literal defaults](https://github.com/serverless/serverless/pull/5640)
- [Add Serverless instanceId concept](https://github.com/serverless/serverless/pull/5926)
- [Doc: Include that APIGateway status code of async events](https://github.com/serverless/serverless/pull/5957)
- [Update npm dependencies](https://github.com/serverless/serverless/pull/5968)

## Meta

- [Comparison since last release](https://github.com/serverless/serverless/compare/v1.39.1...v1.40.0)

# 1.39.1 (2019-03-18)

- [Revert "Fixed #4188 - Package generating incorrect package artifact path in serverless-state.json"](https://github.com/serverless/serverless/pull/5936)

## Meta

- [Comparison since last release](https://github.com/serverless/serverless/compare/v1.39.0...v1.39.1)

# 1.39.0 (2019-03-15)

- [Add support for invoke local with docker](https://github.com/serverless/serverless/pull/5863)
- [fix regression with golang check on windows ](https://github.com/serverless/serverless/pull/5899)
- [Support for Cloudwatch Event InputTransformer](https://github.com/serverless/serverless/pull/5912)
- [Allow individual packaging with TypeScript source maps](https://github.com/serverless/serverless/pull/5743)
- [Support API Gateway stage deployment description](https://github.com/serverless/serverless/pull/5509)
- [Allow Fn::Join in SQS arn builder](https://github.com/serverless/serverless/pull/5351)
- [Add AWS x-ray support for Lambda](https://github.com/serverless/serverless/pull/5860)
- [Fix CloudFormation template normalization](https://github.com/serverless/serverless/pull/5885)
- [Fix bug when using websocket events with functions with custom roles](https://github.com/serverless/serverless/pull/5880)
- [Print customized function names correctly in sls info output](https://github.com/serverless/serverless/pull/5883)
- [Added websockets authorizer support](https://github.com/serverless/serverless/pull/5867)
- [Support more route characters for websockets](https://github.com/serverless/serverless/pull/5865)
- [kotlin jvm maven updates](https://github.com/serverless/serverless/pull/5872)
- [Put `Custom Response Headers` into `[Responses]`](https://github.com/serverless/serverless/pull/5862)
- [Packaging exclude only config file being used](https://github.com/serverless/serverless/pull/5840)

## Meta

- [Comparison since last release](https://github.com/serverless/serverless/compare/v1.38.0...v1.39.0)

# 1.38.0 (2019-02-20)

- [Set timout & others on context in python invoke local](https://github.com/serverless/serverless/pull/5796)
- [Append in Custom Syntax](https://github.com/serverless/serverless/pull/5799)
- [Don't load config for `config`](https://github.com/serverless/serverless/pull/5798)
- [Replace blocking fs.readFileSync with non blocking fs.readFile in checkForChanges.js](https://github.com/serverless/serverless/pull/5791)
- [Added layer option for deploy function update-config](https://github.com/serverless/serverless/pull/5787)
- [fix makeDeepVariable replacement](https://github.com/serverless/serverless/pull/5809)
- [Make local ruby pry work](https://github.com/serverless/serverless/pull/5718)
- [Replace \ with / in paths on windows before passing to nanomatch](https://github.com/serverless/serverless/pull/5808)
- [Support deploying GoLang to AWS from Windows!](https://github.com/serverless/serverless/pull/5813)
- [Fix windows go rework](https://github.com/serverless/serverless/pull/5816)
- [Make use of join operator first argument in sns docs](https://github.com/serverless/serverless/pull/5826)
- [add support for command type='container'](https://github.com/serverless/serverless/pull/5821)
- [Add Google Python function template](https://github.com/serverless/serverless/pull/5819)
- [Update config-credentials.md](https://github.com/serverless/serverless/pull/5827)
- [Update bucket conf to default AES256 encryption.](https://github.com/serverless/serverless/pull/5800)
- [Fix: override wildcard glob pattern (\*\*) in resolveFilePathsFromPatterns](https://github.com/serverless/serverless/pull/5825)
- [Indicate unused context in aws-nodejs-typescipt](https://github.com/serverless/serverless/pull/5832)
- [Add stack trace to aws/invokeLocal errors](https://github.com/serverless/serverless/pull/5835)
- [Missing underscore](https://github.com/serverless/serverless/pull/5836)
- [Updating cloudformation resource reference url](https://github.com/serverless/serverless/pull/5690)
- [Docs: Replacing "runtimes" with "templates"](https://github.com/serverless/serverless/pull/5843)
- [Add support for websockets event](https://github.com/serverless/serverless/pull/5824)
- [AWS: \${ssm} resolve vairbale as JSON if it is stored as JSON in Secrets Manager](https://github.com/serverless/serverless/pull/5842)
- [Fix service name in template install message](https://github.com/serverless/serverless/pull/5839)

## Meta

- [Comparison since last release](https://github.com/serverless/serverless/compare/v1.37.1...v1.38.0)

# 1.37.0 (2019-02-06)

- [Fixes for AWS cors config issues](https://github.com/serverless/serverless/pull/5785)
- [Preserve whitespaces in single-quote literal fallback](https://github.com/serverless/serverless/pull/5775)
- [AWS: Add fallback support in ${cf} and ${s3}](https://github.com/serverless/serverless/pull/5758)
- [Throw an error if plugin is executed outside of a serverless directory](https://github.com/serverless/serverless/pull/5636)
- [Require provider.credentials vars to be resolved before s3/ssm/cf vars](https://github.com/serverless/serverless/pull/5763)
- [Provide multi origin cors values](https://github.com/serverless/serverless/pull/5740)
- [handle layers paths with trailing slash and leading ./ or just .](https://github.com/serverless/serverless/pull/5656)
- [Resolve profile before performing aws-sdk dependent actions](https://github.com/serverless/serverless/pull/5744)
- [Fix assuming a role with an AWS profile](https://github.com/serverless/serverless/pull/5739)
- [Allows Fn::GetAtt with Lambda DLQ-onError](https://github.com/serverless/serverless/pull/5139)
- [Fix #5664 - Rollback fails due to a timestamp parsing error](https://github.com/serverless/serverless/pull/5710)
- [AWS: Tell S3 bucket name and how to recover if deployment bucket does not exist](https://github.com/serverless/serverless/pull/5714)
- [Do not print logs if print command is used.](https://github.com/serverless/serverless/pull/5728)
- [Default to error code if message is non-existent](https://github.com/serverless/serverless/pull/4794)
- [Add resource count and warning to info display](https://github.com/serverless/serverless/pull/4822)
- [Add uploaded file name to log while AWS deploy](https://github.com/serverless/serverless/pull/5495)
- [Enable tab completion for slss shortcut](https://github.com/serverless/serverless/pull/4712)
- [Upgrade google-cloudfunctions to v2 and set defaults to node8 etc](https://github.com/serverless/serverless/pull/5311)
- [Convert reservedConcurrency to integer to allow use env var](https://github.com/serverless/serverless/pull/5705)

## Meta

- [Comparison since last release](https://github.com/serverless/serverless/compare/v1.36.3...v1.37.0)

# 1.36.3 (2019-01-23)

- [AWS: Consolidates Lambda::Permission objects for cloudwatchLog events](https://github.com/serverless/serverless/pull/5531)
- [Suppress confusing warning "A valid undefined..." ](https://github.com/serverless/serverless/pull/5723)
- [Add google go template](https://github.com/serverless/serverless/pull/5726)
- [Provide AWS_PROFILE from configuration for invoke local](https://github.com/serverless/serverless/pull/5662)
- [Test that CLI does not convert numeric option to number](https://github.com/serverless/serverless/pull/5727)
- [Remove duplicate-handler warnings based on community feedback.](https://github.com/serverless/serverless/pull/5733)
- [Enable download template from a private github repo using personal access token](https://github.com/serverless/serverless/pull/5715)
- [Fix sls plugin install -n @scoped/package](https://github.com/serverless/serverless/pull/5736)

## Meta

- [Comparison since last release](https://github.com/serverless/serverless/compare/v1.36.2...v1.36.3)

# 1.36.2 (2019-01-21)

- [AWS: Request cache should add region as key to prevent cross-region cache collision](https://github.com/serverless/serverless/pull/5694)
- [Fixed a link](https://github.com/serverless/serverless/pull/5707)
- [Clarify docs for the http key for GCF](https://github.com/serverless/serverless/pull/5680)
- [Fix awsProvider.js : "Cannot use 'in' operator to search for '0'](https://github.com/serverless/serverless/pull/5688)
- [Fix array notation in stream ARN](https://github.com/serverless/serverless/pull/5702)
- [Remove platform code](https://github.com/serverless/serverless/pull/5687)
- [Increase @types/aws-lambda version in aws-nodejs-typescript template](https://github.com/serverless/serverless/pull/5695)
- [Update aws-scala-sbt template](https://github.com/serverless/serverless/pull/5725)
- [docs: Kubeless secrets](https://github.com/serverless/serverless/pull/5130)
- [docs menu sidebar - added [Getting Started] above [Providers]](https://github.com/serverless/serverless/pull/5721)
- [Fix layer doc reference to functions (should be layers)](https://github.com/serverless/serverless/pull/5697)

## Meta

- [Comparison since last release](https://github.com/serverless/serverless/compare/v1.36.1...v1.36.2)

# 1.36.1 (2019-01-14)

- [Update layers.md](https://github.com/serverless/serverless/pull/5678)
- [AWS: Fix stage name validation timing and allow hyphen](https://github.com/serverless/serverless/pull/5686)

## Meta

- [Comparison since last release](https://github.com/serverless/serverless/compare/v1.36.0...v1.36.1)

# 1.36.0 (2019-01-10)

- [Log AWS SDK calls in debug mode](https://github.com/serverless/serverless/pull/5604)
- [Added currently supported regions for GCP functions](https://github.com/serverless/serverless/pull/5601)
- [Update Cloudflare Templates](https://github.com/serverless/serverless/pull/5620)
- [AWS: Validate rate/cron syntax before Deploy](https://github.com/serverless/serverless/pull/5635)
- [Fix error log output](https://github.com/serverless/serverless/pull/5378)
- [Support for native async/await in AWS Lambda for aws-nodejs-typescript template ](https://github.com/serverless/serverless/pull/5607)
- [aws-csharp create template uses handler-specific artifact](https://github.com/serverless/serverless/pull/5411)
- [change behaviour on initial stack create failed](https://github.com/serverless/serverless/pull/5631)
- [Add warning for multiple functions having same handler](https://github.com/serverless/serverless/pull/5638)
- [AWS: Add API Gateway stage name validation.](https://github.com/serverless/serverless/pull/5639)
- [fix Cloudflare template config](https://github.com/serverless/serverless/pull/5651)
- [AWS: Fix \${cf.REGION} syntax causes deployment in wrong region](https://github.com/serverless/serverless/pull/5650)
- [support for @ symbol in \${file()} variables paths](https://github.com/serverless/serverless/pull/5312)
- [Fix ResourceLimitExceeded for cloudwatchLog event](https://github.com/serverless/serverless/pull/5554)
- various documentation updates (#5625, #5613, #5628, #5659, #5618, #5437, #5623, #5627, #5665)

## Meta

- [Comparison since last release](https://github.com/serverless/serverless/compare/v1.35.1...v1.36.0)

# 1.35.1 (2018-12-18)

- [fixed regression preventing including files outside working dir](https://github.com/serverless/serverless/pull/5602)
- [Update ruby template gitignore](https://github.com/serverless/serverless/pull/5599)

## Meta

- [Comparison since last release](https://github.com/serverless/serverless/compare/v1.35.0...v1.35.1)

# 1.35.0 (2018-12-13)

- [Fix logRetentionInDays regression in AWS](https://github.com/serverless/serverless/pull/5562)
- [`invoke local` support for Ruby lambdas](https://github.com/serverless/serverless/pull/5559)
- [Set reserved concurrency in cfn template even if zero](https://github.com/serverless/serverless/pull/5566)
- [Fix `--env` being shadowed when using `sls invoke local`](https://github.com/serverless/serverless/pull/5565)
- [Preserve whitespace in variable literal defaults](https://github.com/serverless/serverless/pull/5571)
- [Drastically improved dev dependency exclusion performance](https://github.com/serverless/serverless/pull/5574)
- [Extend \${cf} syntax to get output from another region](https://github.com/serverless/serverless/pull/5579)
- [Upgrade aws-sdk dep to fix issues with using AWS Profiles](https://github.com/serverless/serverless/pull/5587)
- Documentation updates

## Meta

- [Comparison since last release](https://github.com/serverless/serverless/compare/v1.34.1...v1.35.0)

# 1.34.1 (2018-11-30)

- [Add aws-ruby template](https://github.com/serverless/serverless/pull/5546)
- [Add support for API Gateway payload compression](https://github.com/serverless/serverless/pull/5529)

## Meta

- [Comparison since last release](https://github.com/serverless/serverless/compare/v1.34.0...v1.34.1)

# 1.34.0 (2018-11-29)

- [Lambda Layers support](https://github.com/serverless/serverless/pull/5538)
- [Python3.7 support](https://github.com/serverless/serverless/pull/5505)
- [Updating roles requirement for GCF deployment](https://github.com/serverless/serverless/pull/5490)
- [Support returning promises from serverless.js](https://github.com/serverless/serverless/pull/4827)
- [update CloudFlare worker docs to new more consistent config](https://github.com/serverless/serverless/pull/5521)
- [fix --aws-profile so it overrides profile defined in serverless.yml](https://github.com/serverless/serverless/pull/5516)
- [Fix invoke local when using a callback in nodejs](https://github.com/serverless/serverless/pull/5525)
- [Fix parsing of --data & --context option with invoke local](https://github.com/serverless/serverless/pull/5512)

## Meta

- [Comparison since last release](https://github.com/serverless/serverless/compare/v1.33.2...v1.34.0)

# 1.33.2 (2018-11-18)

- [fix `invoke local` with python2.7 projects](https://github.com/serverless/serverless/pull/5500)
- [fix `logs --tail`](https://github.com/serverless/serverless/pull/5503)

## Meta

- [Comparison since last release](https://github.com/serverless/serverless/compare/v1.33.1...v1.33.2)

# 1.33.1 (2018-11-15)

- [fix issue with `sls deploy --verbose --stage foobar`](https://github.com/serverless/serverless/pull/5492)

## Meta

- [Comparison since last release](https://github.com/serverless/serverless/compare/v1.33.0...v1.33.1)

# 1.33.0 (2018-11-15)

- [2116 consistent errors missing config](https://github.com/serverless/serverless/pull/5298)
- [Update plugin version of google-nodejs template](https://github.com/serverless/serverless/pull/5473)
- [insert line break to suppress warning](https://github.com/serverless/serverless/pull/5445)
- [Fix wrong example function name.](https://github.com/serverless/serverless/pull/5477)
- [Removed errant apostrophe](https://github.com/serverless/serverless/pull/5471)
- [Wrong error when S3 bucket name starts with an upper-case character](https://github.com/serverless/serverless/pull/5409)
- [Fix integration test](https://github.com/serverless/serverless/pull/5440)
- [Use pythonX instead of pythonX.Y in invoke local(take 3)](https://github.com/serverless/serverless/pull/5210)
- [update python invokeLocal to detect tty](https://github.com/serverless/serverless/pull/5355)
- [Fix typo in Google workflow](https://github.com/serverless/serverless/pull/5433)
- [Updating services.md > Invoking Serverless locally](https://github.com/serverless/serverless/pull/5425)
- [Assume role and MFA support for Serverless CLI](https://github.com/serverless/serverless/pull/5432)
- [Fix build error caused by new docs PR ](https://github.com/serverless/serverless/pull/5435)
- [Adding Ruby support for OpenWhisk provider plugin.](https://github.com/serverless/serverless/pull/5427)
- [Update Cloudflare Workers documentation](https://github.com/serverless/serverless/pull/5419)
- [break single general issue template into two specialized templates](https://github.com/serverless/serverless/pull/5405)
- [Improve language in alexa-skill documentation](https://github.com/serverless/serverless/pull/5408)
- [APIG ApiKeySourceType support.](https://github.com/serverless/serverless/pull/5395)
- [Revert "Update cognito-user-pool.md"](https://github.com/serverless/serverless/pull/5399)
- [Let function package.individually config override service artifact](https://github.com/serverless/serverless/pull/5364)
- [Added CloudWatch Proxy to examples](https://github.com/serverless/serverless/pull/5270)
- [Multiple cloudformation resources](https://github.com/serverless/serverless/pull/5250)
- [Added possibility to specify custom S3 key prefix instead of the stan…](https://github.com/serverless/serverless/pull/5299)
- [Doc update for openwhisk package name](https://github.com/serverless/serverless/pull/5375)
- [add aws-go-mod](https://github.com/serverless/serverless/pull/5393)
- [Fix bin process not always exiting](https://github.com/serverless/serverless/pull/5349)
- [Avoid args being rounded and converted to numbers](https://github.com/serverless/serverless/pull/5361)
- [Add CacheControl headers on the OPTIONS response in AWS API Gateway](https://github.com/serverless/serverless/pull/5328)
- [fix Makefile style for Go template](https://github.com/serverless/serverless/pull/5389)
- [Update handler name when deploy a single function](https://github.com/serverless/serverless/pull/5301)
- [fix: Implement context.log function for invoke local command on Python environment.](https://github.com/serverless/serverless/pull/5391)
- [validate if serverless.yml exists when running sls info command](https://github.com/serverless/serverless/pull/5390)
- [Update documentation, README.md](https://github.com/serverless/serverless/pull/5388)
- [Remove invalid log](https://github.com/serverless/serverless/pull/5377)
- [fix 3916 ](https://github.com/serverless/serverless/pull/5387)
- [Update cognito-user-pool.md](https://github.com/serverless/serverless/pull/5384)
- [add gitignore setting to Go template](https://github.com/serverless/serverless/pull/5386)
- [fixed anchor links in aws/guide/variables.md file](https://github.com/serverless/serverless/pull/5370)
- [Serverless Pipeline](https://github.com/serverless/serverless/pull/5360)
- [add Serverless Line Bot example](https://github.com/serverless/serverless/pull/5359)
- [Update invoke-local.md](https://github.com/serverless/serverless/pull/5362)
- [Webtask Deprecation](https://github.com/serverless/serverless/pull/5263)
- [Add Support for Shorthand CloudFormation Syntax](https://github.com/serverless/serverless/pull/5327)
- [Provide Consistent Service Path (Fix #5242)](https://github.com/serverless/serverless/pull/5314)
- [Add Cloudflare to docs/getting-started page.](https://github.com/serverless/serverless/pull/5342)
- [Invoke local override env](https://github.com/serverless/serverless/pull/5313)
- [more faithfully represent aws lambda python runtime context](https://github.com/serverless/serverless/pull/5291)
- [Update AWS TypeScript handler template](https://github.com/serverless/serverless/pull/5309)
- [add untildify package to handle create paths with a ~](https://github.com/serverless/serverless/pull/5062)
- [[Docs] - Add support information for AWS lambda and SQS](https://github.com/serverless/serverless/pull/5305)
- [Update README.md](https://github.com/serverless/serverless/pull/5294)
- [Add information on invoking Workers.](https://github.com/serverless/serverless/pull/5310)
- [Update quick-start.md](https://github.com/serverless/serverless/pull/5308)
- [Cloudflare: Specify config under provider property](https://github.com/serverless/serverless/pull/5289)
- [Create an HttpsProxyAgent for plugin list if necessary](https://github.com/serverless/serverless/pull/5481)

## Meta

- [Comparison since last release](https://github.com/serverless/serverless/compare/v1.32.0...v1.33.0)

# 1.32.0 (2018-09-17)

- [Update quick-start.md](https://github.com/serverless/serverless/pull/5290)
- [Backend state item generation and multi-region support](https://github.com/serverless/serverless/pull/5265)

## Meta

- [Comparison since last release](https://github.com/serverless/serverless/compare/v1.31.0...v1.32.0)

# 1.31.0 (2018-09-11)

- [Add support for Cloudflare Workers](https://github.com/serverless/serverless/pull/5258)
- [docs: Fix mismatch in AWS Metrics](https://github.com/serverless/serverless/pull/5276)
- [Add new template for AWS Alexa Typescript](https://github.com/serverless/serverless/pull/5266)
- [Remove `/tmp/node-dependencies*`](https://github.com/serverless/serverless/pull/5079)
- [Adds FilterPolicy to SNS event](https://github.com/serverless/serverless/pull/5229)
- [Update API Gateway Default Request Templates](https://github.com/serverless/serverless/pull/5222)
- [Update serverless.yml.md](https://github.com/serverless/serverless/pull/5236)
- [Fix for #3069 - Failing to handle schedule event body params](https://github.com/serverless/serverless/pull/5268)
- [Remove redundant link to same docs page](https://github.com/serverless/serverless/pull/5243)

## Meta

- [Comparison since last release](https://github.com/serverless/serverless/compare/v1.30.3...v1.31.0)

# 1.30.3 (2018-08-28)

- [Fix CORS race condition](https://github.com/serverless/serverless/pull/5256)

## Meta

- [Comparison since last release](https://github.com/serverless/serverless/compare/v1.30.2...v1.30.3)

# 1.30.2 (2018-08-28)

- [Fixed a bug when using DynamoDB events with Serverless Platform](https://github.com/serverless/serverless/pull/5237)
- [Fixed a bug when using deep variable references](https://github.com/serverless/serverless/pull/5224)
- [Fixed an issue with Makefile of the aws-go-dep template](https://github.com/serverless/serverless/pull/5227)

## Meta

- [Comparison since last release](https://github.com/serverless/serverless/compare/v1.30.1...v1.30.2)

# 1.30.1 (2018-08-16)

- [Fix CI deployment to Serverless Platform](https://github.com/serverless/serverless/issues/5182)
- [Fix a minor resources ID issue on Serverless Platform](https://github.com/serverless/serverless/pull/5208)
- [Update nodejs template to 8.10](https://github.com/serverless/serverless/pull/5088)

## Meta

- [Comparison since last release](https://github.com/serverless/serverless/compare/v1.30.0...v1.30.1)

# 1.30.0 (2018-08-09)

- [Added support for multiple access keys for multiple tenants](https://github.com/serverless/serverless/pull/5189)
- [Fixed a publishing bug when having more than 100 resources](https://github.com/serverless/serverless/pull/5189)
- [Add Windows support for spawning mvn](https://github.com/serverless/serverless/pull/5028)
- [Update spawn API with {shell=true}](https://github.com/serverless/serverless/pull/5192)
- [AWS Clojurescript Gradle Template](https://github.com/serverless/serverless/pull/5147)
- [Use latest dotnet runtime in AWS Lambda](https://github.com/serverless/serverless/pull/5107)
- [Ignore null errors to allow resolution instead of rejection on undefined SSM variables](https://github.com/serverless/serverless/pull/5119)
- [Fixed a bug when using deep variable references](https://github.com/serverless/serverless/pull/5156)
- [Add support for installing templates and boilerplates from GitLab](https://github.com/serverless/serverless/pull/5116)
- [Fixed that create command didn't use the service name given as -n option](https://github.com/serverless/serverless/pull/5082)

## Meta

- [Comparison since last release](https://github.com/serverless/serverless/compare/v1.29.2...v1.30.0)

# 1.29.2 (2018-07-29)

- [Fixed a bug when using APIG lambda integration with Serverless Dashboard](https://github.com/serverless/serverless/pull/5174)
- [Fixed a bug by transforming env var to string when setting num value](https://github.com/serverless/serverless/pull/5166)

## Meta

- [Comparison since last release](https://github.com/serverless/serverless/compare/v1.29.1...v1.29.2)

# 1.29.1 (2018-07-28)

- [Fixed a bug when using APIG root path with Serverless Dashboard](https://github.com/serverless/serverless/pull/5170)

## Meta

- [Comparison since last release](https://github.com/serverless/serverless/compare/v1.29.0...v1.29.1)

# 1.29.0 (2018-07-26)

- [Fixes issue with Node 10.7.0](https://github.com/serverless/serverless/issues/5133)
- [Serverless Dashboard Updates: Subscriptions, Resources, Deploys and Refresh Tokens](https://github.com/serverless/serverless/pull/5127)
- [Support `invoke local` of AWS Lambda Async Functions](https://github.com/serverless/serverless/pull/4912)
- [Improve aws-scala-sbt template](https://github.com/serverless/serverless/pull/5086)

## Meta

- [Comparison since last release](https://github.com/serverless/serverless/compare/v1.28.0...v1.29.0)

# 1.28.0 (2018-07-04)

- [Add SQS event integration](https://github.com/serverless/serverless/pull/5074)
- [Integration with the Serverless Dashboard](https://github.com/serverless/serverless/pull/5043)
- [Add APIG resource policy](https://github.com/serverless/serverless/pull/5071)
- [Add PRIVATE endpoint type](https://github.com/serverless/serverless/pull/5080)
- [Added ability to create custom stack names and API names](https://github.com/serverless/serverless/pull/4951)
- [Add print options to allow digging, transforming and formatting](https://github.com/serverless/serverless/pull/5036)
- [only use json-cycles when opt-in, for state serialization](https://github.com/serverless/serverless/pull/5029)
- [Make function tags inherit provider tags](https://github.com/serverless/serverless/pull/5007)
- [Make local plugins folder configurable](https://github.com/serverless/serverless/pull/4892)
- [More flexible version constraint for AWS Lambda Go library](https://github.com/serverless/serverless/pull/5045)
- [Update aws-java-maven template to use Log4J2 as recommended by AWS](https://github.com/serverless/serverless/pull/5032)
- [Fix binary support for pre-flight requests (OPTIONS method)](https://github.com/serverless/serverless/pull/4895)

## Meta

- [Comparison since last release](https://github.com/serverless/serverless/compare/v1.27.0...v1.28.0)

# 1.27.0 (2018-05-02)

- [Add maxAge option for CORS](https://github.com/serverless/serverless/pull/4639)
- [Add fn integration](https://github.com/serverless/serverless/pull/4934)
- [iamManagedPolicies merging with Vpc config](https://github.com/serverless/serverless/pull/4879)
- [Support arrays in function definition too](https://github.com/serverless/serverless/pull/4847)
- [Add iam managed policies](https://github.com/serverless/serverless/pull/4793)
- [Pass authorizer custom context to target lambda](https://github.com/serverless/serverless/pull/4773)
- [Allow UsagePlan's to be created without ApiKeys defined](https://github.com/serverless/serverless/pull/4768)
- [Added name property to cloudwatchEvent CF template](https://github.com/serverless/serverless/pull/4763)
- [Java maven templates for OpenWhisk](https://github.com/serverless/serverless/pull/4758)
- [Pass serverless variable when calling function in referenced file](https://github.com/serverless/serverless/pull/4743)
- [Eliminate/Report Hung Promises, Prepopulate Stage and Region, Handle Quoted Strings](https://github.com/serverless/serverless/pull/4713)
- [Restricting alexaSkill functions to specific Alexa skills](https://github.com/serverless/serverless/pull/4701)
- [Add support for concurrency option in AWS Lambda](https://github.com/serverless/serverless/pull/4694)
- [Fix concurrency upload](https://github.com/serverless/serverless/pull/4677)
- [Support AWS GovCloud and China region deployments](https://github.com/serverless/serverless/pull/4665)

## Meta

- [Comparison since last release](https://github.com/serverless/serverless/compare/v1.26.1...v1.27.0)

# 1.26.1 (2018-02-27)

- [Fix lambda integration regression](https://github.com/serverless/serverless/pull/4775)

## Meta

- [Comparison since last release](https://github.com/serverless/serverless/compare/v1.26.0...v1.26.1)

# 1.26.0 (2018-01-29)

- [AWS Go support](https://github.com/serverless/serverless/pull/4669)
- [Support for using an existing ApiGateway and Resources](https://github.com/serverless/serverless/pull/4247)
- [Add logRetentionInDays config](https://github.com/serverless/serverless/pull/4591)
- [Add support of `serverless.js` configuration file](https://github.com/serverless/serverless/pull/4590)
- [Add "did you mean..." CLI suggestions](https://github.com/serverless/serverless/pull/4586)
- [Add `--template-path` option to `serverless create`](https://github.com/serverless/serverless/pull/4576)
- [Add support POJO input support for Java invoke local](https://github.com/serverless/serverless/pull/4596)

## Meta

- [Comparison since last release](https://github.com/serverless/serverless/compare/v1.25.0...v1.26.0)

# 1.25.0 (2017-12-20)

- [Improve Stage and Region Usage](https://github.com/serverless/serverless/pull/4560)
- [Add API Gateway endpoint configuration](https://github.com/serverless/serverless/pull/4531)
- [Add cache to Variables class](https://github.com/serverless/serverless/pull/4499)
- [Added support for circular references in the variable system](https://github.com/serverless/serverless/pull/4144)
- [Circular Vars Fix](https://github.com/serverless/serverless/pull/4478)
- [Ignore the check whether deploymentBucket exists when using "package"](https://github.com/serverless/serverless/pull/4474)
- [Template / AWS Kotlin JVM Gradle](https://github.com/serverless/serverless/pull/4433)
- [Basic logging for python invoke local](https://github.com/serverless/serverless/pull/4429)
- [Add Amazon S3 Transfer Acceleration support](https://github.com/serverless/serverless/pull/4293)
- [Updated awsProvider to allow manual specification of certificate auth](https://github.com/serverless/serverless/pull/4118)
- [Fix lambda version generation when only function config changes](https://github.com/serverless/serverless/pull/4510)
- [Added request cache and queue to AWS provider and use it from variable resolution](https://github.com/serverless/serverless/pull/4518)
- [Add significant variable usage corner cases](https://github.com/serverless/serverless/pull/4529)

## Meta

- [Comparison since last release](https://github.com/serverless/serverless/compare/v1.24.1...v1.25.0)

# 1.24.1 (2017-11-07)

- [Fix this.userStats.track is not a function error when tailing function logs](https://github.com/serverless/serverless/pull/4441)
- [Improve variables test](https://github.com/serverless/serverless/pull/4450)
- [Error when file referenced in serverless.yml does not exist](https://github.com/serverless/serverless/pull/4448)

## Meta

- [Comparison since last release](https://github.com/serverless/serverless/compare/v1.24.0...v1.24.1)

# 1.24.0 (2017-11-01)

- [Run "serverless deploy list" if timestamp is not specified in rollback command](https://github.com/serverless/serverless/pull/4297)
- [Add alexaSmartHome event](https://github.com/serverless/serverless/pull/4238)
- [Distinguish plugin initialization error from plugin not found error](https://github.com/serverless/serverless/pull/4322)
- [Removing private: true from function does not change it's state](https://github.com/serverless/serverless/pull/4302)
- [Change packaging order in zipFiles function](https://github.com/serverless/serverless/pull/4299)
- [Enable bluebird long stack traces only in SLS_DEBUG mode](https://github.com/serverless/serverless/pull/4333)
- [Create service using template from an external repository](https://github.com/serverless/serverless/pull/4133)
- [API Gateway timeout hardcap](https://github.com/serverless/serverless/pull/4348)
- [Set stdin to a TTY in invoke.py to allow PDB use](https://github.com/serverless/serverless/pull/4360)
- [Add function attached to API Gateway effective timeout warning](https://github.com/serverless/serverless/pull/4373)
- [Exclude dev dependency .bin executables](https://github.com/serverless/serverless/pull/4383)
- [Fix "deploy function" command by normalizing role](https://github.com/serverless/serverless/pull/4320)
- [Add print command to generate output of computed serverless.yml](https://github.com/serverless/serverless/pull/4169)
- [Print message if Serverless Framework update is available](https://github.com/serverless/serverless/pull/4301)
- [Allow symlinks as custom variable files in serverless.yml](https://github.com/serverless/serverless/pull/4389)
- [Provide option to conceal API Gateway key values from the output](https://github.com/serverless/serverless/pull/4382)
- [Configurable Authorizer Type](https://github.com/serverless/serverless/pull/4372)

## Meta

- [Comparison since last release](https://github.com/serverless/serverless/compare/v1.23.0...v1.24.0)

# 1.23.0 (2017-09-21)

- [Obey VIRTUAL_ENV on Windows](https://github.com/serverless/serverless/pull/4286)
- [Implement pinging for the CLI login](https://github.com/serverless/serverless/pull/4206)
- [Fixed a bug with deploy function not inheriting provider config](https://github.com/serverless/serverless/pull/4262)
- [Added Auth0 Webtasks Provider Template for Nodejs](https://github.com/serverless/serverless/pull/4283)
- [Added Java support for invoke local](https://github.com/serverless/serverless/pull/4199)

## Meta

- [Comparison since last release](https://github.com/serverless/serverless/compare/v1.22.0...v1.23.0)

# 1.22.0 (2017-09-13)

- [Serverless now fails if provided profile is not valid](https://github.com/serverless/serverless/pull/4245)
- [Removed escaping of double quotes around string values in Serverless Variables](https://github.com/serverless/serverless/pull/4224)
- [Added 4 new plugin commands](https://github.com/serverless/serverless/pull/4046)
- [Added aws-kotlin-jvm-marven template](https://github.com/serverless/serverless/pull/4220)
- [Added --update-config option to deploy function command](https://github.com/serverless/serverless/pull/4173)
- [Added description to CloudWatch Events](https://github.com/serverless/serverless/pull/4221)
- [Added support for aliasing commands](https://github.com/serverless/serverless/pull/4198)
- [Added --function option to deploy command](https://github.com/serverless/serverless/pull/4192)
- [Fixed a bug with Kinesis events](https://github.com/serverless/serverless/pull/4084)
- [Fixed a bug with packaging](https://github.com/serverless/serverless/pull/4189)

## Meta

- [Comparison since last release](https://github.com/serverless/serverless/compare/v1.21.1...v1.22.0)

# 1.21.1 (2017-09-06)

- [Preserve file encoding during packaging process](https://github.com/serverless/serverless/pull/4189)

## Meta

- [Comparison since last release](https://github.com/serverless/serverless/compare/v1.21.0...v1.21.1)

# 1.21.0 (2017-08-30)

- [Allow custom CLI class instances](https://github.com/serverless/serverless/pull/4160)
- [Add support in Spotinst Functions](https://github.com/serverless/serverless/pull/4127)
- [Add PHP support for OpenWhisk](https://github.com/serverless/serverless/pull/4153)
- [Fixed a bug with stack deletion monitoring](https://github.com/serverless/serverless/pull/4132)
- [Allow AWS Profile CLI option to overwrite config and env](https://github.com/serverless/serverless/pull/3980)
- [Improve performance of the package plugin](https://github.com/serverless/serverless/pull/3924)
- [Add support for custom context with Invoke Local](https://github.com/serverless/serverless/pull/4126)
- [Add aws-nodejs-typescript template](https://github.com/serverless/serverless/pull/4058)
- [Add aws-nodejs-ecma-script template](https://github.com/serverless/serverless/pull/4056)
- [Allow updates for AWS profiles](https://github.com/serverless/serverless/pull/3866)
- [Fixed a bug in Invoke Local when using Python in Windows](https://github.com/serverless/serverless/pull/3832)
- [Fixed a bug with the Variable System overwrites](https://github.com/serverless/serverless/pull/4097)

## Meta

- [Comparison since last release](https://github.com/serverless/serverless/compare/v1.20.2...v1.21.0)

# 1.20.2 (2017-08-17)

- [Bump event-gateway version to 0.5.15](https://github.com/serverless/serverless/pull/4116)

## Meta

- [Comparison since last release](https://github.com/serverless/serverless/compare/v1.20.1...v1.20.2)

# 1.20.1 (2017-08-17)

- [Rethrow original plugin error in debug mode](https://github.com/serverless/serverless/pull/4091)
- [Add platform gate to serverless run / emit](https://github.com/serverless/serverless/pull/4103)

## Meta

- [Comparison since last release](https://github.com/serverless/serverless/compare/v1.20.0...v1.20.1)

# 1.20.0 (2017-08-16)

- [Add Serverless Run plugin](https://github.com/serverless/serverless/pull/4034)
- [Add Serverless Emit plugin](https://github.com/serverless/serverless/pull/4038)
- [Kubeless template for python and nodejs](https://github.com/serverless/serverless/pull/3970)
- [Improve deprecation hook message](https://github.com/serverless/serverless/pull/4011)

## Meta

- [Comparison since last release](https://github.com/serverless/serverless/compare/v1.19.0...v1.20.0)

# 1.19.0 (2017-08-02)

- [Removed provider name validation](https://github.com/serverless/serverless/pull/3941)
- [Fixed a bug with dev dependencies exclusion](https://github.com/serverless/serverless/pull/3975)
- [Fixed a bug with "deploy list functions"](https://github.com/serverless/serverless/pull/3971)
- [Fixed a bug with Serverless Plugins loading](https://github.com/serverless/serverless/pull/3960)

## Meta

- [Comparison since last release](https://github.com/serverless/serverless/compare/v1.18.1...v1.19.0)

# 1.18.1 (2017-07-28)

- [Fixed a bug with Serverless Variables](https://github.com/serverless/serverless/pull/3996)
- [Fixed a bug with dev dependencies exclusion](https://github.com/serverless/serverless/pull/3975)

## Meta

- [Comparison since last release](https://github.com/serverless/serverless/compare/v1.18.0...v1.18.1)

# 1.18.0 (2017-07-20)

- [Added support for a new "default" property for Plugins CLI options](https://github.com/serverless/serverless/pull/3808)
- [Fixed a bug with dev dependencies exclusion](https://github.com/serverless/serverless/pull/3889)
- [Added support for a new "publish" property to opt-out from Platform publishing](https://github.com/serverless/serverless/pull/3950)
- [Fixed a bug with "sls remove" when the stack includes Exports](https://github.com/serverless/serverless/pull/3935)
- [Added support for request parameter configuration with lambda-proxy integration](https://github.com/serverless/serverless/pull/3722)
- [Enhanced the environment variables for invoke local to include AWS_REGION](https://github.com/serverless/serverless/pull/3908)
- [Updated the deploy command to ignore custom plugins in service directory during deployment](https://github.com/serverless/serverless/pull/3910)
- [Fixed a bug with function packaging](https://github.com/serverless/serverless/pull/3856)
- [Updated the package command to ignore function packaging if a custom artifact is specified](https://github.com/serverless/serverless/pull/3876)
- [Added support for absolute paths when using Serverless Variables file references](https://github.com/serverless/serverless/pull/3888)

## Meta

- [Comparison since last release](https://github.com/serverless/serverless/compare/v1.17.0...v1.18.0)

# 1.17.0 (2017-07-05)

- Cleanup F# build template output on macOS - #3897
- Add disable flag for OpenWhisk functions - #3830
- Only redeploy when the code/config changes - #3838
- Add opt-out config for dev dependency exclusion - #3877
- Add infinite stack trace for errors - #3839
- Fixed a bug with autocomplete - #3798

## Meta

- [Comparison since last release](https://github.com/serverless/serverless/compare/v1.16.1...v1.17.0)

# 1.16.1 (2017-06-26)

- CI/CD fix for the Serverless Platform - #3829

## Meta

- [Comparison since last release](https://github.com/serverless/serverless/compare/v1.16.0...v1.16.1)

# 1.16.0 (2017-06-21)

- Added support for usage plans to APIG - #3819
- Optmizied packaging to exclude dev dependencies - #3737
- Added support for S3 server side encryption - #3804
- Improved HTTP error handling - #3752
- Throw an error when requsted CF variable doesn't exist - #3739
- Throw an error if an individual package is empty - #3729

## Meta

- [Comparison since last release](https://github.com/serverless/serverless/compare/v1.15.0...v1.16.0)

# 1.15.3 (2017-06-12)

- Fixed autocomplete bug with help option - #3781

## Meta

- [Comparison since last release](https://github.com/serverless/serverless/compare/v1.15.2...v1.15.3)

# 1.15.2 (2017-06-10)

- Fixed installation error - #3763

## Meta

- [Comparison since last release](https://github.com/serverless/serverless/compare/v1.15.0...v1.15.2)

# 1.15.0 (2017-06-08)

- Added autocomplete support to the CLI - #3753
- Added KMS key support - #3672
- Added Cognito User pool support - #3657
- Added serverless.json support - #3647
- Added aws-profile support - #3701
- Added CloudFormation validation support - #3668
- Fixed S3 event race condition bug - #3705
- Fixed CORS origin config bug - #3692

## Meta

- [Comparison since last release](https://github.com/serverless/serverless/compare/v1.14.0...v1.15.0)

# 1.14.0 (2017-05-24)

- Added login command - #3558
- Added support for DeadLetter Config with SNS - #3609
- Added support for S3 variables - #3592
- Added rollback function command - #3571
- Added `X-Amz-User-Agent` to list of allowed headers in CORS - #3614
- Added support for HTTP_PROXY API Gateway integration - #3534
- Added IS_LOCAL environment variable with invoke local command - #3642
- Removed package.json in exclude rules - #3644

## Meta

- [Comparison since last release](https://github.com/serverless/serverless/compare/v1.13.2...v1.14.0)

# 1.13.2 (2017-05-15)

- Fixed a bug when using dot notation in YAML keys (#3620)

## Meta

- [Comparison since last release](https://github.com/serverless/serverless/compare/v1.13.1...v1.13.2)

# 1.13.1 (2017-05-12)

- Fixed bug when referencing variables from other variable object values (#3604)
- Fixed bug when packaging a functions-free service (#3598)

## Meta

- [Comparison since last release](https://github.com/serverless/serverless/compare/v1.13.0...v1.13.1)

# 1.13.0 (2017-05-10)

- Added support for cross service communication via CloudFormation outputs (#3575)
- Add Lambda tagging functionality (#3548)
- Added support for Promises in the variable system (#3554)
- Added hello-world template (#3445)
- Improved Info plugins lifecylce events for plugin authors (#3507)
- Allow service to be specified as object in serverless.yml (#3521)

## Meta

- [Comparison since last release](https://github.com/serverless/serverless/compare/v1.12.0...v1.13.0)

# 1.12.1 (2017-04-27)

- Fix bug when using the package command with the variable system (#3527)

## Meta

- [Comparison since last release](https://github.com/serverless/serverless/compare/v1.12.0...v1.12.1)

# 1.12.0 (2017-04-26)

- Separated packaging and deployment with a new package command (#3344)
- Extend OpenWhisk runtime support (#3454)
- Upgrade gradle wrapper to 3.5 (#3466)
- Fixed bug when using event streams with custom roles (#3457)
- Fixed bug with SNS events (#3443)
- Fixed bug when using custom deployment bucket (#3479)
- Added support for Python 3.6 for Lambda (#3483)
- Added new syntax to specify ARN for SNS events (#3505)

# 1.11.0 (2017-04-12)

- Add CloudWatch Logs Event Source (#3407)
- Add version description from function (#3429)
- Add support for packaging functions individually (#3433)

## Meta

- [Comparison since last release](https://github.com/serverless/serverless/compare/v1.10.2...v1.11.0)

# 1.10.2 (3.04.2017)

- Add support for packaging functions individually at the function level (#3433)

# 1.10.1 (2017-03-30)

- Update serverless-alpha detection (#3423)

## Meta

- [Comparison since last release](https://github.com/serverless/serverless/compare/v1.10.0...v1.10.1)

# 1.10.0 (2017-03-29)

- Fixed bug with ANY http method (#3304)
- Reduced unit test time significantly (#3359)
- Added AWS Groovy Gradle Template (#3353)
- Reduce dependency tree depth between IAM & Log Groups (#3360)
- Added entrypoints for plugins (#3327)
- Removed pre-install script (#3385)
- Expose plugin hooks (#2985)
- Add support for Node 6 runtime in invoke local (#3403)
- Updated Node.js templates to include Node 6 runtime by default (#3406)
- Removed breaking changes warnings (#3418)
- Auto loading serverless-alpha plugin (#3373)

## Meta

- [Comparison since last release](https://github.com/serverless/serverless/compare/v1.9.0...v1.10.0)

# 1.9.0 (2017-03-14)

- Fixed bug with serverless plugins lookup (#3180)
- Fixed bug with `serverless create` generated .gitignore (#3355)
- Fixed bug with authorizer claims (#3187)
- Added support for CloudFormation service roles (#3147)
- Improvements for invoke local plugin (#3037)
- Added Azure Functions Node.js template in `serverless create` (#3334)
- Allow DynamoDB and Kinesis streams to use GetAtt/ImportValue (#3111)

## Meta

- [Comparison since last release](https://github.com/serverless/serverless/compare/v1.8.0...v1.9.0)

# 1.8.0 (2017-02-28)

## Non-Breaking Changes

- Fixed bug with deployment progress monitoring (#3297)
- Fixed "too many open files" error (#3310)
- Fixed bug with functions lists loaded from a separate file using Serverless Variables (#3186)

## Breaking Changes

#### Removed IamPolicyLambdaExecution Resource

We've removed the `IamPolicyLambdaExecution` resource template and replaced it with inline policy within the role as it's been causing issues with VPC and bloating the CF template. This is a breaking change only for users who are depending on that resource with `Ref` or similar CF intrinsic functions.

#### Changed displayed function name for `sls info`

The function name displayed when you run `sls info` is now the short function name as found in `serverless.yml` rather than the actual lambda name to keep it more provider agnostic. This could be breaking for any user who is depending or parsing the CLI output.

## Meta

- [Comparison since last release](https://github.com/serverless/serverless/compare/v1.7.0...v1.8.0)

# 1.7.0 (2017-02-14)

- Added CloudWatch event source (#3102)
- Fixed average functions duration calculation in "sls metrics" output (#3067)
- Added SLS_IGNORE_WARNINGS flag and logging upcoming breaking changes (#3217)
- Reduced memory consumption during zipping process (#3220)
- Fixed bug when using LogGroup resources with custom roles (#3213)

## Meta

- [Comparison since last release](https://github.com/serverless/serverless/compare/v1.6.1...v1.7.0)

# 1.6.1 (2017-01-31)

A minimal patch release that fixes an issue with rendering README.md on npm registry.

# 1.6.0 (2017-01-30)

**Important Note:** This release includes breaking changes. If your services stopped working after upgrading to v1.6.0, please read the following section.

## Breaking Changes

### CloudWatch logs are created explicitly

Up until this release, CloudWatch log groups were created implicitly by AWS/Lambda by default and were not included in your service stack. However, some users were able to easily reach the CloudWatch log group limits (currently at 500 log groups), and it wasn't an easy task to clear them all. Because of that we decided to explicitly create the log groups using CloudFormation so that you can easily remove them with `sls remove`. This was also optionally possible with the `cfLogs: true` config option.

If your service doesn't have the `cfLogs: true` set, and one of the function has been invoked at least once (hence the log groups were created implicitly by AWS), then it's very likely that you'll receive a "log group already exists" error after upgrading to v1.6.0. That's because CF is now trying to create the already created log groups from scratch to include it in the stack resources. **To fix this breaking change,** simply delete the old log group, or rename your service if you **must** keep the old logs.

### Removed function Arns from CloudFormation outputs

Up until this release, the output section of the generated CloudFormation template included an output resource for each function Arn. This caused deploying big services to fail because users were hitting the 60 outputs per stack limit. This effectively means that you can't have a service that has more than 60 functions. To avoid this AWS limit, we decided to remove those function output resources completely, to keep the stack clean. This also means removing the function Arns from the `sls info` command, and at the end of the deployment command.

This is a breaking change for your project if you're depending on those function output resources in anyway, or if you're depending on function arn outputs from the deploy or info commands. Otherwise, your project shouldn't be affected by this change. Fixing this issue depends on your needs, but just remember that you can always create your own CF outputs in `serverless.yml`.

### Moved `getStackName()` method

This is a breaking change for plugin authors only. If your plugin used the `provider.getStackName()` method, it has been moved to `naming.js`, and should be referenced with `provider.naming.getStackName()` instead.

### Removed the `defaults` property from `serverless.yml`

We've finally dropped support for the `defaults` property which we introduced in v1. All child properties should now be moved to the `provider` object instead.

## Non-breaking changes

- Reduce memory consumption on deploy by at least 50% (#3145)
- Added openwhisk template to `sls create` command (#3122)
- Allow Role 'Fn::GetAtt' for Lambda `role` (#3083)
- Added Access-Control-Allow-Credentials for CORS settings (#2736)
- add Support for SNS Subscription to existing topics (#2796)
- Function version resources are now optional. (#3042)
- Invoke local now supports python runtime. (#2937)
- Fixed "deployment bucket doesn't exist" error (#3107)
- Allowed function events value to be variables (#2434)

## Meta

- [Comparison since last release](https://github.com/serverless/serverless/compare/v1.5.1...v1.6.0)

# 1.5.1 (2017-01-19)

## Bug Fixes

- Fix bug with multi line values is given in IoT events (#3095)
- Add support of numeric template creation path (#3064)
- Fix deployment bucket bug when using eu-west-1 (#3107)

## Meta

- [Comparison since last release](https://github.com/serverless/serverless/compare/v1.5.0...v1.5.1)

# 1.5.0 (2017-01-05)

## Features

- [Added IoT event source support](https://github.com/serverless/serverless/blob/master/docs/providers/aws/events/iot.md) (#2954)
- [Cognito user pool authorizer](https://serverless.com/framework/docs/providers/aws/events/apigateway/#http-endpoints-with-custom-authorizers) (#2141)
- Service installation with a name (#2616)

## Bug Fixes

- Fix VTL string escaping (#2993)
- Scheduled events are enabled by default (#2940)
- Update status code regex to match newlines (#2991)
- Add check for preexistent service directory (#3014)
- Deployment monitoring fixes (#2906)
- Credential handling fixes (#2820)
- Reduced policy statement size significantly (#2952)

## Meta

- [Github Milestone](https://github.com/serverless/serverless/milestone/20?closed=1)
- [Comparison since last release](https://github.com/serverless/serverless/compare/v1.4.0...v1.5.0)

# 1.4.0 (2016-12-15)

## Features

- [Alexa event support](https://github.com/serverless/serverless/issues/2875) (#2875)
- [New C# service template](https://github.com/serverless/serverless/tree/master/docs/providers/aws/examples/hello-world/csharp) (#2858)
- [Local Invoke Improvements](https://github.com/serverless/serverless/pull/2865) (#2865)
- [Service wide metrics](https://github.com/serverless/serverless/blob/master/docs/providers/aws/cli-reference/metrics.md) (#2846)
- [Install service by pointing to a Github directory](https://github.com/serverless/serverless/issues/2721) (#2721)
- [Add support for stdin for invoke & invoke local](https://github.com/serverless/serverless/blob/master/docs/providers/aws/cli-reference/invoke.md#function-invocation-with-data-from-standard-input) (#2894)

## Bug Fixes

- Fixed exit code for failed function invocations (#2836)
- Stricter validation for custom IAM statements (#2132)
- Fixed bug in credentials setup (#2878)
- Removed unnecessary warnings during Serverless installation (#2811)
- Removed request and response config when using proxy integration (#2799)
- Internal refactoring

## Meta

- [Github Milestone](https://github.com/serverless/serverless/milestone/18?closed=1)
- [Comparison since last release](https://github.com/serverless/serverless/compare/v1.3.0...v1.4.0)

# 1.3.0 (2016-12-02)

## Features

- [Metrics support](https://serverless.com/framework/docs/providers/aws/cli-reference/metrics/) (#1650)
- [AWS credential setup command](https://serverless.com/framework/docs/providers/aws/cli-reference/config/) (#2623)
- Lambda versioning on each deploy (#2676)

## Improvements

- Documentation improvements with `serverless.yml` file reference (#2703)
- Display info how to use SLS_DEBUG (#2690)
- Drop `event.json` file on service creation (#2786)
- Refactored test structure (#2464)
- Automatic test detection (#1337)

## Bug Fixes

- Add DependsOn for Lamda functions and IamPolicyLambdaExecution (#2743)
- Add JSON data parsing for invoke command (#2685)
- Internal refactoring

## Meta

- [Github Milestone](https://github.com/serverless/serverless/milestone/17?closed=1)
- [Comparison since last release](https://github.com/serverless/serverless/compare/v1.2.1...v1.3.0)

# 1.2.0 (2016-11-22)

## Features

- [Lambda environment variables support](https://serverless.com/framework/docs/providers/aws/guide/functions#environment-variables) (#2748)
- [Load Serverless variables from javascript files](https://serverless.com/framework/docs/providers/aws/guide/variables#reference-variables-in-javascript-files) (#2495)
- [Add support for setting custom IAM roles for functions](https://serverless.com/framework/docs/providers/aws/guide/iam#custom-iam-roles-for-each-function) (#1807)
- Lambda environment variables support in Invoke Local (#2757)
- Tighter and secure permissions for event sources (#2023)

## Bug Fixes

- Fix `--noDeploy` flag to generate deployment files offline without needing internet connection (#2648)
- Bring back the `include` packaging feature with the help of globs (#2460)
- Internal refactoring

## Meta

- [Github Milestone](https://github.com/serverless/serverless/milestone/16?closed=1)
- [Comparison since last release](https://github.com/serverless/serverless/compare/v1.1.0...v1.2.0)

# 1.1.0 (2016-11-02)

## Future breaking changes

We will include the LogGroup for your Lambda function in the CloudFormation template in the future. This will break deployments to existing applications because the log group was already created. You will get a warning about this if you deploy currently. We will force this behaviour in a future release, for now you can set it through the `cfLogs: true` parameter in your provider config. This change will also limit the logging rights to only this LogGroup, which should have no impact on your environment. You can read more in [our docs](https://serverless.com/framework/docs/providers/aws/guide/functions#log-group-resources).

## Features

- [Rollback Support](https://serverless.com/framework/docs/providers/aws/cli-reference/rollback/) (#2495)
- [Log Groups in Cloudformation](https://serverless.com/framework/docs/providers/aws/guide/functions#log-group-resources) (#2520)
- [Allow Services without functions](https://github.com/serverless/serverless/pull/2499) (#2499)
- [Clean up S3 Deployment bucket only after successful deployment](https://github.com/serverless/serverless/pull/2564) (#2564)
- [Allow Inclusion after Exclusion using ! Globs](https://serverless.com/framework/docs/providers/aws/guide/packaging/) (#2266)
- [Version Pinning for Serverless Services to only deploy with specified versions](https://serverless.com/framework/docs/providers/aws/guide/version/) (#2505)
- [Invoke local plugin](https://serverless.com/framework/docs/providers/aws/cli-reference/invoke/) (#2533)
- [Plugin template](https://serverless.com/framework/docs/providers/aws/cli-reference/create/) (#2581)
- [Simple Plugins are now installable in subfolder of the service](https://serverless.com/framework/docs/providers/aws/guide/plugins#service-local-plugin) (#2581)

## Bugs

- Fix variable syntax fallback if the file doesn't exist (#2565)
- Fix overwriting undefined variables (#2541)
- Fix CF deployment issue (#2576)
- Correctly package symlinks (#2266)

## Other

- [Large documentation refactoring](https://serverless.com/framework/docs/) (#2527)

## Meta

- [Github Milestone](https://github.com/serverless/serverless/milestone/15)
- [Comparison since last release](https://github.com/serverless/serverless/compare/v1.0.3...v1.1.0)

# 1.0.3 (2016-10-21)

Following is a selection of features, bug fixes and other changes we did since 1.0.2.
You can also check out all changes in the [Github Compare View](https://github.com/serverless/serverless/compare/v1.0.2...v1.0.3)

## Features

- [Stack Tags and Policy](https://serverless.com/framework/docs/providers/aws/) (#2158)
- [CF Stack Output Variables in Verbose deploy output](https://serverless.com/framework/docs/cli-reference/deploy/) (#2253)
- [Custom Status code for non-proxy APIG integration](https://serverless.com/framework/docs/providers/aws/events/apigateway/) (#2014)
- [Function Runtime can now be configured per function](https://serverless.com/framework/docs/providers/aws/) (#2425)
- [Allow absolute path for invoke command event file](https://serverless.com/framework/docs/cli-reference/invoke/) (#2443)
- [Add list deployments command to show last deployments stored in S3 bucket](https://serverless.com/framework/docs/cli-reference/deploy/) (#2439)

## Bugs

- Fix not thrown error after failed ResourceStatus bug (#2367)
- Fix overwrite resources and custom resource merge bug (#2385)
- Clean up after deployment works correctly now (#2436)

## Other

- Migrate Integration tests into main repository (#2438)

# 1.0.2 (2016-10-13)

- Clean up NPM package (#2352)
- Clean up Stats functionality (#2345)

# 1.0.1 (2016-10-12)

Accidentally released 1.0.1 to NPM, so we have to skip this version (added here to remove confusion)

# 1.0.0 (2016-10-12)

## Breaking Changes

- The HTTP Event now uses the [recently released Lambda Proxy](http://docs.aws.amazon.com/apigateway/latest/developerguide/api-gateway-set-up-simple-proxy.html#api-gateway-proxy-integration-types) by default. This requires you to change your handler result to fit the new proxy integration. You can also switch back to the old integration type.
- The Cloudformation Name of APIG paths that have a variable have changed, so if you have a variable in a path and redeploy CF will throw an error. To fix this remove the path and readd it a second deployment.

## Release Highlights

Following is a selection of the most important Features of the 1.0.0 since 1.0.0-rc.1.

You can see all features of 1.0.0-rc.1 in the [release blogpost](https://serverless.com/blog/serverless-v1-0-rc-1/)

### Documentation

- New documentation website https://serverless.com/framework/docs

### Events

- API Gateway Improvements
  - [Supporting API Gateway Lambda Proxy](https://serverless.com/framework/docs/providers/aws/events/apigateway/) (#2185)
  - [Support HTTP request parameters](https://serverless.com/framework/docs/providers/aws/events/apigateway/) (#2056)
- [S3 Event Rules](https://serverless.com/framework/docs/providers/aws/events/s3/) (#2068)
- [Built-in Stream Event support (Dynamo & Kinesis)](https://serverless.com/framework/docs/providers/aws/events/streams/) (#2250)

### Other

- [Configurable deployment bucket outside of CF stack](https://github.com/serverless/serverless/pull/2189) (#2189)
- [Install command to get services from Github](https://serverless.com/framework/docs/cli-reference/install/) (#2161)
- [Extended AWS credentials support](https://serverless.com/framework/docs/providers/aws/setup/) (#2229)
- [Extended the Serverless integration test suite](https://github.com/serverless/integration-test-suite)
