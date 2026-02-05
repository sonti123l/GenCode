// Add to the existing interfaces
export interface PendingEdit {
  id: string;
  path: string;
  original: string;
  modified: string;
  description: string;
  applied: boolean;
}

export interface AgentAction {
  type: 'search' | 'read' | 'edit' | 'write' | 'create' | 'rename' | 'delete';
  status: 'pending' | 'in-progress' | 'completed' | 'failed';
  description: string;
  result?: any;
}