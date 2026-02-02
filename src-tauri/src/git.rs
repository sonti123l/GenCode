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

#[derive(Debug, Serialize, Deserialize)]
pub struct CommitInfo {
    pub id: String,
    pub message: String,
    pub author: String,
    pub date: String,
    pub parent_ids: Vec<String>,
}

#[tauri::command]
pub fn get_diff_content(repo_path: String, file_path: String) -> Result<String, String> {
    let repo = Repository::open(&repo_path).map_err(|e| e.message().to_string())?;
    
    // Get content from HEAD (original)
    let head = repo.head().ok();
    
    if let Some(h) = head {
        let target = h.target().unwrap();
        let commit = repo.find_commit(target).map_err(|e| e.message().to_string())?;
        let tree = commit.tree().map_err(|e| e.message().to_string())?;
        
        // Find the file in the tree
        // Note: git2 file paths in trees are relative to root.
        // We assume file_path passed in is either relative or we need to look it up.
        // Usually, the frontend should pass relative path.
        
        let path = Path::new(&file_path);
        // If the path in the tree is just the filename or relative path
        let input_path_str = path.to_str().unwrap_or("").replace("\\", "/"); 
        
        // Try to find entry
        // Tree::get_path handles relative paths like "src/main.rs"
        let entry = tree.get_path(Path::new(&input_path_str));

        match entry {
            Ok(e) => {
                let object = e.to_object(&repo).map_err(|e| e.message().to_string())?;
                if let Some(blob) = object.as_blob() {
                    let content = std::str::from_utf8(blob.content()).unwrap_or("").to_string();
                    return Ok(content);
                }
            }
            Err(_) => {
                // File might be new (not in HEAD), so original content is empty
                return Ok("".to_string());
            }
        }
    }
    
    Ok("".to_string()) // No HEAD or file not found implies empty original
}

#[tauri::command]
pub fn get_commit_history(repo_path: String, limit: Option<usize>) -> Result<Vec<CommitInfo>, String> {
    let repo = Repository::open(&repo_path).map_err(|e| e.message().to_string())?;
    let mut revwalk = repo.revwalk().map_err(|e| e.message().to_string())?;
    
    revwalk.push_head().map_err(|e| e.message().to_string())?;
    revwalk.set_sorting(git2::Sort::TIME).map_err(|e| e.message().to_string())?;
    
    let mut history = Vec::new();
    let limit = limit.unwrap_or(50);
    
    for oid in revwalk.take(limit) {
        let oid = oid.map_err(|e| e.message().to_string())?;
        let commit = repo.find_commit(oid).map_err(|e| e.message().to_string())?;
        
        let author = commit.author();
        let author_name = author.name().unwrap_or("Unknown").to_string();
        
        let time = commit.time();
        // Convert time to ISO string or readable format if possible, 
        // for now simple unix timestamp string or we format it if we pull in chrono.
        // Let's just return a simple formatted string or raw timestamp.
        let date = format!("{}", time.seconds());

        let parents: Vec<String> = commit.parent_ids().map(|p| p.to_string()).collect();

        history.push(CommitInfo {
            id: commit.id().to_string(),
            message: commit.message().unwrap_or("").to_string(),
            author: author_name,
            date,
            parent_ids: parents,
        });
    }
    
    Ok(history)
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
