⚡ **Serverless Inc. is hiring to build the next generation of serverless development tools, [join us!](https://www.serverless.com/company/jobs/)**

---

[![Serverless Application Framework AWS Lambda API Gateway](https://s3.amazonaws.com/assets.github.serverless/readme-serverless-framework.gif)](http://serverless.com)

[![serverless](http://public.serverless.com/badges/v3.svg)](http://www.serverless.com)
[![Build Status](https://github.com/serverless/serverless/workflows/Integrate/badge.svg)](https://github.com/serverless/serverless/actions?query=workflow%3AIntegrate)
[![npm version](https://badge.fury.io/js/serverless.svg)](https://badge.fury.io/js/serverless)
[![codecov](https://codecov.io/gh/serverless/serverless/branch/master/graph/badge.svg)](https://codecov.io/gh/serverless/serverless)
[![gitter](https://img.shields.io/gitter/room/serverless/serverless.svg)](https://gitter.im/serverless/serverless)
[![Known Vulnerabilities](https://snyk.io/test/github/serverless/serverless/badge.svg)](https://snyk.io/test/github/serverless/serverless)
[![license](https://img.shields.io/npm/l/serverless.svg)](https://www.npmjs.com/package/serverless)

<p align="center">
  <span>English</span> |
  <a href="./README_CN.md">简体中文</a> |
  <a href="./README_KR.md">한국어</a>
</p>

[홈페이지](http://www.serverless.com) • [문서](https://serverless.com/framework/docs/) • [뉴스](https://serverless.com/subscribe/) • [Swag](https://teespring.com/stores/serverless) • [Gitter](https://gitter.im/serverless/serverless) • [포럼](http://forum.serverless.com) • [Meetup](https://www.meetup.com/pro/serverless/) • [트위터](https://twitter.com/goserverless) • [채용](https://serverless.com/company/jobs/)

**The Serverless Framework** – 이벤트에 대한 응답으로 실행되고 자동 확장되며 실행될 때만 요금이 부과되는 마이크로 서비스로 구성된 애플리케이션을 빌드합니다. 이를 통해 앱 유지 관리에 드는 총 비용이 낮아져 더 많은 로직을 더 빠르게 구축 할 수 있습니다.

프레임 워크는 AWS Lambda, Google Cloud Functions 등과 같은 새로운 이벤트 기반 컴퓨팅 서비스를 사용합니다. 서버리스 아키텍처를 개발하고 배포하기위한 scaffolding, 워크플로우 자동화 및 모범 사례를 제공하는 명령 줄 도구입니다. 또한 플러그인을 통해 완벽하게 확장 가능합니다.

서버리스 팀을위한 모니터링, 문제 해결, ci / cd 및 기타 기능은 [serverless framework 대시 보드](https://app.serverless.com)를 확인하세요.
서버리스는 [Serverless Inc](https://www.serverless.com)에서 적극적으로 관리합니다.

## Contents

<img align="right" width="400" src="https://s3-us-west-2.amazonaws.com/assets.site.serverless.com/email/sls-getting-started.gif" />

- [빠른 시작](#quick-start)
- [예제](https://github.com/serverless/examples)
- [서비스](#services)
- [특징](#features)
- [플러그인](https://github.com/serverless/plugins)
- [기여](#contributing)
- [커뮤니티](#community)
- [라이센스](#licensing)

## <a name="quick-start"></a>Quick Start

1. **npm을 통해 설치하기:**

```bash
npm install -g serverless
```

2. **[자격 증명](./docs/providers/aws/guide/credentials.md) 설정** ([설정 관련 영상](https://youtu.be/VUKDRoUdMek))

3. **서비스 생성:**
새 서비스를 만들거나 [기존 서비스](#how-to-install-a-service)를 통해 할 수 있습니다.

```bash
# 새 Serverless  서비스 / 프로젝트 생성
serverless create --template aws-nodejs --path my-service
# 새로 생성 된 디렉토리로 변경
cd my-service
```

4. **서비스 배포:**

`serverless.yml`에서 함수, 이벤트 또는 리소스를 변경했거나 단순히 서비스 내에서 모든 변경 사항을 동시에 배포하려는 경우에 사용합니다.

```bash
serverless deploy -v
```

5. **함수 배포:**

이를 사용하여 AWS에서 AWS Lambda 코드를 빠르게 업로드하고 덮어 쓰면 더 빠르게 개발할 수 있습니다.

```bash
serverless deploy function -f hello
```

6. **AWS에서 함수 호출:**

AWS에서 AWS Lambda 함수를 호출하고 로그를 반환합니다.

```bash
serverless invoke -f hello -l
```

7. **로컬에서 함수 호출:**

로컬에서 AWS Lambda 함수를 호출하고 로그를 반환합니다.

```bash
serverless invoke local -f hello -l
```

8. **함수 로그 호출:**

콘솔에서 별도의 탭을 열고 이 명령을 사용하여 특정 함수에 대한 모든 로그를 스트리밍합니다.

```bash
serverless logs -f hello -t
```

9. **서비스 삭제:**

AWS 계정에서 모든 함수, 이벤트 및 리소스를 제거합니다.

```bash
serverless remove
```

### 서비스 설치 방법:

이것은 Github 저장소를 다운로드하고 압축을 풀어 미리 만들어진 serverless 서비스를 로컬에 설치하는 편리한 방법입니다. 

```bash
serverless install -u https://github.com/your-url-to-the-serverless-service
```

자세한 내용은 [Serverless 가이드](./docs/providers/aws/guide/README.md)를 확인하십시오.

## <a name="services"></a>Services (V1.0)

즉시 설치하여 사용할 수있는 서비스 목록 입니다. `serverless install --url <service-github-url>`

- [serverless-examples](https://github.com/serverless/examples)
- [CRUD](https://github.com/pmuens/serverless-crud) - CRUD 서비스, [Scala Port](https://github.com/jahangirmohammed/serverless-crud-scala)
- [CRUD with FaunaDB](https://github.com/faunadb/serverless-crud) - FaunaDB를 사용한 CRUD 서비스
- [CRUD with S3](https://github.com/tscanlin/serverless-s3-crud) -S3를 사용한 CRUD 서비스
- [CRUD with Flask and SQLAlchemy](https://github.com/jetbridge/sls-flask) - Flask, SQLAlchemy 및 Swagger를 사용한 Python [CRUD API 서비스](https://blog.jetbridge.com/framework/)
- [GraphQL Boilerplate](https://github.com/serverless/serverless-graphql) - GraphQL Boilerplate 
- [Authentication](https://github.com/laardee/serverless-authentication-boilerplate) - Authentication boilerplate 
- [Mailer](https://github.com/eahefnawy/serverless-mailer) -이메일 발송 서비스
- [Kinesis streams](https://github.com/pmuens/serverless-kinesis-streams) - Kinesis 스트림 지원 서비스
- [DynamoDB streams](https://github.com/pmuens/serverless-dynamodb-streams) -DynamoDB 스트림 지원 서비스
- [Landingpage backend](https://github.com/pmuens/serverless-landingpage-backend) - 이메일 주소를 저장하는 백엔드 서비스
- [Facebook Messenger Chatbot](https://github.com/pmuens/serverless-facebook-messenger-bot) - Facebook Messenger 플랫폼 용 챗봇
- [Lambda chaining](https://github.com/pmuens/serverless-lambda-chaining) - SNS를 통해 Lambda를 연결하는 서비스
- [Secured API](https://github.com/pmuens/serverless-secured-api) -API 키 액세스 가능 API를 노출하는 서비스
- [Authorizer](https://github.com/eahefnawy/serverless-authorizer) - API Gateway 사용자 지정 권한 부여자를 사용하는 서비스
- [Thumbnails](https://github.com/eahefnawy/serverless-thumbnails) - 이미지 URL을 가져 와서 100x100 미리보기 이미지를 반환하는 서비스
- [Boilerplate](https://github.com/eahefnawy/serverless-boilerplate) - boilerplate
- ~~[ES6 + Jest](https://github.com/americansystems/serverless-es6-jest) - ES6 + Jest Boilerplate~~
- [PHP](https://github.com/ZeroSharp/serverless-php) -Lambda에서 PHP 함수 호출
- [Ruby](https://github.com/stewartlord/serverless-ruby) - Lambda에서 Ruby 함수 호출
- [Slack App](https://github.com/johnagan/serverless-slack-app) - OAuth 및 봇 작업이 포함 된 Slack boilerplate
- [Swift](https://github.com/choefele/swift-lambda-app) - Swift에서 Lambda 함수를 개발하기위한 모든 기능을 갖춘 프로젝트 템플릿
- [Cloudwatch Alerts on Slack](https://github.com/dav009/serverless-aws-alarms-notifier) - Slack에서 AWS Cloudwatch 알림 알림 받기

**참고**: 이 `serverless install` 명령은 V1.0 버전 이후에만 적용됩니다.

## <a name="features"></a>특징

- Node.js, Python, Java, Go, C 지원
- serverless 아키텍처의 수명주기 (빌드, 배포, 업데이트, 삭제)를 관리합니다.
- 공급자 리소스 관리자(e.g., AWS CloudFormation)를 통해 기능, 이벤트 및 필요한 리소스를 함께 안전하게 배포합니다. 
- 대규모 프로젝트 및 팀에서 코드, 리소스 및 프로세스를 쉽게 관리 할 수 ​​있도록 기능을 중앙화 할 수 있습니다.
- 최소한의 구성 및 scaffolding.
- 여러 단계에 대한 내장 지원.
- CI / CD 워크 플로우에 최적화.
- 배포 속도를 자동화하고 최적화하며 모범 사례를 제공합니다.
- 100 % 확장 가능 : 플러그인을 통해 서버리스 프레임 워크 확장 또는 수정 지원.
- serverless 서비스 및 플러그인 생태계.
- 열정적이고 환영하는 커뮤니티!

## <a name="contributing"></a>기여

우리는 기여자들을 사랑합니다! 프레임 워크 작업을 직접 시작하는 방법을 알아 보려면 [문서](CONTRIBUTING.md)를 읽어보십시오.

당신의 도움이 필요합니다! [help wanted](https://github.com/serverless/serverless/labels/help%20wanted) or [good first issue](https://github.com/serverless/serverless/labels/good%20first%20issue)라벨을 확인해주세요.

## <a name="community"></a>커뮤니티

- [Email Updates](http://eepurl.com/b8dv4P)
- [Serverless Forum](http://forum.serverless.com)
- [Gitter Chatroom](https://gitter.im/serverless/serverless)
- [Serverless Meetups](http://www.meetup.com/serverless/)
- [Stackoverflow](http://stackoverflow.com/questions/tagged/serverless-framework)
- [Facebook](https://www.facebook.com/serverless)
- [Twitter](https://twitter.com/goserverless)
- [Contact Us](mailto:hello@serverless.com)



## <a name="licensing"></a>라이센스

Serverless는 [MIT License](./LICENSE.txt)을 따르는 오픈 소스 프로젝트입니다.

Serverless 프레임 워크 및 기타 타사 종속 라이브러리에서 사용하는 node_modules에는 따르는 계약이있을 수 있습니다. 약관이 MIT 계약의 조건과 정확히 일치하지 않을 수 있으므로 이러한 계약을 읽고 이해하는 것이 좋습니다.

