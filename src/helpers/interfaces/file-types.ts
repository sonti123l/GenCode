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

export interface FileReadProgress {
  current: number;
  total: number;
  currentFile: string;
  isReading: boolean;
}

export interface EditOperation {
  type: 'search_replace' | 'create' | 'delete' | 'insert' | 'patch';
  path: string;
  search?: string;
  replace?: string;
  content?: string;
  line?: number;
  patch?: string;
  description?: string;
}

export interface EditResult {
  success: boolean;
  path: string;
  error?: string;
  diff?: string;
  oldContent?: string;
  newContent?: string;
}

export interface FileSearchResult {
  path: string;
  matches: Array<{
    line: number;
    column: number;
    content: string;
    context: string[];
  }>;
}