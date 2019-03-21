def main(args)
  name = args["name"] || "stranger"
  greeting = "Hello #{name}!"
  puts greeting
  { "greeting" => greeting }
end
