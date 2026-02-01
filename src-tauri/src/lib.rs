use futures::StreamExt;
use neo4rs::{Graph, query};
use portable_pty::{native_pty_system, CommandBuilder, PtySize};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs as std_fs;
use std::io::{Read, Write};
use std::path::Path;
use std::sync::{Arc, Mutex};
use tauri::{Emitter, State, Window};
use tokio::fs;
use tokio::task;
use tree_sitter::{Language, Node, Parser};

// ============================================================================
// NEO4J STATE
// ============================================================================

pub struct Neo4jState {
    graph: Arc<Mutex<Option<Arc<Graph>>>>,
}

impl Neo4jState {
    pub fn new() -> Self {
        Neo4jState {
            graph: Arc::new(Mutex::new(None)),
        }
    }

    pub async fn connect(&self, uri: &str, user: &str, password: &str) -> Result<(), String> {
        let graph = Graph::new(uri, user, password)
            .await
            .map_err(|e| format!("Failed to connect to Neo4j: {}", e))?;
        
        let mut g = self.graph.lock().unwrap();
        *g = Some(Arc::new(graph));
        Ok(())
    }

    pub fn get_graph(&self) -> Result<Arc<Graph>, String> {
        let g = self.graph.lock().unwrap();
        g.as_ref()
            .ok_or_else(|| "Not connected to Neo4j".to_string())
            .cloned()
    }

    pub fn is_connected(&self) -> bool {
        let g = self.graph.lock().unwrap();
        g.is_some()
    }
}

// ============================================================================
// CODE GRAPH STRUCTURES
// ============================================================================

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CodeGraphNode {
    pub id: String,
    #[serde(rename = "type")]
    pub node_type: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub language: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub lines: Option<usize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub start_line: Option<usize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub end_line: Option<usize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub line: Option<usize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source: Option<String>,
    #[serde(flatten)]
    pub extra: HashMap<String, serde_json::Value>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CodeGraphEdge {
    pub from: String,
    pub to: String,
    #[serde(rename = "type")]
    pub edge_type: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub unresolved: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub edge_type_secondary: Option<String>,
    #[serde(flatten)]
    pub extra: HashMap<String, serde_json::Value>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CodeGraphFile {
    pub id: usize,
    #[serde(rename = "type")]
    pub file_type: String,
    pub path: String,
    pub language: String,
    pub lines: usize,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CodeGraph {
    pub nodes: Vec<CodeGraphNode>,
    pub edges: Vec<CodeGraphEdge>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub files: Option<Vec<CodeGraphFile>>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct GraphContext {
    pub summary: String,
    pub cypher_schema: String,
    pub sample_queries: Vec<String>,
    pub nodes_by_type: HashMap<String, usize>,
    pub edges_by_type: HashMap<String, usize>,
    pub graph_statistics: GraphStatistics,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct GraphStatistics {
    pub total_nodes: usize,
    pub total_edges: usize,
    pub max_depth: usize,
    pub connected_components: usize,
    pub avg_connections_per_node: f64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CypherQueryResult {
    pub success: bool,
    pub data: Vec<serde_json::Value>,
    pub error: Option<String>,
    pub summary: String,
}

// ============================================================================
// NEO4J OPERATIONS - FIXED
// ============================================================================

impl CodeGraph {
    pub async fn store_in_neo4j(&self, graph: &Graph) -> Result<String, String> {
        // Clear existing data
        graph
            .run(query("MATCH (n) DETACH DELETE n"))
            .await
            .map_err(|e| format!("Failed to clear database: {}", e))?;

        // Create nodes
        for node in &self.nodes {
            let node_type = node.node_type.to_uppercase();
            let id = node.id.clone();
            let name = node.name.clone().unwrap_or_else(|| "unknown".to_string());
            let path = node.path.clone().unwrap_or_default();

            // Build dynamic query based on available fields
            let mut properties = vec!["id: $id", "name: $name", "path: $path"];
            
            if node.language.is_some() {
                properties.push("language: $language");
            }
            if node.lines.is_some() {
                properties.push("lines: $lines");
            }
            if node.start_line.is_some() {
                properties.push("startLine: $startLine");
            }
            if node.end_line.is_some() {
                properties.push("endLine: $endLine");
            }
            if node.line.is_some() {
                properties.push("line: $line");
            }
            if node.source.is_some() {
                properties.push("source: $source");
            }

            let query_str = format!(
                "CREATE (n:{} {{{}}})",
                node_type,
                properties.join(", ")
            );

            let mut cypher = query(&query_str)
                .param("id", id)
                .param("name", name)
                .param("path", path);

            if let Some(lang) = &node.language {
                cypher = cypher.param("language", lang.clone());
            }
            if let Some(lines) = node.lines {
                cypher = cypher.param("lines", lines as i64);
            }
            if let Some(start_line) = node.start_line {
                cypher = cypher.param("startLine", start_line as i64);
            }
            if let Some(end_line) = node.end_line {
                cypher = cypher.param("endLine", end_line as i64);
            }
            if let Some(line) = node.line {
                cypher = cypher.param("line", line as i64);
            }
            if let Some(source) = &node.source {
                cypher = cypher.param("source", source.clone());
            }

            graph
                .run(cypher)
                .await
                .map_err(|e| format!("Failed to create node {}: {}", node.id, e))?;
        }

        // Create relationships
        for edge in &self.edges {
            let cypher_query = format!(
                "MATCH (a {{id: $from}}), (b {{id: $to}}) CREATE (a)-[:{}]->(b)",
                edge.edge_type
            );
            
            let cypher = query(&cypher_query)
                .param("from", edge.from.clone())
                .param("to", edge.to.clone());

            graph
                .run(cypher)
                .await
                .map_err(|e| format!("Failed to create relationship {} -> {}: {}", edge.from, edge.to, e))?;
        }

        Ok(format!(
            "Successfully stored {} nodes and {} edges in Neo4j",
            self.nodes.len(),
            self.edges.len()
        ))
    }

    pub fn generate_context(&self) -> GraphContext {
        let mut nodes_by_type: HashMap<String, usize> = HashMap::new();
        let mut edges_by_type: HashMap<String, usize> = HashMap::new();

        for node in &self.nodes {
            *nodes_by_type.entry(node.node_type.clone()).or_insert(0) += 1;
        }

        for edge in &self.edges {
            *edges_by_type.entry(edge.edge_type.clone()).or_insert(0) += 1;
        }

        let total_nodes = self.nodes.len();
        let total_edges = self.edges.len();
        let avg_connections = if total_nodes > 0 {
            (total_edges as f64 * 2.0) / total_nodes as f64
        } else {
            0.0
        };

        let summary = self.generate_summary(&nodes_by_type, &edges_by_type);
        let cypher_schema = self.generate_cypher_schema(&nodes_by_type, &edges_by_type);
        let sample_queries = self.generate_sample_queries();

        GraphContext {
            summary,
            cypher_schema,
            sample_queries,
            nodes_by_type,
            edges_by_type,
            graph_statistics: GraphStatistics {
                total_nodes,
                total_edges,
                max_depth: 10,
                connected_components: 1,
                avg_connections_per_node: avg_connections,
            },
        }
    }

    fn generate_summary(&self, nodes_by_type: &HashMap<String, usize>, edges_by_type: &HashMap<String, usize>) -> String {
        let mut summary = String::from("# Code Graph Summary\n\n");
        
        summary.push_str("## Nodes\n");
        for (node_type, count) in nodes_by_type {
            summary.push_str(&format!("- {}: {} nodes\n", node_type, count));
        }
        
        summary.push_str("\n## Relationships\n");
        for (edge_type, count) in edges_by_type {
            summary.push_str(&format!("- {}: {} edges\n", edge_type, count));
        }
        
        summary.push_str(&format!("\n## Total Statistics\n"));
        summary.push_str(&format!("- Total Nodes: {}\n", self.nodes.len()));
        summary.push_str(&format!("- Total Edges: {}\n", self.edges.len()));
        
        summary
    }

    fn generate_cypher_schema(&self, nodes_by_type: &HashMap<String, usize>, edges_by_type: &HashMap<String, usize>) -> String {
        let mut schema = String::from("# Neo4j Graph Schema\n\n");
        
        schema.push_str("## Node Labels\n");
        for (node_type, _) in nodes_by_type {
            schema.push_str(&format!("- :{} (id: String, name: String, path: String, language: String, lines: Integer)\n", node_type.to_uppercase()));
        }
        
        schema.push_str("\n## Relationship Types\n");
        for (edge_type, _) in edges_by_type {
            schema.push_str(&format!("- :{}\n", edge_type));
        }
        
        schema
    }

    fn generate_sample_queries(&self) -> Vec<String> {
        vec![
            "// Find all files\nMATCH (f:FILE) RETURN f.path, f.language LIMIT 10".to_string(),
            "// Find all functions in a specific file\nMATCH (file:FILE)-[:CONTAINS]->(func:FUNCTION)\nWHERE file.path CONTAINS 'example'\nRETURN func.name, func.lines".to_string(),
            "// Find function call chains\nMATCH path = (f1:FUNCTION)-[:CALLS*1..3]->(f2:FUNCTION)\nRETURN path LIMIT 10".to_string(),
            "// Find all imports for a file\nMATCH (file:FILE)-[:IMPORTS_FROM]->(imported:FILE)\nRETURN file.path, imported.path LIMIT 20".to_string(),
            "// Find classes that extend other classes\nMATCH (child:CLASS)-[:EXTENDS]->(parent:CLASS)\nRETURN child.name, parent.name".to_string(),
            "// Find most connected nodes\nMATCH (n)-[r]-()\nRETURN n.name, n.id, labels(n)[0] as label, count(r) AS connections\nORDER BY connections DESC\nLIMIT 10".to_string(),
            "// Find circular dependencies\nMATCH path = (a:FILE)-[:IMPORTS_FROM*2..5]->(a)\nRETURN path LIMIT 5".to_string(),
            "// Find files with no dependencies\nMATCH (f:FILE)\nWHERE NOT (f)-[:IMPORTS_FROM]-()\nRETURN f.path, f.language".to_string(),
        ]
    }

    pub fn to_graph_query_context(&self) -> String {
        let context = self.generate_context();
        
        format!(
            r#"# Neo4j Knowledge Graph Context

## Graph Overview
{}

## Available Node Types
{}

## Available Relationship Types
{}

## Sample Cypher Queries
You can query this graph database using these patterns:

{}

## Statistics
- Total Nodes: {}
- Total Edges: {}
- Average Connections per Node: {:.2}

## Query Guidelines
1. Use MATCH clauses to find patterns
2. Use WHERE to filter results
3. Use RETURN to specify what to return
4. Use LIMIT to control result count
5. Available node types: {}
6. Available relationship types: {}

## Important Notes
- The graph is stored in Neo4j and can be queried in real-time
- When the user asks questions about code structure, dependencies, or relationships, generate Cypher queries
- Always include LIMIT in queries to avoid overwhelming results
- Use CONTAINS for partial string matching in paths
- Wrap your Cypher queries in ```cypher blocks

When generating queries:
1. Start with MATCH to find patterns
2. Add WHERE clauses for filtering
3. Use RETURN to get specific properties
4. Add ORDER BY and LIMIT for manageable results
5. The user can execute queries directly by clicking the "Execute" button
"#,
            context.summary,
            context.nodes_by_type
                .iter()
                .map(|(k, v)| format!("- :{} ({} nodes)", k.to_uppercase(), v))
                .collect::<Vec<_>>()
                .join("\n"),
            context.edges_by_type
                .iter()
                .map(|(k, v)| format!("- :{} ({} relationships)", k, v))
                .collect::<Vec<_>>()
                .join("\n"),
            context.sample_queries
                .iter()
                .map(|q| format!("```cypher\n{}\n```", q))
                .collect::<Vec<_>>()
                .join("\n\n"),
            context.graph_statistics.total_nodes,
            context.graph_statistics.total_edges,
            context.graph_statistics.avg_connections_per_node,
            context.nodes_by_type.keys().map(|k| k.to_uppercase()).collect::<Vec<_>>().join(", "),
            context.edges_by_type.keys().map(|k| k.as_str()).collect::<Vec<_>>().join(", ")
        )
    }
}

// ============================================================================
// PARSER STRUCTURES
// ============================================================================

#[derive(Debug, Serialize, Deserialize)]
pub struct ParsedFile {
    pub path: String,
    pub language: String,
    pub success: bool,
    pub error: Option<String>,
    pub ast: Option<ASTNode>,
    pub metadata: ParseMetadata,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ASTNode {
    pub node_type: String,
    pub text: Option<String>,
    pub start_line: usize,
    pub start_col: usize,
    pub end_line: usize,
    pub end_col: usize,
    pub start_byte: usize,
    pub end_byte: usize,
    pub is_named: bool,
    pub children: Vec<ASTNode>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ParseMetadata {
    pub lines: usize,
    pub bytes: usize,
    pub node_count: usize,
    pub tree_depth: usize,
    pub has_syntax_errors: bool,
}

impl ParseMetadata {
    fn empty() -> Self {
        ParseMetadata {
            lines: 0,
            bytes: 0,
            node_count: 0,
            tree_depth: 0,
            has_syntax_errors: false,
        }
    }
}

// ============================================================================
// PARSER STATE
// ============================================================================

pub struct ParserState {
    parsers: Mutex<HashMap<String, Parser>>,
    extension_map: HashMap<String, String>,
}

impl ParserState {
    pub fn new() -> Self {
        
        let mut state = ParserState {
            parsers: Mutex::new(HashMap::new()),
            extension_map: HashMap::new(),
        };
        
        state.setup_extensions();
        state.initialize_parsers();
        
        state
    }

    fn setup_extensions(&mut self) {
        let mappings = vec![
            ("js", "javascript"),
            ("jsx", "javascript"),
            ("mjs", "javascript"),
            ("cjs", "javascript"),
            ("ts", "typescript"),
            ("tsx", "tsx"),
            ("py", "python"),
            ("pyw", "python"),
            ("rs", "rust"),
            ("java", "java"),
            ("go", "go"),
            ("c", "c"),
            ("h", "c"),
            ("cpp", "cpp"),
            ("cc", "cpp"),
            ("cxx", "cpp"),
            ("hpp", "cpp"),
            ("hxx", "cpp"),
        ];

        for (ext, lang) in mappings {
            self.extension_map.insert(ext.to_string(), lang.to_string());
        }
    }

    fn initialize_parsers(&mut self) {
        let mut parsers = self.parsers.lock().unwrap();
        
        Self::add_parser(&mut parsers, "javascript", tree_sitter_javascript::language());
        Self::add_parser(&mut parsers, "typescript", tree_sitter_typescript::language_typescript());
        Self::add_parser(&mut parsers, "tsx", tree_sitter_typescript::language_tsx());
        Self::add_parser(&mut parsers, "python", tree_sitter_python::language());
        Self::add_parser(&mut parsers, "rust", tree_sitter_rust::language());
        Self::add_parser(&mut parsers, "java", tree_sitter_java::language());
        Self::add_parser(&mut parsers, "go", tree_sitter_go::language());
        Self::add_parser(&mut parsers, "c", tree_sitter_c::language());
        Self::add_parser(&mut parsers, "cpp", tree_sitter_cpp::language());
        
        eprintln!("  Loaded {} parsers", parsers.len());
    }

    fn add_parser(parsers: &mut HashMap<String, Parser>, name: &str, language: Language) {
        let mut parser = Parser::new();
        
        match parser.set_language(language) {
            Ok(_) => {
                parsers.insert(name.to_string(), parser);
                eprintln!("  ✓ {}", name);
            }
            Err(e) => {
                eprintln!("  ✗ {} - Failed to set language: {:?}", name, e);
            }
        }
    }

    fn detect_language(&self, path: &str) -> Option<String> {
        Path::new(path)
            .extension()
            .and_then(|e| e.to_str())
            .and_then(|ext| self.extension_map.get(ext))
            .cloned()
    }

    pub fn parse_file(&self, path: &str, content: &str) -> ParsedFile {
        let language = match self.detect_language(path) {
            Some(lang) => lang,
            None => {
                return ParsedFile {
                    path: path.to_string(),
                    language: "unknown".to_string(),
                    success: false,
                    error: Some("Unsupported file extension".to_string()),
                    ast: None,
                    metadata: ParseMetadata::empty(),
                };
            }
        };

        let mut parsers = self.parsers.lock().unwrap();
        let parser = match parsers.get_mut(&language) {
            Some(p) => p,
            None => {
                return ParsedFile {
                    path: path.to_string(),
                    language: language.clone(),
                    success: false,
                    error: Some(format!("Parser not available for {}", language)),
                    ast: None,
                    metadata: ParseMetadata::empty(),
                };
            }
        };

        match parser.parse(content, None) {
            Some(tree) => {
                let root = tree.root_node();
                let ast = Self::node_to_ast(&root, content, 0, 10);
                
                ParsedFile {
                    path: path.to_string(),
                    language,
                    success: true,
                    error: None,
                    ast: Some(ast),
                    metadata: ParseMetadata {
                        lines: content.lines().count(),
                        bytes: content.len(),
                        node_count: Self::count_nodes(&root),
                        tree_depth: Self::calculate_depth(&root, 0),
                        has_syntax_errors: root.has_error(),
                    },
                }
            }
            None => {
                ParsedFile {
                    path: path.to_string(),
                    language,
                    success: false,
                    error: Some("Parse failed".to_string()),
                    ast: None,
                    metadata: ParseMetadata::empty(),
                }
            }
        }
    }

    fn node_to_ast(node: &Node, source: &str, depth: usize, max_depth: usize) -> ASTNode {
        let start = node.start_position();
        let end = node.end_position();
        
        let text = if node.child_count() == 0 && (node.end_byte() - node.start_byte()) < 100 {
            node.utf8_text(source.as_bytes()).ok().map(|s| s.to_string())
        } else {
            None
        };

        let mut children = Vec::new();
        if depth < max_depth {
            for i in 0..node.child_count() {
                if let Some(child) = node.child(i) {
                    children.push(Self::node_to_ast(&child, source, depth + 1, max_depth));
                }
            }
        }

        ASTNode {
            node_type: node.kind().to_string(),
            text,
            start_line: start.row,
            start_col: start.column,
            end_line: end.row,
            end_col: end.column,
            start_byte: node.start_byte(),
            end_byte: node.end_byte(),
            is_named: node.is_named(),
            children,
        }
    }

    fn count_nodes(node: &Node) -> usize {
        let mut count = 1;
        for i in 0..node.child_count() {
            if let Some(child) = node.child(i) {
                count += Self::count_nodes(&child);
            }
        }
        count
    }

    fn calculate_depth(node: &Node, current: usize) -> usize {
        let mut max = current;
        for i in 0..node.child_count() {
            if let Some(child) = node.child(i) {
                max = max.max(Self::calculate_depth(&child, current + 1));
            }
        }
        max
    }
}

// ============================================================================
// NEO4J TAURI COMMANDS
// ============================================================================

#[tauri::command]
async fn connect_neo4j(
    uri: String,
    user: String,
    password: String,
    state: State<'_, Neo4jState>,
) -> Result<String, String> {
    state.connect(&uri, &user, &password).await?;
    Ok("Successfully connected to Neo4j".to_string())
}

#[tauri::command]
async fn disconnect_neo4j(state: State<'_, Neo4jState>) -> Result<String, String> {
    let mut g = state.graph.lock().unwrap();
    *g = None;
    Ok("Disconnected from Neo4j".to_string())
}

#[tauri::command]
async fn check_neo4j_connection(state: State<'_, Neo4jState>) -> Result<bool, String> {
    Ok(state.is_connected())
}

#[tauri::command]
async fn store_graph_in_neo4j(
    graph: CodeGraph,
    state: State<'_, Neo4jState>,
) -> Result<String, String> {
    let neo4j = state.get_graph()?;
    graph.store_in_neo4j(&neo4j).await
}

#[tauri::command]
async fn execute_cypher_query(
    cypher: String,
    state: State<'_, Neo4jState>,
) -> Result<CypherQueryResult, String> {
    let graph = state.get_graph()?;
    
    let mut result = graph
        .execute(query(&cypher))
        .await
        .map_err(|e| format!("Query execution failed: {}", e))?;

    let mut data: Vec<serde_json::Value> = Vec::new();
    let mut row_count = 0;

    while let Ok(Some(row)) = result.next().await {
        row_count += 1;
        let mut row_data = serde_json::Map::new();

        if let Ok(row_map) = row.to::<HashMap<String, serde_json::Value>>() {
            for (key, value) in row_map {
                row_data.insert(key, value);
            }
        }

        data.push(serde_json::Value::Object(row_data));

        if row_count >= 100 {
            break;
        }
    }

    let summary = format!("Query returned {} rows", data.len());

    Ok(CypherQueryResult {
        success: true,
        data,
        error: None,
        summary,
    })
}

#[tauri::command]
async fn get_graph_stats(state: State<'_, Neo4jState>) -> Result<serde_json::Value, String> {
    let graph = state.get_graph()?;

    let node_count_query = "MATCH (n) RETURN count(n) as count";
    let mut result = graph
        .execute(query(node_count_query))
        .await
        .map_err(|e| format!("Failed to get node count: {}", e))?;

    let node_count = if let Ok(Some(row)) = result.next().await {
        row.get::<i64>("count").unwrap_or(0)
    } else {
        0
    };

    let rel_count_query = "MATCH ()-[r]->() RETURN count(r) as count";
    let mut result = graph
        .execute(query(rel_count_query))
        .await
        .map_err(|e| format!("Failed to get relationship count: {}", e))?;

    let rel_count = if let Ok(Some(row)) = result.next().await {
        row.get::<i64>("count").unwrap_or(0)
    } else {
        0
    };

    Ok(serde_json::json!({
        "nodes": node_count,
        "relationships": rel_count,
        "connected": true
    }))
}

#[tauri::command]
fn generate_graph_context(graph: CodeGraph) -> Result<GraphContext, String> {
    Ok(graph.generate_context())
}

#[tauri::command]
fn graph_to_query_context(graph: CodeGraph) -> Result<String, String> {
    Ok(graph.to_graph_query_context())
}

// ============================================================================
// EXISTING TAURI COMMANDS
// ============================================================================

#[tauri::command]
async fn parse_files(
    files: Vec<(String, String)>,
    state: State<'_, ParserState>,
) -> Result<Vec<ParsedFile>, String> {
    let results: Vec<ParsedFile> = files
        .iter()
        .map(|(path, content)| state.parse_file(path, content))
        .collect();
    
    Ok(results)
}

#[tauri::command]
async fn parse_single_file(
    path: String,
    content: String,
    state: State<'_, ParserState>,
) -> Result<ParsedFile, String> {
    Ok(state.parse_file(&path, &content))
}

#[tauri::command]
async fn read_and_parse_files(
    paths: Vec<String>,
    state: State<'_, ParserState>,
) -> Result<Vec<ParsedFile>, String> {
    let mut results = Vec::new();
    
    for path in paths {
        match std_fs::read_to_string(&path) {
            Ok(content) => {
                let parsed = state.parse_file(&path, &content);
                results.push(parsed);
            }
            Err(e) => {
                results.push(ParsedFile {
                    path: path.clone(),
                    language: "unknown".to_string(),
                    success: false,
                    error: Some(format!("Failed to read file: {}", e)),
                    ast: None,
                    metadata: ParseMetadata::empty(),
                });
            }
        }
    }
    
    Ok(results)
}

#[tauri::command]
fn get_supported_languages(
    state: State<'_, ParserState>
) -> Result<HashMap<String, Vec<String>>, String> {
    let mut result = HashMap::new();
    
    for (ext, lang) in &state.extension_map {
        result.entry(lang.clone())
            .or_insert_with(Vec::new)
            .push(ext.clone());
    }
    
    Ok(result)
}

#[tauri::command]
async fn read_file_content(paths: Vec<String>) -> Vec<(String, String)> {
    let mut handles = Vec::new();

    for path in paths {
        let path_clone = path.clone();
        handles.push(task::spawn(async move {
            match fs::read_to_string(&path_clone).await {
                Ok(content) => Some((path_clone, content)),
                Err(_) => None,
            }
        }));
    }

    let mut results: Vec<(String, String)> = Vec::new();

    for handle in handles {
        if let Ok(Some(data)) = handle.await {
            results.push(data);
        }
    }

    results
}

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[derive(Serialize, Debug)]
pub struct DirEntryInfo {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub children: Option<Vec<DirEntryInfo>>,
}

#[tauri::command]
fn read_file_while_content(path: &str) -> Result<String, String> {
    std_fs::read_to_string(path).map_err(|e| e.to_string())
}

fn read_dir_recursive(dir: &Path) -> Result<Vec<DirEntryInfo>, String> {
    let mut entries = Vec::new();
    let ignored_dirs = ["node_modules", "target", ".git", "dist", "build", ".idea", ".vscode", "out"];

    for entry in std_fs::read_dir(dir)
        .map_err(|e| format!("Failed to read dir {}: {}", dir.display(), e))?
    {
        let entry = entry.map_err(|e| format!("Failed to read entry: {}", e))?;
        let path = entry.path();
        let file_name = entry.file_name().to_string_lossy().to_string();

        if ignored_dirs.contains(&file_name.as_str()) || file_name.starts_with('.') {
            continue;
        }

        let metadata = entry.metadata().map_err(|e| {
            format!("Failed to read metadata for {}: {}", path.display(), e)
        })?;

        let children = if metadata.is_dir() {
            match read_dir_recursive(&path) {
                Ok(child_entries) => Some(child_entries),
                Err(_) => Some(Vec::new()),
            }
        } else {
            None
        };

        entries.push(DirEntryInfo {
            name: file_name,
            path: path.to_string_lossy().to_string(),
            is_dir: metadata.is_dir(),
            children,
        });
    }

    Ok(entries)
}

#[tauri::command]
fn write_file_content(path: &str, content: &str) -> Result<(), String> {
    std_fs::write(path, content).map_err(|e| e.to_string())
}

#[tauri::command]
fn read_directory(path: &str) -> Result<Vec<DirEntryInfo>, String> {
    let dir = Path::new(path);

    if !dir.exists() {
        return Err(format!("Directory does not exist: {}", path));
    }

    if !dir.is_dir() {
        return Err(format!("Path is not a directory: {}", path));
    }

    read_dir_recursive(dir)
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
}

#[derive(Debug, Serialize)]
struct OllamaChatRequest {
    model: String,
    messages: Vec<ChatMessage>,
    stream: bool,
}

#[derive(Debug, Deserialize)]
struct OllamaChatResponse {
    message: ChatMessage,
    done: bool,
}

#[derive(Debug, Deserialize)]
struct OllamaModelsResponse {
    models: Vec<OllamaModel>,
}

#[derive(Debug, Deserialize, Serialize)]
struct OllamaModel {
    name: String,
    modified_at: String,
    size: u64,
}

#[derive(Debug, Serialize, Clone)]
struct ChatStreamEvent {
    content: String,
    done: bool,
}

#[tauri::command]
async fn check_ollama_connection() -> Result<bool, String> {
    let client = reqwest::Client::new();
    match client.get("http://localhost:11434/api/tags").send().await {
        Ok(response) => Ok(response.status().is_success()),
        Err(_) => Ok(false),
    }
}

#[tauri::command]
async fn get_ollama_models() -> Result<Vec<String>, String> {
    let client = reqwest::Client::new();
    let response = client
        .get("http://localhost:11434/api/tags")
        .send()
        .await
        .map_err(|e| format!("Failed to connect to Ollama: {}", e))?;

    let models: OllamaModelsResponse = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse models: {}", e))?;

    Ok(models.models.into_iter().map(|m| m.name).collect())
}

#[tauri::command]
async fn chat_with_ollama(
    window: Window,
    model: String,
    messages: Vec<ChatMessage>,
) -> Result<String, String> {
    let client = reqwest::Client::new();

    let request = OllamaChatRequest {
        model,
        messages,
        stream: true,
    };

    let response = client
        .post("http://localhost:11434/api/chat")
        .json(&request)
        .send()
        .await
        .map_err(|e| format!("Failed to connect to Ollama: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("Ollama error: {}", response.status()));
    }

    let mut stream = response.bytes_stream();
    let mut full_response = String::new();

    while let Some(chunk) = stream.next().await {
        match chunk {
            Ok(bytes) => {
                let text = String::from_utf8_lossy(&bytes);
                for line in text.lines() {
                    if line.trim().is_empty() {
                        continue;
                    }
                    match serde_json::from_str::<OllamaChatResponse>(line) {
                        Ok(response) => {
                            full_response.push_str(&response.message.content);
                            let event = ChatStreamEvent {
                                content: response.message.content,
                                done: response.done,
                            };
                            let _ = window.emit("chat-stream", event);
                        }
                        Err(e) => {
                            eprintln!("Failed to parse Ollama response: {} - Line: {}", e, line);
                        }
                    }
                }
            }
            Err(e) => {
                return Err(format!("Stream error: {}", e));
            }
        }
    }

    Ok(full_response)
}

#[tauri::command]
async fn chat_with_ollama_sync(
    model: String,
    messages: Vec<ChatMessage>,
) -> Result<String, String> {
    let client = reqwest::Client::new();

    let request = OllamaChatRequest {
        model,
        messages,
        stream: false,
    };

    let response = client
        .post("http://localhost:11434/api/chat")
        .json(&request)
        .send()
        .await
        .map_err(|e| format!("Failed to connect to Ollama: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("Ollama error: {}", response.status()));
    }

    let chat_response: OllamaChatResponse = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse response: {}", e))?;

    Ok(chat_response.message.content)
}

#[tauri::command]
fn create_file(path: &str, content: &str) -> Result<(), String> {
    if let Some(parent) = Path::new(path).parent() {
        std_fs::create_dir_all(parent).map_err(|e| format!("Failed to create directories: {}", e))?;
    }
    std_fs::write(path, content).map_err(|e| format!("Failed to create file: {}", e))
}

#[tauri::command]
fn delete_file(path: &str) -> Result<(), String> {
    let path = Path::new(path);
    if path.is_dir() {
        std_fs::remove_dir_all(path).map_err(|e| format!("Failed to delete directory: {}", e))
    } else {
        std_fs::remove_file(path).map_err(|e| format!("Failed to delete file: {}", e))
    }
}

#[tauri::command]
fn rename_file(old_path: &str, new_path: &str) -> Result<(), String> {
    std_fs::rename(old_path, new_path).map_err(|e| format!("Failed to rename file: {}", e))
}

#[derive(Serialize)]
struct FileMetadata {
    size: u64,
    is_dir: bool,
    is_file: bool,
    modified: Option<u64>,
}

#[tauri::command]
fn get_file_metadata(path: &str) -> Result<FileMetadata, String> {
    let metadata = std_fs::metadata(path).map_err(|e| format!("Failed to get metadata: {}", e))?;

    let modified = metadata
        .modified()
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_secs());

    Ok(FileMetadata {
        size: metadata.len(),
        is_dir: metadata.is_dir(),
        is_file: metadata.is_file(),
        modified,
    })
}

type PtyWriter = Arc<Mutex<Box<dyn Write + Send>>>;
type PtyReader = Arc<Mutex<Box<dyn Read + Send>>>;

struct TerminalInstance {
    writer: PtyWriter,
    _reader: PtyReader,
}

struct TerminalState {
    terminals: Mutex<HashMap<String, TerminalInstance>>,
}

impl Default for TerminalState {
    fn default() -> Self {
        Self {
            terminals: Mutex::new(HashMap::new()),
        }
    }
}

#[derive(Debug, Serialize, Clone)]
struct TerminalOutput {
    terminal_id: String,
    data: String,
}

#[tauri::command]
async fn create_terminal(
    window: Window,
    terminal_id: String,
    cwd: Option<String>,
    state: State<'_, TerminalState>,
) -> Result<(), String> {
    let pty_system = native_pty_system();

    let pair = pty_system
        .openpty(PtySize {
            rows: 24,
            cols: 80,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| format!("Failed to open PTY: {}", e))?;

    #[cfg(target_os = "windows")]
    let shell = std::env::var("COMSPEC").unwrap_or_else(|_| "cmd.exe".to_string());
    
    #[cfg(not(target_os = "windows"))]
    let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/bash".to_string());

    let mut cmd = CommandBuilder::new(&shell);
    
    if let Some(dir) = cwd {
        cmd.cwd(dir);
    }

    let _child = pair
        .slave
        .spawn_command(cmd)
        .map_err(|e| format!("Failed to spawn shell: {}", e))?;

    let reader = pair.master.try_clone_reader()
        .map_err(|e| format!("Failed to clone reader: {}", e))?;
    let writer = pair.master.take_writer()
        .map_err(|e| format!("Failed to take writer: {}", e))?;

    let reader = Arc::new(Mutex::new(reader));
    let writer = Arc::new(Mutex::new(writer));

    {
        let mut terminals = state.terminals.lock().unwrap();
        terminals.insert(
            terminal_id.clone(),
            TerminalInstance {
                writer: writer.clone(),
                _reader: reader.clone(),
            },
        );
    }

    let terminal_id_clone = terminal_id.clone();
    let window_clone = window.clone();
    
    std::thread::spawn(move || {
        let mut buf = [0u8; 4096];
        loop {
            let n = {
                let mut reader_guard = reader.lock().unwrap();
                match reader_guard.read(&mut buf) {
                    Ok(0) => break,
                    Ok(n) => n,
                    Err(e) => {
                        eprintln!("Error reading from PTY: {}", e);
                        break;
                    }
                }
            };

            let data = String::from_utf8_lossy(&buf[..n]).to_string();
            let _ = window_clone.emit(
                "terminal-output",
                TerminalOutput {
                    terminal_id: terminal_id_clone.clone(),
                    data,
                },
            );
        }
    });

    Ok(())
}

#[tauri::command]
fn write_terminal(
    terminal_id: String,
    data: String,
    state: State<'_, TerminalState>,
) -> Result<(), String> {
    let terminals = state.terminals.lock().unwrap();
    
    if let Some(terminal) = terminals.get(&terminal_id) {
        let mut writer = terminal.writer.lock().unwrap();
        writer
            .write_all(data.as_bytes())
            .map_err(|e| format!("Failed to write to terminal: {}", e))?;
        writer.flush().map_err(|e| format!("Failed to flush: {}", e))?;
        Ok(())
    } else {
        Err(format!("Terminal not found: {}", terminal_id))
    }
}

#[tauri::command]
fn resize_terminal(
    terminal_id: String,
    rows: u16,
    cols: u16,
    _state: State<'_, TerminalState>,
) -> Result<(), String> {
    eprintln!("Resize terminal {} to {}x{}", terminal_id, cols, rows);
    Ok(())
}

#[tauri::command]
fn close_terminal(
    terminal_id: String,
    state: State<'_, TerminalState>,
) -> Result<(), String> {
    let mut terminals = state.terminals.lock().unwrap();
    terminals.remove(&terminal_id);
    Ok(())
}

// ============================================================================
// MAIN RUN FUNCTION
// ============================================================================

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_sql::Builder::default().build())
        .manage(TerminalState::default())
        .manage(ParserState::new())
        .manage(Neo4jState::new())
        .invoke_handler(tauri::generate_handler![
            greet,
            read_directory,
            read_file_while_content,
            read_file_content,
            write_file_content,
            check_ollama_connection,
            get_ollama_models,
            chat_with_ollama,
            chat_with_ollama_sync,
            create_file,
            delete_file,
            rename_file,
            get_file_metadata,
            create_terminal,
            write_terminal,
            resize_terminal,
            close_terminal,
            parse_files,
            parse_single_file,
            read_and_parse_files,
            get_supported_languages,
            connect_neo4j,
            disconnect_neo4j,
            check_neo4j_connection,
            store_graph_in_neo4j,
            execute_cypher_query,
            get_graph_stats,
            generate_graph_context,
            graph_to_query_context,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}