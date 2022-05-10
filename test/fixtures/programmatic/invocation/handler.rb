require 'json'

def handler(event:, context:)
  {"statusCode" => 200, "body" => {"message" => "Invoked", "env" => ENV.to_hash}.to_json }
end

