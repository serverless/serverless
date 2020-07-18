package com.serverless;

import static org.junit.Assert.assertNotNull;

import org.junit.Test;

public class InvokeBridgeTest {

  @Test
  public void verifyInvokeRequestHandler() {
    System.setProperty("artifactPath", "target/test-classes/com/serverless/RequestHandler.class");
    System.setProperty("className", "com.serverless.RequestHandler");
    System.setProperty("handlerName", "handleRequest");

    System.setIn(getClass().getResourceAsStream("/test.json"));
    InvokeBridge.main(new String[] {});
    assertNotNull(RequestStreamHandler.input);
  }

  @Test
  public void verifyInvokeRequestStreamHandler() {
    System.setProperty("artifactPath", "target/test-classes/com/serverless/RequestStreamHandler.class");
    System.setProperty("className", "com.serverless.RequestStreamHandler");
    System.setProperty("handlerName", "handleRequest");

    System.setIn(getClass().getResourceAsStream("/test.json"));
    InvokeBridge.main(new String[] {});
    assertNotNull(RequestStreamHandler.input);
  }
}
