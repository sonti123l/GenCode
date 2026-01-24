import { FileNode } from "@/helpers/interfaces/file-types";

const EXCLUDED_DIRS = new Set(["assets", "icons", "public"]);

export function getAllFilePaths(entry: FileNode): string[] {
  const result: string[] = [];

  function walk(node: FileNode) {
    if (node.isDir) {
      if (EXCLUDED_DIRS.has(node.name)) return;
      node.children?.forEach(walk);
    } else {
      result.push(node.path);
    }
  }

  walk(entry);
  return result;
}
