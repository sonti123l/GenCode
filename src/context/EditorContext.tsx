// contexts/EditorContext.tsx
import { createContext, useContext, useState, ReactNode } from 'react';

interface EditorContextType {
  selectedFile: string | null;
  fileContent: string;
  setSelectedFile: (path: string | null) => void;
  setFileContent: (content: string) => void;
}

const EditorContext = createContext<EditorContextType | undefined>(undefined);

export function EditorProvider({ children }: { children: ReactNode }) {
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<string>('');

  return (
    <EditorContext.Provider
      value={{ selectedFile, fileContent, setSelectedFile, setFileContent }}
    >
      {children}
    </EditorContext.Provider>
  );
}

export function useEditor() {
  const context = useContext(EditorContext);
  if (!context) {
    throw new Error('useEditor must be used within EditorProvider');
  }
  return context;
}