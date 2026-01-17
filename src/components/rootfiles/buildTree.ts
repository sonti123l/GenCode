import { FileNode } from "@/helpers/interfaces/file-types";

export function buildFileTree(
  entries: { name: string; path: string; is_dir: boolean }[],
  rootPath: string
): FileNode {
  const root: FileNode = {
    name: rootPath.split(/[\\/]/).pop()!,
    path: rootPath,
    isDir: true,
    children: [],
  }

  const map = new Map<string, FileNode>()
  map.set(rootPath, root)

  for (const entry of entries) {
    const parts = entry.path
      .replace(rootPath, "")
      .split(/[\\/]/)
      .filter(Boolean)

    let current = root
    let currentPath = rootPath

    for (let i = 0; i < parts.length; i++) {
      currentPath += "/" + parts[i]

      if (!map.has(currentPath)) {
        const node: FileNode = {
          name: parts[i],
          path: currentPath,
          isDir: i === parts.length - 1 ? entry.is_dir : true,
          children: [],
        }

        map.set(currentPath, node)
        current.children!.push(node)
      }

      current = map.get(currentPath)!
    }
  }

  return root
}
