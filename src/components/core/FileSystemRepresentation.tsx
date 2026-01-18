import { FileNode } from "@/helpers/interfaces/file-types";
import { FileTree } from "../rootfiles/files/FileTree";

export default function FileSystemRepresentation({ tree }: { tree: FileNode }) {
  return (
    <div className="h-full overflow-y-auto bg-[#181818] text-gray-300 scrollbar-thin">
      <div className="py-2">
        <FileTree node={tree} />
      </div>
    </div>
  );
}
