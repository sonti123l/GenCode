import { Collapsible, CollapsibleContent } from "@/components/ui/collapsible";
import { ChevronRight } from "lucide-react";
import { FileNode } from "@/helpers/interfaces/file-types";
import { useEffect, useState } from "react";
import { FileIcon } from "./FileIcon";
import { invoke } from "@tauri-apps/api/core";
import { useEditor } from "@/context/EditorContext";

export function FileTree({ node }: { node: FileNode }) {
  const [open, setOpen] = useState(false);
  const { selectedFile, setSelectedFile, setFileContent } = useEditor();
  const [filePaths, setFilePaths] = useState([]);

  const handleFileClick = async () => {
    if (node.isDir) return;

    setSelectedFile(node.path);

    try {
      const content = await invoke<string>("read_file_content", {
        path: node.path,
      });
      setFileContent(content);
    } catch (err) {
      setFileContent(`// Failed to read file\n// ${err}`);
    }
  };

  if (!node.isDir) {
    return (
      <div
        onClick={handleFileClick}
        className={`ml-6 flex items-center gap-2 px-2 py-1 rounded cursor-pointer text-sm
          hover:bg-white/10
          ${selectedFile === node.path ? "bg-white/20" : ""}
        `}
      >
        <FileIcon fileName={node.name} isDirectory={false} />
        <span className="truncate">{node.name}</span>
      </div>
    );
  }

  return (
    <div className="ml-4">
      <Collapsible open={open} onOpenChange={setOpen}>
        <div
          className="flex items-center gap-1 px-2 py-1 rounded hover:bg-white/10 cursor-pointer"
          onClick={() => setOpen(!open)}
        >
          <ChevronRight
            className={`h-4 w-4 transition-transform ${
              open ? "rotate-90" : ""
            }`}
          />
          <FileIcon fileName={node.name} isDirectory />
          <span className="truncate text-sm">{node.name}</span>
        </div>

        <CollapsibleContent>
          {node.children?.map((child) => (
            <FileTree key={child.path} node={child} />
          ))}
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}