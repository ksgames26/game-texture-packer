#!/usr/bin/env node

import { runCli } from "./cli/program.js";

runCli(process.argv).then(code => { process.exitCode = code; }).catch(error => {
  console.error(error);
  process.exitCode = 1;
});
