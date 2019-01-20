.PHONY: gomodgen deploy delete

gomodgen:
	GO111MODULE=on go mod init

deploy:
	gcloud functions deploy hello --entry-point Hello --runtime go111 --trigger-http

delete:
	gcloud functions delete hello --entry-point Hello --runtime go111 --trigger-http
