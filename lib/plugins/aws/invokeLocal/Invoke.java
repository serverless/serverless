import java.io.File;
import java.io.IOException;
import java.io.InputStreamReader;
import java.lang.Class;
import java.lang.reflect.Type;
import java.net.URL;
import java.net.URLClassLoader;
import java.net.MalformedURLException;
import java.lang.reflect.Method;
import java.util.HashMap;
import java.util.Map;
import java.io.BufferedReader;

public class Invoke {
  private File artifact;
  private String className;
  private Object instance;
  private Class clazz;

  public Invoke() {
    this.artifact = new File(new File("."), System.getProperty("artifactPath"));
    this.className = System.getProperty("className");

    try {
      HashMap<String, Object> parsedInput = new HashMap<>();
      String input = getInput();

      // parsedInput = this.parseInput(input); - should parse String -> Json -> Map<String, Object>
      // Context - no ideas...

      this.instance = this.getInstance();
      this.invoke(new HashMap<String, Object>(), null);
    } catch (Exception e) {
      e.printStackTrace();
    }
  }

  private Object getInstance() throws Exception {
    URL[] urls = {this.artifact.toURI().toURL()};
    URLClassLoader child = new URLClassLoader(urls, this.getClass().getClassLoader());

    this.clazz = Class.forName(this.className, true, child);

    return this.clazz.newInstance();
  }

  private Object invoke(HashMap<String, Object> event, Object context) throws Exception {
    Method[] methods = this.clazz.getDeclaredMethods();

    return methods[1].invoke(this.instance, event, context);
  }

  private String getInput() throws IOException {
    BufferedReader streamReader = new BufferedReader(new InputStreamReader(System.in, "UTF-8"));
    StringBuilder inputStringBuilder = new StringBuilder();
    String inputStr;

    while ((inputStr = streamReader.readLine()) != null) {
      inputStringBuilder.append(inputStr);
    }

    return inputStringBuilder.toString();
  }

  public static void main(String[] args) {
    new Invoke();
  }
}
