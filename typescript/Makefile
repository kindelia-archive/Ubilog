all:
	@echo

fmt:
	deno fmt -c deno.json ./src/

lint:
	deno lint -c deno.json --unstable ./src/

cache:
	deno cache -c deno.json --unstable ./src/ubilog.ts

docker-build:
	@#docker build --platform linux/amd64 -t ubilog-ts 
	docker-compose build
