package com.serverless;

import com.amazonaws.services.lambda.runtime.Context;
import com.amazonaws.services.lambda.runtime.RequestHandler;
import com.amazonaws.services.lambda.runtime.events.CodeCommitEvent;

public class RequestHandlerCodeCommitEvent implements RequestHandler<CodeCommitEvent, Object> {
  public static CodeCommitEvent input;

  @Override
  public Object handleRequest(CodeCommitEvent event, Context context) {
    input = event;
    System.out.println("Input received:" + event.toString());
    return "RequesHandlerCodeCommitEvent invoke Complete.";
  }
}
