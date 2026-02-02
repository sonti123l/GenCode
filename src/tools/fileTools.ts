import { invoke } from "@tauri-apps/api/core";


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
 * @param paths List of absolute file paths to read.
 * @param onProgress Optional callback for progress updates.
 * @returns Array of FileData objects containing path and content.
 */
export const fileTools = {
    readFiles: async (
        paths: string[], 
        onProgress?: (current: number, total: number, path: string) => void
    ): Promise<FileData[]> => {
        const results: FileData[] = [];
        const total = paths.length;
        
        // Process in batches of 5 for optimal performance
        const batchSize = 5;
        
        for (let i = 0; i < paths.length; i += batchSize) {
            const batch = paths.slice(i, i + batchSize);
            const batchPromises = batch.map(async (path, idx) => {
                const currentIndex = i + idx + 1;
                
                try {
                    if (onProgress) {
                        onProgress(currentIndex, total, path);
                    }
                    
                    const content = await invoke<string>("read_file_content", { path });
                    return { path, content };
                } catch (error) {
                    console.error(`Failed to read ${path}:`, error);
                    return { 
                        path, 
                        content: "", 
                        error: `Error reading file: ${error}` 
                    };
                }
            });
            
            const batchResults = await Promise.all(batchPromises);
            results.push(...batchResults);
        }
        
        return results;
    },

    /**
     * Reads a single file quickly.
     * @param path Absolute file path.
     * @returns FileData object.
     */
    readFile: async (path: string): Promise<FileData> => {
        try {
            const content = await invoke<string>("read_file_content", { path });
            return { path, content };
        } catch (error) {
            console.error(`Failed to read ${path}:`, error);
            return { 
                path, 
                content: "", 
                error: `Error reading file: ${error}` 
            };
        }
    },

    /**
     * Writes content to a file.
     * @param path Absolute path to write to.
     * @param content Content string.
     */
    writeFile: async (path: string, content: string): Promise<void> => {
        try {
            await invoke("write_file_content", { path, content });
        } catch (error) {
            console.error(`Failed to write ${path}:`, error);
            throw error;
        }
    },

    /**
     * Filters files by language/type from graph nodes.
     * @param nodes Graph nodes from Neo4j.
     * @param languages Array of language extensions to filter (e.g., ['ts', 'tsx']).
     * @returns Filtered file paths.
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
     * @param targetPath Path of the file to analyze.
     * @param edges Graph edges.
     * @param allNodes All graph nodes for path resolution.
     * @returns Array of related file paths.
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
        
        // Find imports/exports/dependencies
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

export default fileTools;
