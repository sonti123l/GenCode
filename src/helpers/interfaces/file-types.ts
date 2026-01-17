export type FileNode = {
  name: string
  path: string
  isDir: boolean
  children?: FileNode[]
}

export type DirEntryInfo = {
  name: string
  path: string
  is_dir: boolean
}
