import { FileNode } from "@/helpers/interfaces/file-types";

export function FileTree({ node }: { node: FileNode }) {
  return (
    <div className="ml-4">
      <div className="flex items-center gap-2 text-white">
        {node.isDir ? "📁" : "📄"}
        {node.name}
      </div>

      {node.children?.map((child) => (
        <FileTree key={child.path} node={child} />
      ))}
    </div>
  )
}
