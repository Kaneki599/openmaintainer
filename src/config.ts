import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { parseDocument } from "yaml";

export interface OpenMaintainerConfig {
  ignore: Set<string>;
}

export async function loadConfig(root: string): Promise<OpenMaintainerConfig> {
  const filename = join(root, "openmaintainer.yml");
  try {
    const source = await readFile(filename, "utf8");
    const document = parseDocument(source);
    if (document.errors.length > 0) throw new Error(`Invalid openmaintainer.yml: ${document.errors[0]?.message}`);
    const config = document.toJS() as { ignore?: unknown } | null;
    if (!config || (config.ignore !== undefined && (!Array.isArray(config.ignore) || !config.ignore.every((id) => typeof id === "string")))) {
      throw new Error("openmaintainer.yml 'ignore' must be a list of rule identifiers.");
    }
    return { ignore: new Set(config.ignore ?? []) };
  } catch (error: unknown) {
    if (isMissingFile(error)) return { ignore: new Set() };
    throw error;
  }
}

function isMissingFile(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === "object" && error !== null && (error as NodeJS.ErrnoException).code === "ENOENT";
}
