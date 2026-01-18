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


export interface Message {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: Date;
  codeBlocks?: CodeBlock[];
  isStreaming?: boolean;
}

export interface CodeBlock {
  language: string;
  code: string;
  fileName?: string;
  action?: "create" | "edit" | "view";
}

export interface FileContext {
  path: string;
  content: string;
  language: string;
}

export interface ChatMessage {
  role: string;
  content: string;
}

export interface ChatStreamEvent {
  content: string;
  done: boolean;
}