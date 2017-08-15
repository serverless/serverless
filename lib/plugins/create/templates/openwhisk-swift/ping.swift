func main(args: [String:Any]) -> [String:Any] {
    let formatter = DateFormatter()
    formatter.dateFormat = "yyyy-MM-dd HH:mm:ss"
    let now = formatter.string(from: Date())
 
    if let name = args["name"] as? String {
      return [ "greeting" : "Hello \(name)! The time is \(now)" ]
    } else {
      return [ "greeting" : "Hello stranger! The time is \(now)" ]
    }
}

