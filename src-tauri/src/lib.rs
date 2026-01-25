use futures::StreamExt;
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
use tree_sitter::{Language, Parser, Node};

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
        eprintln!("🚀 Initializing ParserState...");
        
        let mut state = ParserState {
            parsers: Mutex::new(HashMap::new()),
            extension_map: HashMap::new(),
        };
        
        state.setup_extensions();
        state.initialize_parsers();
        
        eprintln!("✅ ParserState initialized!");
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
        
        // Use the language() functions - works on all platforms!
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
        // Parser::new() returns Parser directly, not Result
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
// TAURI COMMANDS
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

// ============================================================================
// Keep all your other existing code below (read_file_content, greet, etc.)
// ============================================================================

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
    eprintln!("Reading directory: {}", dir.display());

    let mut entries = Vec::new();

    for entry in std_fs::read_dir(dir)
        .map_err(|e| format!("Failed to read dir {}: {}", dir.display(), e))?
    {
        let entry = entry.map_err(|e| format!("Failed to read entry: {}", e))?;
        let path = entry.path();
        let metadata = entry.metadata().map_err(|e| {
            format!(
                "Failed to read metadata for {}: {}",
                path.display(),
                e
            )
        })?;

        eprintln!(
            "  Found: {} (is_dir: {})",
            path.display(),
            metadata.is_dir()
        );

        let children = if metadata.is_dir() {
            eprintln!("    Recursing into: {}", path.display());
            match read_dir_recursive(&path) {
                Ok(child_entries) => {
                    eprintln!(
                        "    Found {} children in {}",
                        child_entries.len(),
                        path.display()
                    );
                    Some(child_entries)
                }
                Err(e) => {
                    eprintln!(
                        "    Warning: Failed to read subdirectory {}: {}",
                        path.display(),
                        e
                    );
                    Some(Vec::new())
                }
            }
        } else {
            None
        };

        entries.push(DirEntryInfo {
            name: entry.file_name().to_string_lossy().to_string(),
            path: path.to_string_lossy().to_string(),
            is_dir: metadata.is_dir(),
            children,
        });
    }

    eprintln!(
        "Directory {} returned {} entries",
        dir.display(),
        entries.len()
    );
    Ok(entries)
}

#[tauri::command]
fn write_file_content(path: &str, content: &str) -> Result<(), String> {
    std_fs::write(path, content).map_err(|e| e.to_string())
}

#[tauri::command]
fn read_directory(path: &str) -> Result<Vec<DirEntryInfo>, String> {
    eprintln!("read_directory called with path: {}", path);

    let dir = Path::new(path);

    if !dir.exists() {
        return Err(format!("Directory does not exist: {}", path));
    }

    if !dir.is_dir() {
        return Err(format!("Path is not a directory: {}", path));
    }

    let result = read_dir_recursive(dir)?;
    eprintln!("Total entries at root level: {}", result.len());

    Ok(result)
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
                    Ok(0) => break, // EOF
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
// Your FIXED run() function - copy this entire block

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .manage(TerminalState::default())     // ✓ Terminal state
        .manage(ParserState::new())           // ← ADD THIS LINE!
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
            // ← ADD THESE NEW COMMANDS:
            parse_files,
            parse_single_file,
            read_and_parse_files,
            get_supported_languages
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}