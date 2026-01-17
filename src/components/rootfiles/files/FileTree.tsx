import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { ChevronRight } from "lucide-react"
import { FileNode } from "@/helpers/interfaces/file-types"
import { useState } from "react"

export function FileTree({ node }: { node: FileNode }) {
  const [open, setOpen] = useState(false)

  if (!node.isDir) {
    return (
      <div className="ml-6 flex items-center gap-2 text-white">
        📄 {node.name}
      </div>
    )
  }

  return (
    <div className="ml-4">
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger className="flex items-center gap-2 text-white">
          <ChevronRight
            className={`h-4 w-4 transition-transform ${open ? "rotate-90" : ""}`}
          />
          📁 {node.name}
        </CollapsibleTrigger>

        <CollapsibleContent>
          {node.children?.map((child) => (
            <FileTree key={child.path} node={child} />
          ))}
        </CollapsibleContent>
      </Collapsible>
    </div>
  )
}
