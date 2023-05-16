package com.serverless;

import java.util.HashMap;

import com.amazonaws.services.lambda.runtime.Context;
import com.amazonaws.services.lambda.runtime.RequestHandler;
import com.amazonaws.services.lambda.runtime.events.ApplicationLoadBalancerRequestEvent;
import com.amazonaws.services.lambda.runtime.events.ApplicationLoadBalancerResponseEvent;

public class RequestHandlerApplicationLoadBalancerRequestEvent
    implements RequestHandler<
        ApplicationLoadBalancerRequestEvent, ApplicationLoadBalancerResponseEvent> {
  public static ApplicationLoadBalancerRequestEvent input;

  @Override
  public ApplicationLoadBalancerResponseEvent handleRequest(
      ApplicationLoadBalancerRequestEvent event, Context context) {
    input = event;
    System.out.println("Input received:" + event.toString());
    ApplicationLoadBalancerResponseEvent response = new ApplicationLoadBalancerResponseEvent();
    response.setStatusCode(200);
    HashMap<String, String> headers = new HashMap<String, String>();
    headers.put("Content-Type", "text/plain; charset=US-ASCII");
    response.setHeaders(headers);
    response.setBody("RequestHandlerApplicationLoadBalancerResponseEvent invoke Complete.");
    return response;
  }
}
