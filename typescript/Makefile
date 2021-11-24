all:
	@echo

fmt:
	deno fmt -c deno.json ./src/

lint:
	deno lint -c deno.json --unstable ./src/

cache:
	deno cache -c deno.json --unstable ./src/cli.ts

cache-reload:
	deno cache -c deno.json --unstable --reload ./src/cli.ts

docker-build:
	@#docker build --platform linux/amd64 -t ubilog-ts 
	docker-compose build

dep-graph:
	madge --ts-config ./docs/madge.tsconfig.json --extensions=ts ./src --image ./docs/dep_graph.svg

count:
	cd src && cloc \
		keccak256.ts constants.ts networking.ts address.ts serialization.ts ubilog.ts \
		lib/list.ts lib/heap.ts
