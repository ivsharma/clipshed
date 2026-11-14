import { rm } from "node:fs/promises";
import { build } from "esbuild";

await rm("desktop/build", { recursive: true, force: true });

await build({
  entryPoints: ["server/src/server.ts"],
  outfile: "desktop/build/server.cjs",
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node22",
  define: {
    "import.meta.url": "__CLIPSHED_MODULE_URL",
  },
  banner: {
    js: 'const __CLIPSHED_MODULE_URL = require("node:url").pathToFileURL(__filename).href;',
  },
  legalComments: "none",
  logLevel: "info",
});
