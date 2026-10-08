#!/usr/bin/env node
import { main } from "../src/main.mjs";
main(process.argv.slice(2)).catch((e) => {
  console.error("Error: " + (e && e.message ? e.message : e));
  process.exit(e && e.exitCode ? e.exitCode : 1);
});
