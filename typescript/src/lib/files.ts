import { ensureDirSync } from "https://deno.land/std@0.115.1/fs/mod.ts";
import * as std_path from "https://deno.land/std@0.115.1/path/mod.ts";

export const get_dir_with_base = (base: string) =>
  (path = ""): string => {
    const dir = std_path.join(base, path);
    ensureDirSync(dir);
    return dir;
  };

export function ensure_text_file(path: string, content = "") {
  try {
    const stat = Deno.statSync(path);
    // TODO: handle symlink?
    if (!stat.isFile) {
      throw new Error(`'${path}' exists but is not a file.`);
    }
  } catch (err) {
    if (err instanceof Deno.errors.NotFound) {
      Deno.writeTextFileSync(path, content);
    } else {
      throw err;
    }
  }
}
