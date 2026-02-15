// src/tools/fileTools.ts
import { invoke } from "@tauri-apps/api/core";
import { FileSearchResult, EditResult, EditOperation } from "@/helpers/interfaces/file-types";

export interface FileData {
  path: string;
  content: string;
  error?: string;
}

export interface FileNode {
  id: string;
  type: string;
  name?: string;
  path?: string;
  language?: string;
  lines?: number;
  [key: string]: any;
}

/**
 * Reads multiple files concurrently with progress tracking.
 * Used by AI to analyze file contents after retrieving paths from Neo4j.
 */
export const fileTools = {
  readFiles: async (
    paths: string[],
    onProgress?: (current: number, total: number, path: string) => void
  ): Promise<FileData[]> => {
    const results: FileData[] = [];
    const total = paths.length;
    const batchSize = 5;

    for (let i = 0; i < paths.length; i += batchSize) {
      const batch = paths.slice(i, i + batchSize);

      try {
        const batchResult = await invoke<any>("read_file_content", { paths: batch });

        console.log("DEBUG: read_file_content returned:", batchResult);

        if (Array.isArray(batchResult)) {
          batchResult.forEach((item: any) => {
            if (Array.isArray(item) && item.length === 2) {
              const [path, content] = item;
              results.push({ path, content });
            } else if (typeof item === 'object' && item.path) {
              results.push({
                path: item.path,
                content: item.content || ""
              });
            }
          });
        } else if (typeof batchResult === 'object' && batchResult !== null) {
          Object.entries(batchResult).forEach(([path, content]) => {
            results.push({
              path,
              content: typeof content === 'string' ? content : String(content)
            });
          });
        }

        batch.forEach(requestedPath => {
          const found = results.some(r => {
            const normalizedResult = r.path.toLowerCase().replace(/\\/g, '/');
            const normalizedRequested = requestedPath.toLowerCase().replace(/\\/g, '/');
            return normalizedResult === normalizedRequested ||
              normalizedResult.endsWith(normalizedRequested) ||
              normalizedRequested.endsWith(normalizedResult);
          });

          if (!found) {
            console.warn(`Path not found in results: ${requestedPath}`);
            results.push({
              path: requestedPath,
              content: "",
              error: "No content returned from backend"
            });
          }
        });

        if (onProgress) {
          onProgress(Math.min(i + batchSize, total), total, batch[batch.length - 1]);
        }

      } catch (error) {
        console.error(`Failed to read batch ${batch}:`, error);
        batch.forEach(path => {
          results.push({
            path,
            content: "",
            error: `Error reading batch: ${error}`
          });
        });
      }
    }

    return results;
  },

  readFile: async (path: string): Promise<FileData> => {
    try {
      const result = await invoke<any>("read_file_content", { paths: [path] });

      if (Array.isArray(result) && result.length > 0) {
        const item = result[0];
        if (Array.isArray(item) && item.length === 2) {
          const [returnedPath, content] = item;
          return { path: returnedPath, content };
        } else if (typeof item === 'object' && item.path) {
          return { path: item.path, content: item.content || "" };
        }
      }

      if (typeof result === 'object' && result !== null && !Array.isArray(result)) {
        const content = result[path] || "";
        return { path, content };
      }

      return { path, content: "", error: "Unexpected response format" };
    } catch (error) {
      console.error(`Failed to read ${path}:`, error);
      return {
        path,
        content: "",
        error: `Error reading file: ${error}`
      };
    }
  },

  writeFile: async (path: string, content: string): Promise<void> => {
    try {
      await invoke("write_file_content", { path, content });
    } catch (error) {
      console.error(`Failed to write ${path}:`, error);
      throw error;
    }
  },

  /**
   * Search for text patterns across files using regex or string matching.
   * Returns matches with context for precise editing.
   */
  searchInFiles: async (
    paths: string[],
    pattern: string,
    options?: {
      regex?: boolean;
      caseSensitive?: boolean;
      contextLines?: number;
    }
  ): Promise<FileSearchResult[]> => {
    const results: FileSearchResult[] = [];
    const contextLines = options?.contextLines ?? 3;

    for (const path of paths) {
      try {
        const fileData = await fileTools.readFile(path);
        if (fileData.error) continue;

        const lines = fileData.content.split('\n');
        const matches = [];

        const searchRegex = options?.regex
          ? new RegExp(pattern, options.caseSensitive ? 'g' : 'gi')
          : new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
            options?.caseSensitive ? 'g' : 'gi');

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          const match = searchRegex.exec(line);

          if (match) {
            const startLine = Math.max(0, i - contextLines);
            const endLine = Math.min(lines.length, i + contextLines + 1);

            matches.push({
              line: i + 1,
              column: match.index + 1,
              content: line,
              context: lines.slice(startLine, endLine)
            });
          }
        }

        if (matches.length > 0) {
          results.push({ path, matches });
        }
      } catch (error) {
        console.error(`Search failed in ${path}:`, error);
      }
    }

    return results;
  },

  /**
   * Apply search/replace edit with fuzzy matching support.
   * Similar to Aider's EditBlock format.
   */
  applySearchReplace: async (
    path: string,
    search: string,
    replace: string,
    options?: {
      fuzzy?: boolean;
      lineNumber?: number;
      preserveIndentation?: boolean;
    }
  ): Promise<EditResult> => {
    try {
      const fileData = await fileTools.readFile(path);
      if (fileData.error) {
        return { success: false, path, error: fileData.error };
      }

      const oldContent = fileData.content;
      let newContent = oldContent;

      // Normalize line endings
      const normalizedSearch = search.replace(/\r\n/g, '\n').trim();
      const normalizedReplace = replace.replace(/\r\n/g, '\n');
      const normalizedContent = oldContent.replace(/\r\n/g, '\n');

      // Try exact match first
      if (normalizedContent.includes(normalizedSearch)) {
        newContent = normalizedContent.replace(normalizedSearch, normalizedReplace);
      } else if (options?.fuzzy) {
        // Fuzzy matching with whitespace tolerance
        const searchLines = normalizedSearch.split('\n');
        const contentLines = normalizedContent.split('\n');

        let bestMatch = { score: 0, index: -1 };

        for (let i = 0; i <= contentLines.length - searchLines.length; i++) {
          const block = contentLines.slice(i, i + searchLines.length).join('\n');
          const score = calculateSimilarity(normalizedSearch, block);

          if (score > bestMatch.score && score > 0.8) {
            bestMatch = { score, index: i };
          }
        }

        if (bestMatch.index !== -1) {
          const before = contentLines.slice(0, bestMatch.index).join('\n');
          const after = contentLines.slice(bestMatch.index + searchLines.length).join('\n');

          newContent = before +
            (before ? '\n' : '') +
            normalizedReplace +
            (after ? '\n' : '') +
            after;
        } else {
          return {
            success: false,
            path,
            error: `Could not find matching block. Search content:\n${search}`
          };
        }
      } else {
        return {
          success: false,
          path,
          error: `Exact match not found. Consider using fuzzy matching.`
        };
      }

      // Preserve original line endings
      if (oldContent.includes('\r\n')) {
        newContent = newContent.replace(/\n/g, '\r\n');
      }

      await fileTools.writeFile(path, newContent);

      // Generate diff for display
      const diff = generateDiff(path, oldContent, newContent);

      return {
        success: true,
        path,
        diff,
        oldContent,
        newContent
      };

    } catch (error) {
      return { success: false, path, error: String(error) };
    }
  },

  /**
   * Create a new file with the given content.
   * FIXED: Now uses create_file command which handles parent directories
   */
  createFile: async (path: string, content: string): Promise<EditResult> => {
    try {
      // Use create_file command instead of write_file_content
      // This will create parent directories if needed
      await invoke("create_file", { path, content });

      return {
        success: true,
        path,
        diff: `--- /dev/null\n+++ ${path}\n@@ -0,0 +1,${content.split('\n').length} @@\n${content.split('\n').map(l => '+' + l).join('\n')}`,
        newContent: content
      };
    } catch (error) {
      return { success: false, path, error: String(error) };
    }
  },

  /**
   * Delete a file.
   */
  deleteFile: async (path: string): Promise<EditResult> => {
    try {
      const fileData = await fileTools.readFile(path);
      if (fileData.error) {
        return { success: false, path, error: fileData.error };
      }

      await invoke("delete_file", { path });

      return {
        success: true,
        path,
        diff: `--- ${path}\n+++ /dev/null\n@@ -1,${fileData.content.split('\n').length} +0,0 @@\n${fileData.content.split('\n').map(l => '-' + l).join('\n')}`,
        oldContent: fileData.content
      };
    } catch (error) {
      return { success: false, path, error: String(error) };
    }
  },

  /**
   * Insert content at a specific line number.
   */
  insertAtLine: async (
    path: string,
    line: number,
    content: string
  ): Promise<EditResult> => {
    try {
      const fileData = await fileTools.readFile(path);
      if (fileData.error) {
        return { success: false, path, error: fileData.error };
      }

      const lines = fileData.content.split('\n');
      const insertIndex = Math.min(line - 1, lines.length);

      lines.splice(insertIndex, 0, content);
      const newContent = lines.join('\n');

      await fileTools.writeFile(path, newContent);

      return {
        success: true,
        path,
        diff: generateDiff(path, fileData.content, newContent),
        oldContent: fileData.content,
        newContent
      };
    } catch (error) {
      return { success: false, path, error: String(error) };
    }
  },

  /**
   * Apply multiple edits atomically (all succeed or all fail).
   * Uses transaction pattern for safety.
   */
  applyEdits: async (edits: EditOperation[]): Promise<EditResult[]> => {
    const results: EditResult[] = [];
    const backupMap = new Map<string, string>();

    try {
      // Create backups
      for (const edit of edits) {
        const fileData = await fileTools.readFile(edit.path);
        if (!fileData.error && !backupMap.has(edit.path)) {
          backupMap.set(edit.path, fileData.content);
        }
      }

      // Apply edits
      for (const edit of edits) {
        let result: EditResult;

        switch (edit.type) {
          case 'search_replace':
            if (!edit.search || !edit.replace) {
              result = { success: false, path: edit.path, error: "Missing search or replace" };
            } else {
              result = await fileTools.applySearchReplace(
                edit.path,
                edit.search,
                edit.replace,
                { fuzzy: true, preserveIndentation: true }
              );
            }
            break;

          case 'create':
            if (!edit.content) {
              result = { success: false, path: edit.path, error: "Missing content" };
            } else {
              result = await fileTools.createFile(edit.path, edit.content);
            }
            break;

          case 'delete':
            result = await fileTools.deleteFile(edit.path);
            break;

          case 'insert':
            if (!edit.content || !edit.line) {
              result = { success: false, path: edit.path, error: "Missing content or line" };
            } else {
              result = await fileTools.insertAtLine(edit.path, edit.line, edit.content);
            }
            break;

          case 'patch':
            if (!edit.patch) {
              result = { success: false, path: edit.path, error: "Missing patch" };
            } else {
              result = await fileTools.applyPatch(edit.path, edit.patch);
            }
            break;

          default:
            result = { success: false, path: edit.path, error: "Unknown edit type" };
        }

        results.push(result);

        if (!result.success) {
          // Rollback on failure
          for (const [path, content] of backupMap) {
            await fileTools.writeFile(path, content);
          }
          throw new Error(`Edit failed for ${edit.path}: ${result.error}`);
        }
      }

      return results;
    } catch (error) {
      return results.map(r =>
        r.success ? { ...r, success: false, error: "Rolled back due to subsequent failure" } : r
      );
    }
  },

  /**
   * Apply a unified diff/patch to a file.
   * Supports standard unified diff format.
   */
  applyPatch: async (path: string, patch: string): Promise<EditResult> => {
    try {
      const fileData = await fileTools.readFile(path);
      if (fileData.error && !patch.includes('/dev/null')) {
        return { success: false, path, error: fileData.error };
      }

      const oldContent = fileData.error ? "" : fileData.content;
      const newContent = applyUnifiedDiff(oldContent, patch);

      await fileTools.writeFile(path, newContent);

      return {
        success: true,
        path,
        diff: patch,
        oldContent,
        newContent
      };
    } catch (error) {
      return { success: false, path, error: String(error) };
    }
  },

  /**
   * Get directory structure for context.
   */
  getDirectoryTree: async (rootPath: string, depth: number = 3): Promise<string> => {
    try {
      return await invoke("get_directory_tree", { path: rootPath, depth });
    } catch (error) {
      return `Error: ${error}`;
    }
  },

  /**
   * Filter files by language/type from graph nodes.
   */
  filterFilesByLanguage: (nodes: FileNode[], languages?: string[]): string[] => {
    return nodes
      .filter(node => {
        if (node.type !== 'file') return false;
        if (!languages || languages.length === 0) return true;
        const ext = node.path?.split('.').pop()?.toLowerCase();
        return ext && languages.includes(ext);
      })
      .map(node => node.path)
      .filter((path): path is string => !!path);
  },

  /**
   * Gets related files for a specific file (imports, dependencies).
   */
  getRelatedFiles: (
    targetPath: string,
    edges: any[],
    allNodes: FileNode[]
  ): string[] => {
    const nodeMap = new Map(allNodes.map(n => [n.id, n]));
    const targetNode = allNodes.find(n => n.path === targetPath);

    if (!targetNode) return [];

    const relatedIds = new Set<string>();

    edges.forEach(edge => {
      if (edge.from === targetNode.id || edge.to === targetNode.id) {
        relatedIds.add(edge.from === targetNode.id ? edge.to : edge.from);
      }
    });

    return Array.from(relatedIds)
      .map(id => nodeMap.get(id)?.path)
      .filter((path): path is string => !!path);
  }
};

// Utility functions
export function calculateSimilarity(a: string, b: string): number {
  if (a === b) return 1.0;

  const len = Math.max(a.length, b.length);
  if (len === 0) return 1.0;

  const distance = levenshteinDistance(a, b);
  return 1 - distance / len;
}

export function levenshteinDistance(a: string, b: string): number {
  const matrix = Array(b.length + 1).fill(null).map(() => Array(a.length + 1).fill(null));

  for (let i = 0; i <= a.length; i++) matrix[0][i] = i;
  for (let j = 0; j <= b.length; j++) matrix[j][0] = j;

  for (let j = 1; j <= b.length; j++) {
    for (let i = 1; i <= a.length; i++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[j][i] = Math.min(
        matrix[j][i - 1] + 1,
        matrix[j - 1][i] + 1,
        matrix[j - 1][i - 1] + cost
      );
    }
  }

  return matrix[b.length][a.length];
}

export function generateDiff(path: string, oldContent: string, newContent: string): string {
  const oldLines = oldContent.split('\n');
  const newLines = newContent.split('\n');

  let diff = `--- ${path}\n+++ ${path}\n`;

  const maxLines = Math.max(oldLines.length, newLines.length);
  let inHunk = false;

  for (let i = 0; i < maxLines; i++) {
    const oldLine = oldLines[i] ?? "";
    const newLine = newLines[i] ?? "";

    if (oldLine !== newLine) {
      if (!inHunk) {
        diff += `@@ -${i + 1},1 +${i + 1},1 @@\n`;
        inHunk = true;
      }
      if (oldLine !== undefined) diff += `-${oldLine}\n`;
      if (newLine !== undefined) diff += `+${newLine}\n`;
    } else {
      inHunk = false;
      diff += ` ${oldLine}\n`;
    }
  }

  return diff;
}

export function applyUnifiedDiff(content: string, patch: string): string {
  const lines = content.split('\n');
  const patchLines = patch.split('\n');
  let result = [...lines];
  let lineOffset = 0;

  for (let i = 0; i < patchLines.length; i++) {
    const line = patchLines[i];

    if (line.startsWith('@@')) {
      const match = line.match(/@@ -(\d+),?(\d*) \+(\d+),?(\d*) @@/);
      if (match) {
        const startLine = parseInt(match[1]) - 1 + lineOffset;
        let removeCount = parseInt(match[2] || '1');


        const toRemove: string[] = [];
        const toAdd: string[] = [];

        i++;
        while (i < patchLines.length && !patchLines[i].startsWith('@@')) {
          if (patchLines[i].startsWith('-')) {
            toRemove.push(patchLines[i].slice(1));
          } else if (patchLines[i].startsWith('+')) {
            toAdd.push(patchLines[i].slice(1));
          }
          i++;
        }
        i--;

        result.splice(startLine, removeCount, ...toAdd);
        lineOffset += toAdd.length - removeCount;
      }
    }
  }

  return result.join('\n');
}

export default fileTools;