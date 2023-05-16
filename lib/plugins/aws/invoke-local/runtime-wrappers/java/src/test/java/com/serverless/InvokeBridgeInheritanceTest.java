package com.serverless;

import org.junit.Before;
import org.junit.Test;

public class InvokeBridgeInheritanceTest {
  @Before
  public void before() {
    System.setProperty("artifactPath", "target/test-classes/com/serverless/ConcreteRequestHandler.class");
    System.setProperty("className", "com.serverless.ConcreteRequestHandler");
    System.setProperty("handlerName", "handleRequest");
  }

  @Test
  public void verifyInvoke() {
    System.setIn(getClass().getResourceAsStream("/test.json"));
    InvokeBridge.main(new String[] {});
    // Nothing to verify, if this doesn't throw NoSuchMethodException, we are good.
  }
}
