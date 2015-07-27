verbose: test/keys
	@node test/*.test.js

test: test/keys
	@./node_modules/.bin/tape test/*.test.js

test/keys:
	@openssl genrsa 2048 > test/rsa-private.pem
	@openssl genrsa 2048 > test/rsa-wrong-private.pem
	@openssl rsa -in test/rsa-private.pem -pubout > test/rsa-public.pem
	@openssl rsa -in test/rsa-wrong-private.pem -pubout > test/rsa-wrong-public.pem
	@openssl ecparam -out test/ec256-private.pem -name secp256r1 -genkey
	@openssl ecparam -out test/ec256-wrong-private.pem -name secp256k1 -genkey
	@openssl ecparam -out test/ec384-private.pem -name secp384r1 -genkey
	@openssl ecparam -out test/ec384-wrong-private.pem -name secp384r1 -genkey
	@openssl ecparam -out test/ec512-private.pem -name secp521r1 -genkey
	@openssl ecparam -out test/ec512-wrong-private.pem -name secp521r1 -genkey
	@openssl ec -in test/ec256-private.pem -pubout > test/ec256-public.pem
	@openssl ec -in test/ec256-wrong-private.pem -pubout > test/ec256-wrong-public.pem
	@openssl ec -in test/ec384-private.pem -pubout > test/ec384-public.pem
	@openssl ec -in test/ec384-wrong-private.pem -pubout > test/ec384-wrong-public.pem
	@openssl ec -in test/ec512-private.pem -pubout > test/ec512-public.pem
	@openssl ec -in test/ec512-wrong-private.pem -pubout > test/ec512-wrong-public.pem
	@touch test/keys

clean:
	@rm test/*.pem
	@rm test/keys

.PHONY: test
