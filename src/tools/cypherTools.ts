import { invoke } from "@tauri-apps/api/core";

export interface CodeGraph {
    nodes: Array<{
        id: string;
        type: string;
        name?: string;
        path?: string;
        language?: string;
        lines?: number;
        [key: string]: any;
    }>;
    edges: Array<{
        from: string;
        to: string;
        type: string;
        unresolved?: boolean;
        [key: string]: any;
    }>;
}

export interface QueryResult {
    success: boolean;
    data: any[];
    error?: string;
    summary: string;
}

export type AnalysisIntent = 
    | 'full_codebase' 
    | 'file_analysis' 
    | 'dependency_analysis' 
    | 'function_search' 
    | 'architecture_overview'
    | 'issues_detection';

/**
 * Intelligent Cypher query builder and executor.
 * Translates user intent into optimized graph queries.
 */
export const cypherTools = {
    /**
     * Detects user intent from natural language query.
     */
    detectIntent: (query: string): AnalysisIntent => {
        const q = query.toLowerCase();
        
        if (q.includes('entire') || q.includes('whole') || q.includes('all files') || q.includes('full codebase')) {
            return 'full_codebase';
        }
        if (q.includes('analyze') && (q.includes('file') || q.includes('this'))) {
            return 'file_analysis';
        }
        if (q.includes('depend') || q.includes('import') || q.includes('use') || q.includes('reference')) {
            return 'dependency_analysis';
        }
        if (q.includes('find') && (q.includes('function') || q.includes('method'))) {
            return 'function_search';
        }
        if (q.includes('architecture') || q.includes('structure') || q.includes('overview')) {
            return 'architecture_overview';
        }
        if (q.includes('issue') || q.includes('problem') || q.includes('bug') || q.includes('improve')) {
            return 'issues_detection';
        }
        
        return 'file_analysis'; // default
    },

    /**
     * Generates Cypher query based on intent.
     */
    buildQuery: (intent: AnalysisIntent, context?: { filePath?: string; searchTerm?: string }): string => {
        switch (intent) {
            case 'full_codebase':
                return `
                    MATCH (f:file)
                    OPTIONAL MATCH (f)-[r]->(target)
                    RETURN f.id as id, f.path as path, f.name as name, 
                           f.language as language, f.lines as lines,
                           collect(DISTINCT {type: r.type, target: target.path}) as relationships
                    LIMIT 500
                `;
            
            case 'file_analysis':
                if (context?.filePath) {
                    return `
                        MATCH (f:file {path: '${context.filePath}'})
                        OPTIONAL MATCH (f)-[r]->(dep)
                        OPTIONAL MATCH (func:function)-[:DEFINED_IN]->(f)
                        RETURN f as file, 
                               collect(DISTINCT dep) as dependencies,
                               collect(DISTINCT func) as functions
                    `;
                }
                return `MATCH (f:file) RETURN f LIMIT 50`;
            
            case 'dependency_analysis':
                return `
                    MATCH (f:file)-[r:IMPORTS|CALLS|EXTENDS]->(target)
                    RETURN f.path as source, target.path as target, r.type as relation
                    LIMIT 200
                `;
            
            case 'function_search':
                const search = context?.searchTerm || '';
                return `
                    MATCH (func:function)
                    WHERE func.name CONTAINS '${search}' OR func.name =~ '(?i).*${search}.*'
                    RETURN func, func.path as filePath
                    LIMIT 50
                `;
            
            case 'architecture_overview':
                return `
                    MATCH (f:file)
                    WITH f.language as lang, count(f) as count, collect(f.path) as files
                    RETURN lang, count, files[0..10] as sampleFiles
                    ORDER BY count DESC
                `;
            
            case 'issues_detection':
                return `
                    MATCH (f:file)
                    OPTIONAL MATCH (f)-[r:IMPORTS]->(imp)
                    WHERE imp IS NULL OR r.unresolved = true
                    RETURN f.path as path, f.lines as lines, 
                           collect(r) as unresolvedImports
                    LIMIT 100
                `;
            
            default:
                return `MATCH (n) RETURN n LIMIT 100`;
        }
    },

    /**
     * Executes Cypher query and returns structured results.
     */
    executeQuery: async (cypher: string): Promise<QueryResult> => {
        try {
            const result = await invoke<QueryResult>("execute_cypher_query", { cypher });
            return result;
        } catch (error) {
            return {
                success: false,
                data: [],
                error: String(error),
                summary: "Query execution failed"
            };
        }
    },

    /**
     * Extracts file paths from query results.
     */
    extractFilePaths: (result: QueryResult): string[] => {
        if (!result.success || !result.data) return [];
        
        const paths = new Set<string>();
        
        result.data.forEach((record: any) => {
            // Handle different result structures
            if (record.f && record.f.path) paths.add(record.f.path);
            if (record.file && record.file.path) paths.add(record.file.path);
            if (record.path) paths.add(record.path);
            if (record.source) paths.add(record.source);
            if (record.target) paths.add(record.target);
            if (record.files && Array.isArray(record.files)) {
                record.files.forEach((p: string) => paths.add(p));
            }
            if (record.sampleFiles && Array.isArray(record.sampleFiles)) {
                record.sampleFiles.forEach((p: string) => paths.add(p));
            }
        });
        
        return Array.from(paths).filter(p => p && typeof p === 'string');
    },

    /**
     * High-level analysis orchestrator.
     * Intent -> Query -> Execute -> Extract Paths.
     */
    analyze: async (userQuery: string, context?: { filePath?: string }): Promise<{
        intent: AnalysisIntent;
        query: string;
        result: QueryResult;
        filePaths: string[];
    }> => {
        const intent = cypherTools.detectIntent(userQuery);
        const searchTerm = userQuery.replace(/find|search|look for/gi, '').trim();
        
        const query = cypherTools.buildQuery(intent, {
            ...context,
            searchTerm
        });
        
        const result = await cypherTools.executeQuery(query);
        const filePaths = cypherTools.extractFilePaths(result);
        
        return { intent, query, result, filePaths };
    }
};

export default cypherTools;
