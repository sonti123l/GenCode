// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
use serde::Serialize;
use std::fs;
use std::path::Path;

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

fn read_dir_recursive(dir: &Path) -> Result<Vec<DirEntryInfo>, String> {
    eprintln!("Reading directory: {}", dir.display());
    
    let mut entries = Vec::new();
    
    for entry in fs::read_dir(dir).map_err(|e| format!("Failed to read dir {}: {}", dir.display(), e))? {
        let entry = entry.map_err(|e| format!("Failed to read entry: {}", e))?;
        let path = entry.path();
        let metadata = entry.metadata().map_err(|e| format!("Failed to read metadata for {}: {}", path.display(), e))?;
        
        eprintln!("  Found: {} (is_dir: {})", path.display(), metadata.is_dir());
        
        let children = if metadata.is_dir() {
            eprintln!("    Recursing into: {}", path.display());
            match read_dir_recursive(&path) {
                Ok(child_entries) => {
                    eprintln!("    Found {} children in {}", child_entries.len(), path.display());
                    Some(child_entries)
                }
                Err(e) => {
                    eprintln!("    Warning: Failed to read subdirectory {}: {}", path.display(), e);
                    Some(Vec::new()) // Return empty vec instead of failing
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
    
    eprintln!("Directory {} returned {} entries", dir.display(), entries.len());
    Ok(entries)
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![greet, read_directory])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}