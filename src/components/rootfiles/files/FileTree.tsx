import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ChevronRight } from "lucide-react";
import { FileNode } from "@/helpers/interfaces/file-types";
import { useState } from "react";
import { FolderIcon } from "@/icons/file-icon";
import { FileIcon } from "./FileIcon";

export function FileTree({ node }: { node: FileNode }) {
  const [open, setOpen] = useState(false);

  if (!node.isDir) {
    return (
      <div className="ml-6 flex items-center gap-2 text-white">
        <FileIcon fileName={node.name} isDirectory={false}/>
        {node.name}
      </div>
    );
  }

  return (
    <div className="ml-4">
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger className="flex items-center gap-2 text-white hover:bg-white/10 rounded px-2 py-1 w-full text-left">
          <ChevronRight 
            className={`h-4 w-4 transition-transform shrink-0 ${open ? "rotate-90" : ""}`}
          />
          <FolderIcon className="h-4 w-4 text-gray-400 shrink-0" />
          <span className="truncate">{node.name}</span>
        </CollapsibleTrigger>

        <CollapsibleContent className="ml-2 mt-1">
          {node.children?.map((child) => (
            <FileTree key={child.path} node={child} />
          ))}
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
