// deno-lint-ignore-file camelcase

import { main } from "./ubilog.ts";

main(Deno.args.concat(["--port=42002"]));
