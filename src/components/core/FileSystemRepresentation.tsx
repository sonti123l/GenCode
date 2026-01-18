import { FileNode } from "@/helpers/interfaces/file-types";
import { FileTree } from "../rootfiles/files/FileTree";
import { ScrollArea } from "../ui/scroll-area";

export default function FileSystemRepresentation({ tree }: { tree: FileNode }) {
  return (
    <ScrollArea className="h-screen border-r border-gray-800">
      <div>
        <FileTree node={tree} />
      </div>
    </ScrollArea>
  );
}
