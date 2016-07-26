package hello;

import java.io.IOException;

import com.amazonaws.services.lambda.runtime.Context;
import com.amazonaws.services.lambda.runtime.RequestHandler;

public class Handler implements RequestHandler<Request, Response> {

	@Override
	public Response handleRequest(Request input, Context context) {
		return new Response("Go Serverless v1.0! Your function executed successfully!", input);
	}

}
