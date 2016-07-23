# Templates

## Java

### Maven - Quick Start

Follow these simple steps to install the alpha, create and deploy your java service using maven, run your function and remove the service afterwards.

1. `npm install -g serverless@alpha`
2. install `maven` or skip if you have it installed
3. `mkdir my-first-service && cd my-first-service`
4. `serverless create --template aws-java-maven`
5. `mvn package`
6. `serverless deploy`
7. `serverless invoke --function hello --path event.json`
8. `serverless remove`

### Gradle - Quick Start

Follow these simple steps to install the alpha, create and deploy your java service using gradle, run your function and remove the service afterwards.

1. `npm install -g serverless@alpha`
2. install `gradle` or skip if you have it installed
3. `mkdir my-first-service && cd my-first-service`
4. `serverless create --template aws-java-gradle`
5. `gradle build`
6. `serverless deploy`
7. `serverless invoke --function hello --path event.json`
8. `serverless remove`
