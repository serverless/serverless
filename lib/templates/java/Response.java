package <%= package %>;

public class <%= functionName %>Response {

	private String value;

	public <%= functionName %>Response(String value) {
		this.value = value;
	}

	public <%= functionName %>Response() {
	}

	public String getValue() {
		return value;
	}

	public void setValue(String value) {
		this.value = value;
	}
	
}
