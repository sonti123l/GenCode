// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
use serde::Serialize;
use std::fs;
use std::path::Path;

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}


#[derive(Serialize)]
pub struct DirEntryInfo {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub children: Option<Vec<DirEntryInfo>>,
}


fn read_dir_recursive(dir: &Path) -> Result<Vec<DirEntryInfo>, String> {
    let mut entries = Vec::new();

    for entry in fs::read_dir(dir).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        let metadata = entry.metadata().map_err(|e| e.to_string())?;

        let children = if metadata.is_dir() {
            Some(read_dir_recursive(&path)?)
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

    Ok(entries)
}




#[tauri::command]
fn read_directory(path: &str) -> Result<Vec<DirEntryInfo>, String> {

     let dir = Path::new(path);

    if !dir.exists() {
        return Err("Directory does not exist".into());
    }

    read_dir_recursive(dir)

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
