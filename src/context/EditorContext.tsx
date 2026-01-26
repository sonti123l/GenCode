// contexts/EditorContext.tsx
import { createContext, useContext, useState, ReactNode, SetStateAction, Dispatch } from 'react';

interface EditorContextType {
  selectedFile: string[];
  fileContent: string;
  setSelectedFile: Dispatch<SetStateAction<string[]>>
  setFileContent: (content: string) => void;
}

const EditorContext = createContext<EditorContextType | undefined>(undefined);

export function EditorProvider({ children }: { children: ReactNode }) {
  const [selectedFile, setSelectedFile] = useState<string[]>([]);
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