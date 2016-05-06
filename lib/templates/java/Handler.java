package <%= package %>;

import java.io.File;
import java.io.IOException;

import com.amazonaws.services.lambda.runtime.Context;
import com.amazonaws.services.lambda.runtime.RequestHandler;
import com.fasterxml.jackson.databind.ObjectMapper;

public class Handler implements RequestHandler<Request, Response> {

	@Override
	public Response handleRequest(Request input, Context context) {
		return new Response(input.getInput());
	}

	public static void main(String[] args) throws IOException {
		ObjectMapper mapper = new ObjectMapper();
		Request request = args.length > 0 ? mapper.readValue(new File(args[0]), Request.class)
				: new Request();
		Handler handler = new Handler();
		Context context = new FakeContext(handler.getClass());
		Response response = handler.handleRequest(request, context);
		mapper.writeValue(System.out, response);
	}
}
