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
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .manage(TerminalState::default())
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
            close_terminal
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}