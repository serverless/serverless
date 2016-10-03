package hello

import com.amazonaws.services.lambda.runtime.{Context, RequestHandler}

class Handler extends RequestHandler[Request, Response] {

	def handleRequest(input: Request, context: Context): Response = {
		return new Response("Go Serverless v1.0! Your function executed successfully!", input)
	}

}
