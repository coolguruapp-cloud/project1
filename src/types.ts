export interface User {
  id: string;
  email: string;
  name: string;
  role: 'ADMIN' | 'USER';
}

export interface Task {
  id: string;
  week: number;
  focusArea: string;
  task: string;
  owner: string;
  priority: 'Low' | 'Medium' | 'High';
  status: 'Not Started' | 'In Progress' | 'Completed';
  completion: number;
  startDate: string;
  deadline: string;
  notes: string;
}

export interface ActivityLog {
  id: string;
  userName: string;
  taskUpdated: string;
  oldStatus: string;
  newStatus: string;
  completion: number;
  timestamp: string;
}

export interface AuthState {
  user: User | null;
  token: string | null;
}
