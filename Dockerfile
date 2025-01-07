FROM denoland/deno:alpine-2.1.4

ENV DENO_NO_PROMPT=1
ENV DENO_NO_PACKAGE_JSON=1
ENV DENO_DIR=/cache

ENV OPENAI_API_KEY=
ENV WATCH_PATH=/watch
ENV OUT_PATH=/out
ENV PUID=1000
ENV PGID=100

WORKDIR /app

VOLUME /watch
VOLUME /out

COPY deno.json .
COPY deno.lock .

RUN --mount=type=cache,target=/cache deno install

COPY . .

CMD ["run", \
    "--allow-env=WATCH_PATH,OUT_PATH,PUID,PGID,OPENAI_API_KEY", \
    "--allow-net=api.openai.com", \
    "--allow-read", \
    "--allow-write", \
    "src/main.ts"]