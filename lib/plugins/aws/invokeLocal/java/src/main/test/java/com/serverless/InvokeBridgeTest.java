package com.serverless;

import static org.junit.Assert.assertNotNull;

import org.junit.Before;
import org.junit.Test;

public class InvokeBridgeTest {
  @Before
  public void before() {
    System.setProperty("artifactPath", "target/test-classes/com/serverless/RequestStreamHandler.class");
    System.setProperty("className", "com.serverless.RequestStreamHandler");
    System.setProperty("handlerName", "handleRequest");
  }

  @Test
  public void verifyInvoke() {
    System.setIn(getClass().getResourceAsStream("/test.json"));
    InvokeBridge.main(new String[] {});
    assertNotNull(RequestStreamHandler.input);
  }
}
