package hello;

public class Response {

	private String message;
	private Request request;

	public Response(String message, Request request) {
		this.message = message;
		this.request = request;
	}

	public Response() {
	}

	public String getMessage() {
		return this.message;
	}

	public Request getRequest() {
		return this.request;
	}

	public void setMessage(String message) {
		this.message = message;
	}

	public void setRequest(Request request) {
		this.request = request;
	}

}
