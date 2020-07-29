package com.serverless;

import com.amazonaws.services.lambda.runtime.Context;
import com.amazonaws.services.lambda.runtime.RequestHandler;
import com.amazonaws.services.lambda.runtime.events.CognitoEvent;

public class RequestHandlerCognitoEvent implements RequestHandler<CognitoEvent, Object> {
  public static CognitoEvent input;

  @Override
  public Object handleRequest(CognitoEvent event, Context context) {
    input = event;
    System.out.println("Input received:" + event.toString());
    return "RequesHandlerCognitoEvent invoke Complete.";
  }
}
