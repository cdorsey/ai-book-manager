import { oneLineTrim, stripIndent } from "@hexagon/proper-tags";
import { OpenAI } from "@openai/openai";
import * as Collections from "@std/collections";
import * as FS from "@std/fs";
import * as Path from "@std/path";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

const AppConfig = z.object({
  watchPath: z.string(),
  outPath: z.string(),
  puid: z.number().nullable(),
  pgid: z.number().nullable(),
});

type AppConfig = z.infer<typeof AppConfig>;

const OpenAIResponse = z.object({
  title: z.string(),
  author: z.string(),
  year: z.string(),
});

type OpenAIResponse = z.infer<typeof OpenAIResponse>;

const OpenLibraryResponse = z.object({
  title_suggest: z.string(),
  author_name: z.array(z.string()),
  first_publish_year: z.coerce.number(),
}).transform((data) => ({
  title: data.title_suggest,
  author: data.author_name.at(0) ?? "Unknown",
  year: data.first_publish_year,
}));

type OpenLibraryResponse = z.infer<typeof OpenLibraryResponse>;

const Query = z.object({
  query: z.string(),
});

type Query = z.infer<typeof Query>;

const filenameTemplate = "{title} - {author} ({year})";

function searchBook({ query }: Query): Promise<OpenLibraryResponse | null> {
  console.log("Searching for book", query);

  const q = new URLSearchParams({
    q: query,
    limit: "1",
    fields: "title_suggest,author_name,first_publish_year",
  });

  const req = new Request(`https://openlibrary.org/search.json?${q}`, {
    headers: {
      "User-Agent": "BookManager/1.0 (mail@chase-dorsey.com)",
    },
  });

  return fetch(req)
    .then((res) => res.json())
    .then((data) =>
      data.numFound > 0 ? OpenLibraryResponse.parse(data.docs[0]) : null
    );
}

async function parseFilePath(
  openai: OpenAI,
  path: string,
): Promise<OpenAIResponse> {
  const fileName = Path.basename(path);

  console.log("Parsing file", fileName);

  const content = stripIndent`
    ${oneLineTrim`Using the following file name for an ebook, extract the necessary 
      information about the book. Your response should contain only valid JSON 
      and match the following schema:`}
    ${JSON.stringify(zodToJsonSchema(OpenAIResponse, { target: "openAi" }))}

    ${oneLineTrim`Do not add any additional text or markup. If any information 
      is missing, use the searchBook tool, do not make up information.`}

    ${fileName}
    `;

  const runner = openai.beta.chat.completions.runTools({
    model: "gpt-4o-mini",
    messages: [
      { role: "user", content },
    ],
    tools: [
      {
        type: "function",
        // @ts-expect-error Bad typing in openai library
        function: {
          function: searchBook,
          description: "Searches for a book. Returns null if no book is found.",
          parse: (params) => Query.parse(JSON.parse(params)),
          parameters: zodToJsonSchema(Query, { target: "openAi" }),
        },
      },
    ],
  });

  const response = await runner.finalContent();

  return OpenAIResponse.parse(JSON.parse(response ?? "{}"));
}

async function worker(
  event: Deno.FsEvent,
  { outPath, puid, pgid }: AppConfig,
): Promise<void> {
  const openai = new OpenAI();

  if (!["create", "rename"].includes(event.kind)) {
    return;
  }

  const results = Collections.zip(
    event.paths,
    await Promise.all(
      event.paths.map((path) => parseFilePath(openai, path)),
    ),
  );

  await Promise.all(results.map(async ([path, result]) => {
    const parsedPath = Path.parse(path);

    const filename = filenameTemplate
      .replaceAll("{title}", result.title)
      .replaceAll("{author}", result.author)
      .replaceAll("{year}", result.year);

    const outFile = Path.format({
      dir: outPath,
      name: filename,
      ext: parsedPath.ext,
    });

    console.log("Writing", outFile);

    await FS.move(path, outFile);

    if (puid && pgid) {
      await Deno.chown(outFile, puid, pgid);
    }
  }));
}

async function main(config: AppConfig) {
  for await (const event of Deno.watchFs(config.watchPath)) {
    await worker(event, config);
  }
}

if (import.meta.main) {
  const watchPath = Deno.env.get("WATCH_PATH")!;
  const outPath = Deno.env.get("OUT_PATH")!;
  const puid = Deno.env.get("PUID");
  const pgid = Deno.env.get("PGID");

  const config: AppConfig = {
    watchPath: Path.isAbsolute(watchPath)
      ? watchPath
      : Path.resolve(Deno.cwd(), watchPath),
    outPath: Path.isAbsolute(outPath)
      ? outPath
      : Path.resolve(Deno.cwd(), outPath),
    puid: puid ? parseInt(puid) : null,
    pgid: pgid ? parseInt(pgid) : null,
  };

  await main(config);
}
