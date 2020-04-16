package com.serverless;

public class ConcreteRequestHandler extends AbstractRequestHandler {

  @Override
  Object handleMe() {
    return "Child Complete.";
  }

}
