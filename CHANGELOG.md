# Changelog

All notable changes to this project will be documented in this file. See [standard-version](https://github.com/conventional-changelog/standard-version) for commit guidelines.

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

### Maintanance Improvements

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

### Maintanance Improvements

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

### Maintanance Improvements

- **`lodash` replacement:**
  - Remove `_.isInteger` ([#7878](https://github.com/serverless/serverless/issues/7878)) ([3b19a5a](https://github.com/serverless/serverless/commit/3b19a5a6b191fdb0dac5a81d1244159e0da9e0bd)) ([Dai Van Nguyen](https://github.com/nvdai2401))

## [1.74.0](https://github.com/serverless/serverless/compare/v1.73.1...v1.74.0) (2020-06-26)

### Features

- **AWS ALB:** Support built-in authentication through `onUnauthenticatedRequest` ([#7780](https://github.com/serverless/serverless/issues/7780)) ([b976677](https://github.com/serverless/serverless/commit/b9766775148b15f8b19fd9d657149813cb5e8bfa)) ([Kamaz](https://github.com/kamaz))

### Bug Fixes

- **AWS HTTP API:** Respect logRetentionInDays setting ([#7856](https://github.com/serverless/serverless/issues/7856)) ([9dad77c](https://github.com/serverless/serverless/commit/9dad77ce1b12218f3c38b62c716d4dbc9d68bb5d)) ([Jonne Deprez](https://github.com/jonnedeprez))
- **AWS Websocket:** Fix resources dependency chain ([9c0f646](https://github.com/serverless/serverless/commit/9c0f6461b73976958ebdd7e2762c6d1fbd469da1)) ([Mariusz Nowak](https://github.com/medikoo))

### Maintanance Improvements

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

### Maintanance Improvements

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

### Maintanance Improvements

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

### Maintanance Improvements

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

### Maintanance Improvements

- Upgrade `fs-extra` to v8 ([#7719](https://github.com/serverless/serverless/issues/7719)) ([c106d53](https://github.com/serverless/serverless/commit/c106d5363830e9dc31a5714f56abfb26b0a5db37)) ([Kenan Christian Dimas](https://github.com/kenanchristian))

## [1.70.1](https://github.com/serverless/serverless/compare/v1.70.0...v1.70.1) (2020-05-11)

### Bug Fixes

- **AWS IAM:** Fix role and policy name resolution ([#7694](https://github.com/serverless/serverless/pull/7694)) ([08dc745](https://github.com/serverless/serverless/commit/08dc745cbfa403860bc7e08cbaf10cd90f15be05)) ([Mariusz Nowak](https://github.com/medikoo))
- **Standalone:** Ensure pkg bug workaround is applied on WIndows ([#7699](https://github.com/serverless/serverless/pull/7699)) ([8bc6d54](https://github.com/serverless/serverless/commit/8bc6d542f8b45aee74463ec732272dcf39c14132)) ([Mariusz Nowak](https://github.com/medikoo))

### Enhancements

- **Templates:**
  - Update aws-csharp to .NET Core 3.1 ([#7708](https://github.com/serverless/serverless/issues/7708)) ([46df82e](https://github.com/serverless/serverless/commit/46df82ea92ced3ba7542f6de5da6cfda73554ffc)) ([Joseph Woodward](https://github.com/JosephWoodward))
  - Update aws-fsharp to .NET Core 3.1 ([#7709](https://github.com/serverless/serverless/issues/7709)) ([a5a136f](https://github.com/serverless/serverless/commit/a5a136f982f19043cf4cf3236db1ac2d17c8a266)) ([Stuart Lang](https://github.com/slang25))

### Maintanance Improvements

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
