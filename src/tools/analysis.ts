
import { fileTools, FileData } from './fileTools';
import { cypherTools, AnalysisIntent, QueryResult } from './cypherTools';

export interface AnalysisProgress {
    stage: 'querying' | 'reading' | 'analyzing' | 'complete';
    current: number;
    total: number;
    message: string;
    filePath?: string;
}

export interface AnalysisResult {
    intent: AnalysisIntent;
    fileData: FileData[];
    graphData: QueryResult;
    summary: string;
}

/**
 * Analysis Engine - Orchestrates the complete workflow:
 * User Query -> Cypher Query -> File Reading -> AI Analysis.
 */
export class AnalysisEngine {
    private onProgress?: (progress: AnalysisProgress) => void;

    constructor(onProgress?: (progress: AnalysisProgress) => void) {
        this.onProgress = onProgress;
    }

    private reportProgress(progress: AnalysisProgress) {
        if (this.onProgress) {
            this.onProgress(progress);
        }
    }

    /**
     * Main analysis workflow.
     * @param userQuery Natural language query from user.
     * @param currentFilePath Currently selected file (optional context).
     * @returns Analysis results with file contents.
     */
    async analyze(userQuery: string, currentFilePath?: string): Promise<AnalysisResult> {
        // Stage 1: Query the graph
        this.reportProgress({
            stage: 'querying',
            current: 0,
            total: 1,
            message: 'Analyzing query intent...'
        });

        const analysis = await cypherTools.analyze(userQuery, { filePath: currentFilePath });
        
        if (!analysis.result.success) {
            throw new Error(`Graph query failed: ${analysis.result.error}`);
        }

        this.reportProgress({
            stage: 'querying',
            current: 1,
            total: 1,
            message: `Found ${analysis.filePaths.length} relevant files`,
        });

        // Stage 2: Read files
        let fileData: FileData[] = [];
        
        if (analysis.filePaths.length > 0) {
            this.reportProgress({
                stage: 'reading',
                current: 0,
                total: analysis.filePaths.length,
                message: `Reading ${analysis.filePaths.length} files...`
            });

            fileData = await fileTools.readFiles(
                analysis.filePaths,
                (current, total, path) => {
                    this.reportProgress({
                        stage: 'reading',
                        current,
                        total,
                        message: `Reading file ${current}/${total}`,
                        filePath: path
                    });
                }
            );
        }

        // Stage 3: Prepare summary
        this.reportProgress({
            stage: 'analyzing',
            current: fileData.length,
            total: fileData.length,
            message: 'Preparing analysis context...'
        });

        const validFiles = fileData.filter(f => !f.error);
        const summary = this.generateSummary(analysis.intent, validFiles, analysis.result);

        this.reportProgress({
            stage: 'complete',
            current: 1,
            total: 1,
            message: 'Analysis complete'
        });

        return {
            intent: analysis.intent,
            fileData: validFiles,
            graphData: analysis.result,
            summary
        };
    }

    /**
     * Quick analysis for a specific file and its dependencies.
     */
    async analyzeFileWithDependencies(filePath: string): Promise<AnalysisResult> {
        this.reportProgress({
            stage: 'querying',
            current: 0,
            total: 1,
            message: 'Finding file dependencies...'
        });

        // Get file + dependencies
        const query = `
            MATCH (f:file {path: '${filePath}'})
            OPTIONAL MATCH (f)-[r:IMPORTS|CALLS]->(dep:file)
            RETURN f.path as mainFile, collect(dep.path) as dependencies
        `;
        
        const result = await cypherTools.executeQuery(query);
        
        if (!result.success || result.data.length === 0) {
            // Fallback: just read the file directly
            const fileContent = await fileTools.readFile(filePath);
            return {
                intent: 'file_analysis',
                fileData: [fileContent],
                graphData: result,
                summary: `Direct analysis of ${filePath}`
            };
        }

        const record = result.data[0];
        const allPaths = [record.mainFile, ...(record.dependencies || [])].filter(Boolean);
        
        this.reportProgress({
            stage: 'reading',
            current: 0,
            total: allPaths.length,
            message: `Reading ${allPaths.length} files (including dependencies)...`
        });

        const fileData = await fileTools.readFiles(allPaths, (current, total, path) => {
            this.reportProgress({
                stage: 'reading',
                current,
                total,
                message: `Reading dependency ${current}/${total}`,
                filePath: path
            });
        });

        const validFiles = fileData.filter(f => !f.error);
        
        return {
            intent: 'dependency_analysis',
            fileData: validFiles,
            graphData: result,
            summary: `Analyzed ${filePath} with ${validFiles.length - 1} dependencies`
        };
    }

    /**
     * Generates a human-readable summary of the analysis.
     */
    private generateSummary(
        intent: AnalysisIntent, 
        files: FileData[], 
        graphResult: QueryResult
    ): string {
        const fileList = files.map(f => `- ${f.path.split(/[\\/]/).pop()}`).join('\\n');
        
        switch (intent) {
            case 'full_codebase':
                return `Full codebase analysis complete.\\n\\n**Files analyzed (${files.length}):**\\n${fileList}`;
            
            case 'file_analysis':
                return `File analysis complete for ${files.length} file(s).`;
            
            case 'dependency_analysis':
                return `Dependency analysis complete. Found ${files.length} related files.`;
            
            case 'architecture_overview':
                const langStats = this.extractLanguageStats(graphResult);
                return `Architecture overview:\\n${langStats}\\n\\nSample files analyzed: ${files.length}`;
            
            case 'issues_detection':
                return `Issue detection scan complete. Analyzed ${files.length} files for potential problems.`;
            
            default:
                return `Analysis complete. Processed ${files.length} files.`;
        }
    }

    private extractLanguageStats(result: QueryResult): string {
        if (!result.data) return '';
        
        return result.data
            .filter((r: any) => r.lang)
            .map((r: any) => `- ${r.lang}: ${r.count} files`)
            .join('\\n');
    }
}

export default AnalysisEngine;
