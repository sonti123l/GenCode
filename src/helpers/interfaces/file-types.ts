export interface FileNode {
  name: string;
  path: string;
  isDir: boolean;
  children?: FileNode[];
}

export interface DirEntryInfo {
  name: string;
  path: string;
  is_dir: boolean;
  children?: DirEntryInfo[];
}


export type FolderAndFileProps = {
  size?: number;
  className?: string;
};



export interface FileIconProps {
  fileName: string;
  isDirectory: boolean;
  isOpen?: boolean;
}
