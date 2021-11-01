FROM denoland/deno:alpine  # TODO pin version

COPY . /usr/src/app
WORKDIR /usr/src/app

RUN deno cache --unstable ./src/node_0.ts
CMD deno run --unstable -A ./src/node_0.ts
