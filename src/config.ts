import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { findPackageRoot } from "./packageRoot";

export interface Config {
  localFolder: string;
  watch: boolean;
  pollIntervalSeconds: number;
  mirrorDeletes: boolean;
}

const CONFIG_PATH = path.join(findPackageRoot(__dirname), "config.json");

function expandHome(p: string): string {
  if (p.startsWith("~")) {
    return path.join(os.homedir(), p.slice(1));
  }
  return p;
}

export function loadConfig(): Config {
  if (!fs.existsSync(CONFIG_PATH)) {
    throw new Error(
      `Config file not found at ${CONFIG_PATH}. Copy config.example.json to config.json and edit it.`
    );
  }

  const raw = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8"));

  if (!raw.localFolder || typeof raw.localFolder !== "string") {
    throw new Error("config.json: \"localFolder\" is required and must be a string.");
  }

  const localFolder = path.resolve(expandHome(raw.localFolder));

  if (!fs.existsSync(localFolder)) {
    throw new Error(`config.json: localFolder does not exist: ${localFolder}`);
  }
  if (!fs.statSync(localFolder).isDirectory()) {
    throw new Error(`config.json: localFolder is not a directory: ${localFolder}`);
  }

  return {
    localFolder,
    watch: raw.watch !== false,
    pollIntervalSeconds:
      typeof raw.pollIntervalSeconds === "number" && raw.pollIntervalSeconds > 0
        ? raw.pollIntervalSeconds
        : 300,
    mirrorDeletes: raw.mirrorDeletes === true,
  };
}
