use git2::{Repository, Status, StatusOptions};
use serde::{Deserialize, Serialize};
use std::path::Path;

#[derive(Debug, Serialize, Deserialize)]
pub struct GitFileStatus {
    pub path: String,
    pub status: String, // "modified", "new", "deleted", "staged", etc.
}

#[derive(Debug, Serialize, Deserialize)]
pub struct GitRepoStatus {
    pub branch: String,
    pub changes: Vec<GitFileStatus>,
    pub staged: Vec<GitFileStatus>,
}

#[tauri::command]
pub fn check_is_git_repo(path: String) -> bool {
    let path = Path::new(&path);
    Repository::open(path).is_ok()
}

#[tauri::command]
pub fn get_git_status(path: String) -> Result<GitRepoStatus, String> {
    let repo = Repository::open(&path).map_err(|e| e.message().to_string())?;
    
    // Get current branch
    let head = repo.head().ok();
    let branch = head
        .as_ref()
        .and_then(|h| h.shorthand())
        .unwrap_or("DETACHED")
        .to_string();

    let mut status_opts = StatusOptions::new();
    status_opts.include_untracked(true);

    let statuses = repo
        .statuses(Some(&mut status_opts))
        .map_err(|e| e.message().to_string())?;

    let mut changes = Vec::new();
    let mut staged = Vec::new();

    for entry in statuses.iter() {
        let path = entry.path().unwrap_or("").to_string();
        let status = entry.status();

        if status.is_wt_new() || status.is_wt_modified() || status.is_wt_deleted() || status.is_wt_renamed() || status.is_wt_typechange() {
            let status_str = if status.is_wt_new() {
                "U" // Untracked
            } else if status.is_wt_modified() {
                "M" // Modified
            } else if status.is_wt_deleted() {
                "D" // Deleted
            } else {
                "?"
            };
            changes.push(GitFileStatus { path: path.clone(), status: status_str.to_string() });
        }

        if status.is_index_new() || status.is_index_modified() || status.is_index_deleted() || status.is_index_renamed() || status.is_index_typechange() {
             let status_str = if status.is_index_new() {
                "A" // Added
            } else if status.is_index_modified() {
                "M" // Modified
            } else if status.is_index_deleted() {
                "D" // Deleted
            } else {
                "?"
            };
            staged.push(GitFileStatus { path, status: status_str.to_string() });
        }
    }

    Ok(GitRepoStatus { branch, changes, staged })
}

#[tauri::command]
pub fn git_add(repo_path: String, file_path: String) -> Result<(), String> {
    let repo = Repository::open(&repo_path).map_err(|e| e.message().to_string())?;
    let mut index = repo.index().map_err(|e| e.message().to_string())?;
    
    let path = Path::new(&file_path);
    // Determine relative path if full path is given, or use as is
    // Simplified: assuming file_path is relative to repo root or handle correctly
    // git2 expects relative paths for add_path
    
    // Better to handle both absolute and relative:
    // If repo_path is /foo/bar and file_path is /foo/bar/baz.txt, we need baz.txt
    
    let repo_path_buf = Path::new(&repo_path).canonicalize().map_err(|e| e.to_string())?;
    // We can't easily canonicalize file_path if it doesn't exist (deleted file), so be careful
    
    // For now assume the frontend sends relative paths or we compute it. 
    // Let's try to just use add_path assuming it handles what we give it, or assume relative.
    // The frontend should ideally send relative paths.
    
    index.add_path(Path::new(&file_path)).map_err(|e| e.message().to_string())?;
    index.write().map_err(|e| e.message().to_string())?;
    
    Ok(())
}

#[tauri::command]
pub fn git_commit(repo_path: String, message: String) -> Result<(), String> {
    let repo = Repository::open(&repo_path).map_err(|e| e.message().to_string())?;
    let mut index = repo.index().map_err(|e| e.message().to_string())?;
    let tree_id = index.write_tree().map_err(|e| e.message().to_string())?;
    let tree = repo.find_tree(tree_id).map_err(|e| e.message().to_string())?;
    
    let signature = repo.signature().map_err(|e| e.message().to_string())?;
    
    let parent_commit = match repo.head() {
        Ok(head) => {
            let target = head.target().unwrap();
            Some(repo.find_commit(target).map_err(|e| e.message().to_string())?)
        }
        Err(_) => None, // Initial commit
    };
    
    let parents = if let Some(ref p) = parent_commit {
        vec![p]
    } else {
        vec![]
    };
    
    repo.commit(
        Some("HEAD"),
        &signature,
        &signature,
        &message,
        &tree,
        &parents,
    ).map_err(|e| e.message().to_string())?;
    
    Ok(())
}

#[tauri::command]
pub fn git_push(repo_path: String) -> Result<(), String> {
    // Basic push implementation
    // Note: Authentication is complex. This might only work if credentials are in credential helper.
    let repo = Repository::open(&repo_path).map_err(|e| e.message().to_string())?;
    let mut remote = repo.find_remote("origin").map_err(|e| e.message().to_string())?;
    
    // We'd need to handle callbacks for credentials here ideally
    // For now, let's try a simple push and see if it picks up system creds or fails
    // In a real app, we might need to prompt user for auth or use ssh-agent
    
    let mut callbacks = git2::RemoteCallbacks::new();
    callbacks.credentials(|_url, username_from_url, _allowed_types| {
        git2::Cred::ssh_key_from_agent(username_from_url.unwrap_or("git"))
    });
    
    let mut push_opts = git2::PushOptions::new();
    push_opts.remote_callbacks(callbacks);
    
    // Determine current branch to push
    let head = repo.head().map_err(|e| e.message().to_string())?;
    let branch = head.shorthand().ok_or("Not on a branch")?;
    let refspec = format!("refs/heads/{}:refs/heads/{}", branch, branch);

    remote.push(&[&refspec], Some(&mut push_opts)).map_err(|e| e.message().to_string())?;
    
    Ok(())
}

#[tauri::command]
pub fn git_pull(repo_path: String) -> Result<(), String> {
     let repo = Repository::open(&repo_path).map_err(|e| e.message().to_string())?;
    let mut remote = repo.find_remote("origin").map_err(|e| e.message().to_string())?;
    
    let mut callbacks = git2::RemoteCallbacks::new();
     callbacks.credentials(|_url, username_from_url, _allowed_types| {
        git2::Cred::ssh_key_from_agent(username_from_url.unwrap_or("git"))
    });
    
    let mut fetch_opts = git2::FetchOptions::new();
    fetch_opts.remote_callbacks(callbacks);
    
    remote.fetch(&["main"], Some(&mut fetch_opts), None).map_err(|e| e.message().to_string())?;
    
    // Merge logic is complex, for now just fetch
    // Real implementation needs merge analysis and actual merge/rebase
    
    Ok(())
}
