# Templates

## Java

### Maven - Quick Start

Follow these simple steps to create and deploy your java service using maven, run your function and remove the service afterwards.

1. install latest version of `serverless` and `maven`
2. `mkdir my-first-service && cd my-first-service`
3. `serverless create --template aws-java-maven`
4. `mvn package`
5. `serverless deploy`
6. `serverless invoke --function hello --path event.json`
7. `serverless remove`

### Gradle - Quick Start

Follow these simple steps to create and deploy your java service using gradle, run your function and remove the service afterwards.

1. install latest version of `serverless` and `gradle`
2. `mkdir my-first-service && cd my-first-service`
3. `serverless create --template aws-java-gradle`
4. `gradle build`
5. `serverless deploy`
6. `serverless invoke --function hello --path event.json`
7. `serverless remove`
