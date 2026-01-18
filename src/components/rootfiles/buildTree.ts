import { FileNode, DirEntryInfo } from "@/helpers/interfaces/file-types";

export function mapToFileNode(entry: DirEntryInfo): FileNode {
  return {
    name: entry.name,
    path: entry.path,
    isDir: entry.is_dir,
    children: entry.children?.map((child) => mapToFileNode(child)) || [],
  };
}

export function buildFileTree(
  entries: DirEntryInfo[],
  rootPath: string,
): FileNode {
  const rootName = rootPath.split(/[\\/]/).pop() || rootPath;

  return {
    name: rootName,
    path: rootPath,
    isDir: true,
    children: entries.map((entry) => mapToFileNode(entry)),
  };
}

export function buildFileTreeArray(entries: DirEntryInfo[]): FileNode[] {
  return entries.map((entry) => mapToFileNode(entry));
}
