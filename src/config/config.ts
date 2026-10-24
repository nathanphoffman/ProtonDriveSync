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

export interface RawConfig {
  localFolder?: unknown;
  watch?: unknown;
  pollIntervalSeconds?: unknown;
  mirrorDeletes?: unknown;
}

const CONFIG_PATH = path.join(findPackageRoot(__dirname), "config.json");
const DEFAULT_POLL_INTERVAL_SECONDS = 300;

function expandHome(inputPath: string): string {
  if (inputPath.startsWith("~")) {
    return path.join(os.homedir(), inputPath.slice(1));
  }

  return inputPath;
}

function readConfigFile(): RawConfig {
  if (!fs.existsSync(CONFIG_PATH)) {
    throw new Error(
      `Config file not found at ${CONFIG_PATH}. Copy config.example.json to config.json and edit it.`
    );
  }

  return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8"));
}

function resolveLocalFolder(value: unknown): string {
  if (!value || typeof value !== "string") {
    throw new Error("config.json: \"localFolder\" is required and must be a string.");
  }

  const localFolder = path.resolve(expandHome(value));
  if (!fs.existsSync(localFolder)) {
    throw new Error(`config.json: localFolder does not exist: ${localFolder}`);
  }
  if (!fs.statSync(localFolder).isDirectory()) {
    throw new Error(`config.json: localFolder is not a directory: ${localFolder}`);
  }

  return localFolder;
}

function resolvePollInterval(value: unknown): number {
  const isPositiveNumber = typeof value === "number" && value > 0;

  return isPositiveNumber ? value : DEFAULT_POLL_INTERVAL_SECONDS;
}

/** Validate a parsed config file and fill in defaults; throws on anything unusable. */
export function parseConfig(raw: RawConfig): Config {
  return {
    localFolder: resolveLocalFolder(raw.localFolder),
    watch: raw.watch !== false,
    pollIntervalSeconds: resolvePollInterval(raw.pollIntervalSeconds),
    mirrorDeletes: raw.mirrorDeletes === true,
  };
}

export function loadConfig(): Config {
  return parseConfig(readConfigFile());
}
