import { invoke } from '@tauri-apps/api/core';

export interface ASTNode {
  node_type: string;
  text: string | null;
  start_line: number;
  start_col: number;
  end_line: number;
  end_col: number;
  start_byte: number;
  end_byte: number;
  is_named: boolean;
  children: ASTNode[];
}

export interface ParseMetadata {
  lines: number;
  bytes: number;
  node_count: number;
  tree_depth: number;
  has_syntax_errors: boolean;
}

export interface ParsedFile {
  path: string;
  language: string;
  success: boolean;
  error: string | null;
  ast: ASTNode | null;
  metadata: ParseMetadata;
}


export class ParserAPI {

  async parseFiles(files: [string, string][]): Promise<ParsedFile[]> {
    return await invoke<ParsedFile[]>('parse_files', { files });
  }

  async parseSingleFile(path: string, content: string): Promise<ParsedFile> {
    return await invoke<ParsedFile>('parse_single_file', { path, content });
  }


  async readAndParseFiles(paths: string[]): Promise<ParsedFile[]> {
    return await invoke<ParsedFile[]>('read_and_parse_files', { paths });
  }

  async getSupportedLanguages(): Promise<Record<string, string[]>> {
    return await invoke<Record<string, string[]>>('get_supported_languages');
  }

  async parseProjectFolder(folderPath: string): Promise<ParsedFile[]> {
    const fileTree = await invoke<any[]>('read_directory', { path: folderPath });
    
    const filePaths = this.extractFilePaths(fileTree);
    
    const parsedFiles = await this.readAndParseFiles(filePaths);
    
    return parsedFiles;
  }

  private extractFilePaths(entries: any[]): string[] {
    const paths: string[] = [];
    
    for (const entry of entries) {
      if (entry.is_dir && entry.children) {
        paths.push(...this.extractFilePaths(entry.children));
      } else if (!entry.is_dir) {
        paths.push(entry.path);
      }
    }
    
    return paths;
  }

  findNodesByType(ast: ASTNode, nodeType: string): ASTNode[] {
    const results: ASTNode[] = [];
    
    const traverse = (node: ASTNode) => {
      if (node.node_type === nodeType) {
        results.push(node);
      }
      for (const child of node.children) {
        traverse(child);
      }
    };
    
    traverse(ast);
    return results;
  }

  extractFunctions(ast: ASTNode, language: string): Array<{name: string, line: number}> {
    const functions: Array<{name: string, line: number}> = [];
    
    const functionTypes: Record<string, string[]> = {
      javascript: ['function_declaration', 'method_definition', 'arrow_function'],
      typescript: ['function_declaration', 'method_definition'],
      python: ['function_definition'],
      rust: ['function_item'],
      java: ['method_declaration'],
      go: ['function_declaration', 'method_declaration'],
      c: ['function_definition'],
      cpp: ['function_definition'],
    };

    const types = functionTypes[language] || [];
    
    const traverse = (node: ASTNode) => {
      if (types.includes(node.node_type)) {
        const nameNode = node.children.find(c => 
          c.node_type === 'identifier' || 
          c.node_type === 'property_identifier'
        );
        
        if (nameNode && nameNode.text) {
          functions.push({
            name: nameNode.text,
            line: node.start_line + 1
          });
        }
      }
      
      for (const child of node.children) {
        traverse(child);
      }
    };
    
    traverse(ast);
    return functions;
  }

  extractClasses(ast: ASTNode, language: string): Array<{name: string, line: number}> {
    const classes: Array<{name: string, line: number}> = [];
    
    const classTypes: Record<string, string[]> = {
      javascript: ['class_declaration'],
      typescript: ['class_declaration'],
      python: ['class_definition'],
      rust: ['struct_item', 'impl_item'],
      java: ['class_declaration'],
      cpp: ['class_specifier'],
      c: ['struct_specifier'],
    };

    const types = classTypes[language] || [];
    
    const traverse = (node: ASTNode) => {
      if (types.includes(node.node_type)) {
        const nameNode = node.children.find(c => 
          c.node_type === 'identifier' || 
          c.node_type === 'type_identifier'
        );
        
        if (nameNode && nameNode.text) {
          classes.push({
            name: nameNode.text,
            line: node.start_line + 1
          });
        }
      }
      
      for (const child of node.children) {
        traverse(child);
      }
    };
    
    traverse(ast);
    return classes;
  }

  extractImports(ast: ASTNode, language: string): string[] {
    const imports: string[] = [];
    
    const importTypes: Record<string, string[]> = {
      javascript: ['import_statement'],
      typescript: ['import_statement'],
      python: ['import_statement', 'import_from_statement'],
      rust: ['use_declaration'],
      java: ['import_declaration'],
      go: ['import_declaration'],
    };

    const types = importTypes[language] || [];
    
    const traverse = (node: ASTNode) => {
      if (types.includes(node.node_type)) {
        if (node.text) {
          imports.push(node.text);
        }
      }
      for (const child of node.children) {
        traverse(child);
      }
    };
    
    traverse(ast);
    return imports;
  }


  generateHighlightTokens(ast: ASTNode): Array<{
    start: number;
    end: number;
    type: string;
  }> {
    const tokens: Array<{ start: number; end: number; type: string }> = [];
    
    const traverse = (node: ASTNode) => {
      if (node.is_named && node.start_byte !== node.end_byte) {
        tokens.push({
          start: node.start_byte,
          end: node.end_byte,
          type: node.node_type
        });
      }
      
      for (const child of node.children) {
        traverse(child);
      }
    };
    
    traverse(ast);
    return tokens;
  }

  /**
   * Get code outline (functions, classes, etc.) for sidebar
   */
  async getFileOutline(path: string, content: string): Promise<{
    functions: Array<{name: string, line: number}>;
    classes: Array<{name: string, line: number}>;
  }> {
    const parsed = await this.parseSingleFile(path, content);
    
    if (!parsed.success || !parsed.ast) {
      return { functions: [], classes: [] };
    }

    return {
      functions: this.extractFunctions(parsed.ast, parsed.language),
      classes: this.extractClasses(parsed.ast, parsed.language)
    };
  }
}

export const parser = new ParserAPI();

export async function onProjectOpen(folderPath: string) {
  
  try {
    const parsedFiles = await parser.parseProjectFolder(folderPath);
    
    const byLanguage: Record<string, ParsedFile[]> = {};
    for (const file of parsedFiles) {
      if (file.success) {
        if (!byLanguage[file.language]) {
          byLanguage[file.language] = [];
        }
        byLanguage[file.language].push(file);
      }
    }
    
    for (const [lang, files] of Object.entries(byLanguage)) {
      const totalLines = files.reduce((sum, f) => sum + f.metadata.lines, 0);
      const totalNodes = files.reduce((sum, f) => sum + f.metadata.node_count, 0);
      console.log(`  ${lang}: ${files.length} files, ${totalLines} lines, ${totalNodes} AST nodes`);
    }
    
    return parsedFiles;
  } catch (error) {
    console.error('Failed to parse project:', error);
    throw error;
  }
}


export async function onFileOpen(filePath: string, content: string) {
  try {
    const parsed = await parser.parseSingleFile(filePath, content);
    
    if (!parsed.success) {
      console.error('Parse failed:', parsed.error);
      return null;
    }
    
    console.log(`Parsed ${filePath}:`, {
      language: parsed.language,
      lines: parsed.metadata.lines,
      nodes: parsed.metadata.node_count,
      hasErrors: parsed.metadata.has_syntax_errors
    });
    
    return parsed;
  } catch (error) {
    console.error('Failed to parse file:', error);
    return null;
  }
}

export async function updateFileSidebar(filePath: string, content: string) {
  const outline = await parser.getFileOutline(filePath, content);
  
  console.log('File outline:');
  console.log('Functions:', outline.functions);
  console.log('Classes:', outline.classes);
  
  return outline;
}

export async function onFileChange(filePath: string, content: string) {
  const parsed = await parser.parseSingleFile(filePath, content);
  
  if (parsed.success && parsed.ast) {
    const tokens = parser.generateHighlightTokens(parsed.ast);
    
    if (parsed.metadata.has_syntax_errors) {
      console.warn('Syntax errors detected in', filePath);
    }
    
    return { parsed, tokens };
  }
  
  return null;
}

export async function findAllFunctionsInProject(folderPath: string) {
  const parsedFiles = await parser.parseProjectFolder(folderPath);
  
  const allFunctions: Array<{
    file: string;
    name: string;
    line: number;
    language: string;
  }> = [];
  
  for (const file of parsedFiles) {
    if (file.success && file.ast) {
      const functions = parser.extractFunctions(file.ast, file.language);
      
      for (const func of functions) {
        allFunctions.push({
          file: file.path,
          name: func.name,
          line: func.line,
          language: file.language
        });
      }
    }
  }
  
  return allFunctions;
}

export async function getProjectStats(folderPath: string) {
  const parsedFiles = await parser.parseProjectFolder(folderPath);
  
  const stats = {
    totalFiles: parsedFiles.length,
    successfulParses: 0,
    failedParses: 0,
    totalLines: 0,
    totalNodes: 0,
    languages: new Set<string>(),
    filesWithErrors: 0,
  };
  
  for (const file of parsedFiles) {
    if (file.success) {
      stats.successfulParses++;
      stats.totalLines += file.metadata.lines;
      stats.totalNodes += file.metadata.node_count;
      stats.languages.add(file.language);
      
      if (file.metadata.has_syntax_errors) {
        stats.filesWithErrors++;
      }
    } else {
      stats.failedParses++;
    }
  }
  
  return {
    ...stats,
    languages: Array.from(stats.languages)
  };
}