#!/usr/bin/env npx tsx
/** Provisiona login Jeferson na homolog (.env.bic-lab). */
import { spawnSync } from "node:child_process";
import { loadBicLabEnv } from "./loadBicLabEnv";

loadBicLabEnv();

const result = spawnSync("node", ["scripts/provision-jeferson-cooperado-login.mjs"], {
  stdio: "inherit",
  env: process.env,
  cwd: process.cwd(),
  shell: true,
});

process.exit(result.status ?? 1);
