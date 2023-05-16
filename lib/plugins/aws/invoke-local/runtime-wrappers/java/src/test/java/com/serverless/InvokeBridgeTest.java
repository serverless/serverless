package com.serverless;

import static org.junit.Assert.assertNotNull;

import org.junit.Before;
import org.junit.Test;

public class InvokeBridgeTest {

  private void setArtifactPathAndClassName(String className) {
	  System.setProperty("className", className);
	  String artifactPath = "target/test-classes/" + className.replace('.', '/') + ".class";
	  System.setProperty("artifactPath", artifactPath);
	  System.out.println("Loading " + className + " from " + artifactPath);
  }

  @Before
  public void before() {
    System.setProperty("handlerName", "handleRequest");
  }

  @Test
  public void verifyInvokeRequestHandler() {
    setArtifactPathAndClassName("com.serverless.RequestHandler");

    System.setIn(getClass().getResourceAsStream("/test.json"));
    InvokeBridge.main(new String[] {});
    assertNotNull(RequestStreamHandler.input);
  }

  @Test
  public void verifyInvokeRequestStreamHandler() {
    setArtifactPathAndClassName("com.serverless.RequestStreamHandler");

    System.setIn(getClass().getResourceAsStream("/test.json"));
    InvokeBridge.main(new String[] {});
    assertNotNull(RequestStreamHandler.input);
  }

  @Test
  public void verifyInvokeRequestHandlerAPIGatewayProxyRequestEvent () {
    setArtifactPathAndClassName("com.serverless.RequestHandlerAPIGatewayProxyRequestEvent");

    System.setIn(getClass().getResourceAsStream("/api-gateway-proxy-request-event.json"));
    InvokeBridge.main(new String[] {});
    assertNotNull(RequestHandlerAPIGatewayProxyRequestEvent.input);
    assertNotNull(RequestHandlerAPIGatewayProxyRequestEvent.input.getRequestContext());
  }

  @Test
  public void verifyInvokeRequestHandlerAPIGatewayV2HTTPEvent () {
    setArtifactPathAndClassName("com.serverless.RequestHandlerAPIGatewayV2HTTPEvent");

    System.setIn(getClass().getResourceAsStream("/api-gateway-v2-http-event.json"));
    InvokeBridge.main(new String[] {});
    assertNotNull(RequestHandlerAPIGatewayV2HTTPEvent.input);
    assertNotNull(RequestHandlerAPIGatewayV2HTTPEvent.input.getRequestContext());
  }

  @Test
  public void verifyInvokeRequestHandlerAPIGatewayV2WebSocketEvent () {
    setArtifactPathAndClassName("com.serverless.RequestHandlerAPIGatewayV2WebSocketEvent");

    System.setIn(getClass().getResourceAsStream("/api-gateway-v2-websocket-event.json"));
    InvokeBridge.main(new String[] {});
    assertNotNull(RequestHandlerAPIGatewayV2WebSocketEvent.input);
    assertNotNull(RequestHandlerAPIGatewayV2WebSocketEvent.input.getRequestContext());
  }

  @Test
  public void verifyInvokeRequestHandlerApplicationLoadBalancerRequestEvent() {
    setArtifactPathAndClassName(
        "com.serverless.RequestHandlerApplicationLoadBalancerRequestEvent");

    System.setIn(getClass().getResourceAsStream("/application-load-balancer-request-event.json"));
    InvokeBridge.main(new String[] {});
    assertNotNull(RequestHandlerApplicationLoadBalancerRequestEvent.input);
    assertNotNull(RequestHandlerApplicationLoadBalancerRequestEvent.input.getHeaders());
  }

  @Test
  public void verifyInvokeRequestHandlerCloudFrontEvent() {
    setArtifactPathAndClassName("com.serverless.RequestHandlerCloudFrontEvent");

    System.setIn(getClass().getResourceAsStream("/cloud-front-event.json"));
    InvokeBridge.main(new String[] {});
    assertNotNull(RequestHandlerCloudFrontEvent.input);
    assertNotNull(RequestHandlerCloudFrontEvent.input.getRecords());
  }

  @Test
  public void verifyInvokeRequestHandlerCloudWatchLogsEvent() {
    setArtifactPathAndClassName("com.serverless.RequestHandlerCloudWatchLogsEvent");

    System.setIn(getClass().getResourceAsStream("/cloud-watch-logs-event.json"));
    InvokeBridge.main(new String[] {});
    assertNotNull(RequestHandlerCloudWatchLogsEvent.input);
    assertNotNull(RequestHandlerCloudWatchLogsEvent.input.getAwsLogs());
  }

  @Test
  public void verifyInvokeRequestHandlerCodeCommitEvent() {
    setArtifactPathAndClassName("com.serverless.RequestHandlerCodeCommitEvent");

    System.setIn(getClass().getResourceAsStream("/code-commit-event.json"));
    InvokeBridge.main(new String[] {});
    assertNotNull(RequestHandlerCodeCommitEvent.input);
    assertNotNull(RequestHandlerCodeCommitEvent.input.getRecords());
  }

  @Test
  public void verifyInvokeRequestHandlerCognitoEvent() {
    setArtifactPathAndClassName("com.serverless.RequestHandlerCognitoEvent");

    System.setIn(getClass().getResourceAsStream("/cognito-event.json"));
    InvokeBridge.main(new String[] {});
    assertNotNull(RequestHandlerCognitoEvent.input);
    assertNotNull(RequestHandlerCognitoEvent.input.getIdentityId());
  }

  @Test
  public void verifyInvokeRequestHandlerConfigEvent() {
    setArtifactPathAndClassName("com.serverless.RequestHandlerConfigEvent");

    System.setIn(getClass().getResourceAsStream("/config-event.json"));
    InvokeBridge.main(new String[] {});
    assertNotNull(RequestHandlerConfigEvent.input);
    assertNotNull(RequestHandlerConfigEvent.input.getAccountId());
  }

  @Test
  public void verifyInvokeRequestHandlerDynamodbEvent() {
    setArtifactPathAndClassName("com.serverless.RequestHandlerDynamodbEvent");

    System.setIn(getClass().getResourceAsStream("/dynamo-event.json"));
    InvokeBridge.main(new String[] {});
    assertNotNull(RequestHandlerDynamodbEvent.input);
    assertNotNull(RequestHandlerDynamodbEvent.input.getRecords());
  }

  @Test
  public void verifyInvokeRequestHandlerIoTButtonEvent() {
    setArtifactPathAndClassName("com.serverless.RequestHandlerIoTButtonEvent");

    System.setIn(getClass().getResourceAsStream("/iot-button-event.json"));
    InvokeBridge.main(new String[] {});
    assertNotNull(RequestHandlerIoTButtonEvent.input);
    assertNotNull(RequestHandlerIoTButtonEvent.input.getSerialNumber());
  }

  @Test
  public void verifyInvokeRequestHandlerKinesisEvent() {
    setArtifactPathAndClassName("com.serverless.RequestHandlerKinesisEvent");

    System.setIn(getClass().getResourceAsStream("/kinesis-event.json"));
    InvokeBridge.main(new String[] {});
    assertNotNull(RequestHandlerKinesisEvent.input);
    assertNotNull(RequestHandlerKinesisEvent.input.getRecords());
  }

  @Test
  public void verifyInvokeRequestHandlerKinesisFirehoseEvent() {
    setArtifactPathAndClassName("com.serverless.RequestHandlerKinesisFirehoseEvent");

    System.setIn(getClass().getResourceAsStream("/kinesis-firehose-event.json"));
    InvokeBridge.main(new String[] {});
    assertNotNull(RequestHandlerKinesisFirehoseEvent.input);
    assertNotNull(RequestHandlerKinesisFirehoseEvent.input.getRecords());
  }

  @Test
  public void verifyInvokeRequestHandlerLexEvent() {
    setArtifactPathAndClassName("com.serverless.RequestHandlerLexEvent");

    System.setIn(getClass().getResourceAsStream("/lex-event.json"));
    InvokeBridge.main(new String[] {});
    assertNotNull(RequestHandlerLexEvent.input);
    assertNotNull(RequestHandlerLexEvent.input.getUserId());
  }

  @Test
  public void verifyInvokeRequestHandlerS3Event() {
    setArtifactPathAndClassName("com.serverless.RequestHandlerS3Event");

    System.setIn(getClass().getResourceAsStream("/s3-event.json"));
    InvokeBridge.main(new String[] {});
    assertNotNull(RequestHandlerS3Event.input);
    assertNotNull(RequestHandlerS3Event.input.getRecords());
  }

  @Test
  public void verifyInvokeRequestHandlerSNSvent() {
    setArtifactPathAndClassName("com.serverless.RequestHandlerSNSEvent");

    System.setIn(getClass().getResourceAsStream("/sns-event.json"));
    InvokeBridge.main(new String[] {});
    assertNotNull(RequestHandlerSNSEvent.input);
    assertNotNull(RequestHandlerSNSEvent.input.getRecords());
  }

  @Test
  public void verifyInvokeRequestHandlerSQSEvent() {
    setArtifactPathAndClassName("com.serverless.RequestHandlerSQSEvent");

    System.setIn(getClass().getResourceAsStream("/sqs-event.json"));
    InvokeBridge.main(new String[] {});
    assertNotNull(RequestHandlerSQSEvent.input);
    assertNotNull(RequestHandlerSQSEvent.input.getRecords());
  }

  @Test
  public void verifyInvokeRequestHandlerScheduledEvent() {
    setArtifactPathAndClassName("com.serverless.RequestHandlerScheduledEvent");

    System.setIn(getClass().getResourceAsStream("/scheduled-event.json"));
    InvokeBridge.main(new String[] {});
    assertNotNull(RequestHandlerScheduledEvent.input);
    assertNotNull(RequestHandlerScheduledEvent.input.getId());
  }
}
