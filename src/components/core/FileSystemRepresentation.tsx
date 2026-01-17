import { FileNode } from "@/helpers/interfaces/file-types";
import { FileTree } from "../rootfiles/files/FileTree";

export default function FileSystemRepresentation({tree}:{tree: FileNode}){
    return(
        <div>
            <FileTree node={tree}/>
        </div>
    )
}