package com.serverless;

import java.util.HashMap;

import com.amazonaws.services.lambda.runtime.Context;
import com.amazonaws.services.lambda.runtime.RequestHandler;
import com.amazonaws.services.lambda.runtime.events.APIGatewayProxyRequestEvent;
import com.amazonaws.services.lambda.runtime.events.APIGatewayProxyResponseEvent;

public class RequestHandlerAPIGatewayProxyRequestEvent
    implements RequestHandler<APIGatewayProxyRequestEvent, APIGatewayProxyResponseEvent> {
  public static APIGatewayProxyRequestEvent input;

  @Override
  public APIGatewayProxyResponseEvent handleRequest(
      APIGatewayProxyRequestEvent event, Context context) {
    input = event;
    System.out.println("Input received:" + event.toString());
    APIGatewayProxyResponseEvent response = new APIGatewayProxyResponseEvent();
    response.setStatusCode(200);
    HashMap<String, String> headers = new HashMap<String, String>();
    headers.put("Content-Type", "text/plain; charset=US-ASCII");
    response.setHeaders(headers);
    response.setBody("RequestHandlerAPIGatewayProxyResponseEvent invoke Complete.");
    return response;
  }
}
