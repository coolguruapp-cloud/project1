import React, { useState, useEffect, useMemo } from 'react';
import { 
  LayoutDashboard, 
  CheckSquare, 
  FileText, 
  Settings, 
  LogOut, 
  Plus, 
  Download, 
  AlertCircle,
  TrendingUp,
  Users,
  Clock,
  Search,
  ChevronRight,
  ChevronDown,
  Send
} from 'lucide-react';
import { 
  Chart as ChartJS, 
  CategoryScale, 
  LinearScale, 
  BarElement, 
  Title, 
  Tooltip, 
  Legend, 
  ArcElement,
  PointElement,
  LineElement
} from 'chart.js';
import { Bar, Pie, Doughnut } from 'react-chartjs-2';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';
import { motion, AnimatePresence } from 'framer-motion';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { GoogleGenAI } from "@google/genai";
import Papa from 'papaparse';
import { User, Task, ActivityLog } from './types';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
  PointElement,
  LineElement
);

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// --- Components ---

const Card = ({ children, className }: { children: React.ReactNode, className?: string }) => (
  <div className={cn("bg-white rounded-2xl shadow-sm border border-black/5 p-6", className)}>
    {children}
  </div>
);

const ProgressBar = ({ value, color = "bg-emerald-500" }: { value: number, color?: string }) => (
  <div className="w-full bg-black/5 rounded-full h-2 overflow-hidden">
    <div 
      className={cn("h-full transition-all duration-500", color)} 
      style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
    />
  </div>
);

const CircularProgress = ({ value, size = 120 }: { value: number, size?: number }) => {
  const radius = (size - 10) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (value / 100) * circumference;

  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="transform -rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="currentColor"
          strokeWidth="8"
          fill="transparent"
          className="text-black/5"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="currentColor"
          strokeWidth="8"
          fill="transparent"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className="text-emerald-500 transition-all duration-1000"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-bold">{Math.round(value)}%</span>
        <span className="text-[10px] uppercase tracking-wider text-black/40 font-medium">Progress</span>
      </div>
    </div>
  );
};

// --- Constants & Initial Data ---

const INITIAL_DATA = {
  users: [
    { id: "1", email: "mohan@protrack.com", password: "1234", name: "Mohan Y", role: "ADMIN" },
    { id: "2", email: "tejas@protrack.com", password: "2411", name: "Tejas K", role: "USER" },
    { id: "3", email: "pooja@protrack.com", password: "4321", name: "Pooja Y", role: "USER" }
  ],
  tasks: [
    { id: "101", week: 1, focusArea: "Design", task: "Finalize UI Mockups", owner: "Mohan Y", priority: "High", status: "Completed", completion: 100, startDate: "2026-03-01", deadline: "2026-03-05", notes: "Approved by client" },
    { id: "102", week: 1, focusArea: "Backend", task: "Setup Database Schema", owner: "Tejas K", priority: "High", status: "Completed", completion: 100, startDate: "2026-03-02", deadline: "2026-03-06", notes: "Using local JSON for now" },
    { id: "103", week: 2, focusArea: "Frontend", task: "Implement Dashboard Layout", owner: "Pooja Y", priority: "Medium", status: "In Progress", completion: 65, startDate: "2026-03-08", deadline: "2026-03-15", notes: "Charts integrated" },
    { id: "104", week: 2, focusArea: "Auth", task: "JWT Implementation", owner: "Tejas K", priority: "High", status: "In Progress", completion: 80, startDate: "2026-03-09", deadline: "2026-03-14", notes: "Testing middleware" },
    { id: "105", week: 3, focusArea: "Reporting", task: "PDF Export Feature", owner: "Mohan Y", priority: "Medium", status: "Not Started", completion: 0, startDate: "2026-03-16", deadline: "2026-03-22", notes: "Using jspdf" }
  ],
  logs: []
};

const storage = {
  getData: () => {
    const data = localStorage.getItem('protrack_data');
    if (!data) {
      localStorage.setItem('protrack_data', JSON.stringify(INITIAL_DATA));
      return INITIAL_DATA;
    }
    return JSON.parse(data);
  },
  saveData: (data: any) => {
    localStorage.setItem('protrack_data', JSON.stringify(data));
  }
};

// --- Main App ---

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(localStorage.getItem('token'));
  const [view, setView] = useState<'dashboard' | 'my-tasks' | 'reports' | 'admin'>('dashboard');
  const [tasks, setTasks] = useState<Task[]>([]);
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [loginForm, setLoginForm] = useState({ email: '', password: '' });
  const [loginError, setLoginError] = useState('');
  const [publicUsers, setPublicUsers] = useState<{ email: string, name: string }[]>([]);
  const [publicTasks, setPublicTasks] = useState<Task[]>([]);
  const [showPublicTasks, setShowPublicTasks] = useState(false);

  // AI Assistant State
  const [aiQuery, setAiQuery] = useState('');
  const [aiResponse, setAiResponse] = useState('');
  const [aiLoading, setAiLoading] = useState(false);

  useEffect(() => {
    const data = storage.getData();
    setPublicUsers(data.users.map((u: any) => ({ email: u.email, name: u.name })));
    setPublicTasks(data.tasks);
  }, []);

  useEffect(() => {
    if (token) {
      const savedUser = localStorage.getItem('user');
      if (savedUser) setUser(JSON.parse(savedUser));
      fetchData();
    } else {
      setLoading(false);
    }
  }, [token]);

  const fetchData = () => {
    setLoading(true);
    const data = storage.getData();
    
    if (user?.role === 'ADMIN') {
      setTasks(data.tasks);
      setUsers(data.users);
    } else {
      setTasks(data.tasks.filter((t: any) => t.owner === user?.name));
    }
    setLogs(data.logs.slice(-50).reverse());
    setLoading(false);
  };

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    const data = storage.getData();
    const foundUser = data.users.find((u: any) => u.email === loginForm.email && u.password === loginForm.password);
    
    if (foundUser) {
      const { password, ...userWithoutPassword } = foundUser;
      const mockToken = 'mock-jwt-' + Math.random().toString(36).substr(2);
      setToken(mockToken);
      setUser(userWithoutPassword);
      localStorage.setItem('token', mockToken);
      localStorage.setItem('user', JSON.stringify(userWithoutPassword));
    } else {
      setLoginError('Invalid email or password');
    }
  };

  const handleLogout = () => {
    setToken(null);
    setUser(null);
    localStorage.removeItem('token');
    localStorage.removeItem('user');
  };

  const updateTask = (taskId: string, updates: Partial<Task>) => {
    const data = storage.getData();
    const index = data.tasks.findIndex((t: any) => t.id === taskId);
    if (index === -1) return;

    const oldTask = data.tasks[index];
    const updatedTask = { ...oldTask, ...updates };
    
    if (updatedTask.status === 'Completed') {
      updatedTask.completion = 100;
    }

    data.tasks[index] = updatedTask;
    data.logs.push({
      id: Date.now().toString(),
      userName: user?.name,
      taskUpdated: updatedTask.task,
      oldStatus: oldTask.status,
      newStatus: updatedTask.status,
      completion: updatedTask.completion,
      timestamp: new Date().toISOString()
    });

    storage.saveData(data);
    fetchData();
  };

  const addTask = (newTask: any) => {
    const data = storage.getData();
    const taskWithId = { ...newTask, id: Date.now().toString() };
    data.tasks.push(taskWithId);
    data.logs.push({
      id: Date.now().toString(),
      userName: user?.name,
      taskUpdated: taskWithId.task,
      oldStatus: "N/A",
      newStatus: taskWithId.status,
      completion: taskWithId.completion,
      timestamp: new Date().toISOString()
    });
    storage.saveData(data);
    fetchData();
  };

  const deleteTask = (taskId: string) => {
    const data = storage.getData();
    data.tasks = data.tasks.filter((t: any) => t.id !== taskId);
    storage.saveData(data);
    fetchData();
  };

  const addUser = (newUser: any) => {
    const data = storage.getData();
    const userWithId = { ...newUser, id: Date.now().toString() };
    data.users.push(userWithId);
    storage.saveData(data);
    fetchData();
  };

  const deleteUser = (userId: string) => {
    const data = storage.getData();
    data.users = data.users.filter((u: any) => u.id !== userId);
    storage.saveData(data);
    fetchData();
  };

  const importTasks = (newTasks: any[]) => {
    const data = storage.getData();
    const processedTasks = newTasks.map(t => ({
      ...t,
      id: Math.random().toString(36).substr(2, 9),
      completion: parseInt(t.completion) || 0,
      week: parseInt(t.week) || 1
    }));
    data.tasks = [...data.tasks, ...processedTasks];
    storage.saveData(data);
    fetchData();
  };

  // --- Calculations ---

  const stats = useMemo(() => {
    const total = tasks.length;
    const completed = tasks.filter(t => t.status === 'Completed').length;
    const inProgress = tasks.filter(t => t.status === 'In Progress').length;
    const pending = tasks.filter(t => t.status === 'Not Started').length;
    const overallProgress = total > 0 ? tasks.reduce((acc, t) => acc + t.completion, 0) / total : 0;
    
    const now = new Date().getTime();
    const delayed = tasks.filter(t => t.status !== 'Completed' && new Date(t.deadline).getTime() < now).length;

    // Weekly progress
    const weeks = Array.from(new Set(tasks.map(t => t.week))).sort((a: number, b: number) => a - b);
    const weeklyProgress = weeks.map(w => {
      const weekTasks = tasks.filter(t => t.week === w);
      const progress = weekTasks.reduce((acc, t) => acc + t.completion, 0) / weekTasks.length;
      return { week: w, progress };
    });

    return { total, completed, inProgress, pending, overallProgress, delayed, weeklyProgress };
  }, [tasks]);

  const handleAiAssistant = async () => {
    if (!aiQuery.trim()) return;
    setAiLoading(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
      const model = ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `You are a project management assistant. Here is the current project status:
        Total Tasks: ${stats.total}
        Completed: ${stats.completed}
        Pending: ${stats.pending}
        Delayed: ${stats.delayed}
        Overall Progress: ${Math.round(stats.overallProgress)}%
        
        Tasks List: ${JSON.stringify(tasks.map(t => ({ task: t.task, owner: t.owner, status: t.status, deadline: t.deadline })))}
        
        User Question: ${aiQuery}`,
      });
      const result = await model;
      setAiResponse(result.text || "I couldn't process that.");
    } catch (err) {
      setAiResponse("Error connecting to AI assistant.");
    } finally {
      setAiLoading(false);
    }
  };

  const generateReport = () => {
    const doc = new jsPDF();
    
    doc.setFontSize(20);
    doc.text("Project Progress Report", 14, 22);
    
    doc.setFontSize(12);
    doc.text(`Generated on: ${new Date().toLocaleDateString()}`, 14, 30);
    doc.text(`Overall Completion: ${Math.round(stats.overallProgress)}%`, 14, 38);

    // Summary Table
    (doc as any).autoTable({
      startY: 45,
      head: [['Metric', 'Value']],
      body: [
        ['Total Tasks', stats.total],
        ['Completed Tasks', stats.completed],
        ['Pending Tasks', stats.pending],
        ['Delayed Tasks', stats.delayed],
      ],
    });

    // Weekly Progress
    doc.text("Weekly Progress", 14, (doc as any).lastAutoTable.finalY + 10);
    (doc as any).autoTable({
      startY: (doc as any).lastAutoTable.finalY + 15,
      head: [['Week', 'Progress %']],
      body: stats.weeklyProgress.map(w => [`Week ${w.week}`, `${Math.round(w.progress)}%`]),
    });

    // User Performance
    const userStats = Array.from(new Set(tasks.map(t => t.owner))).map(owner => {
      const userTasks = tasks.filter(t => t.owner === owner);
      const completed = userTasks.filter(t => t.status === 'Completed').length;
      return [owner, userTasks.length, completed, `${Math.round((completed / userTasks.length) * 100)}%`];
    });

    doc.text("User Performance", 14, (doc as any).lastAutoTable.finalY + 10);
    (doc as any).autoTable({
      startY: (doc as any).lastAutoTable.finalY + 15,
      head: [['User', 'Tasks Assigned', 'Tasks Completed', 'Completion %']],
      body: userStats,
    });

    doc.save("project-report.pdf");
  };

  if (!token) {
    return (
      <div className="min-h-screen bg-[#F5F5F5] flex items-center justify-center p-6">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md bg-white rounded-3xl shadow-xl p-8 border border-black/5"
        >
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-emerald-500 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-emerald-500/20">
              <TrendingUp className="text-white w-8 h-8" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900">ProTrack Dashboard</h1>
            <p className="text-gray-500 mt-2">Sign in to manage your projects</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Select User</label>
              <div className="relative">
                <select 
                  required
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none transition-all appearance-none bg-white"
                  value={loginForm.email}
                  onChange={e => setLoginForm({ ...loginForm, email: e.target.value })}
                >
                  <option value="">Choose a user...</option>
                  {publicUsers.map(u => (
                    <option key={u.email} value={u.email}>{u.name}</option>
                  ))}
                </select>
                <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">
                  <ChevronDown className="w-5 h-5" />
                </div>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
              <input 
                type="password" 
                required
                className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none transition-all"
                placeholder="••••••••"
                value={loginForm.password}
                onChange={e => setLoginForm({ ...loginForm, password: e.target.value })}
              />
            </div>
            {loginError && <p className="text-red-500 text-sm bg-red-50 p-3 rounded-lg border border-red-100">{loginError}</p>}
            <button 
              type="submit"
              className="w-full bg-gray-900 text-white py-3 rounded-xl font-semibold hover:bg-gray-800 transition-colors shadow-lg shadow-gray-900/10"
            >
              Sign In
            </button>
          </form>

          <div className="mt-6 pt-6 border-t border-gray-100">
            <button 
              onClick={() => setShowPublicTasks(!showPublicTasks)}
              className="w-full flex items-center justify-center gap-2 text-gray-600 hover:text-emerald-600 transition-colors font-medium"
            >
              <CheckSquare className="w-5 h-5" />
              {showPublicTasks ? 'Hide Tasks' : 'See Tasks'}
            </button>
          </div>

          {showPublicTasks && (
            <motion.div 
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              className="mt-6 space-y-3 overflow-hidden"
            >
              <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Current Project Tasks</h3>
              <div className="space-y-2 max-h-64 overflow-y-auto pr-2 custom-scrollbar">
                {publicTasks.map(task => (
                  <div key={task.id} className="p-3 rounded-xl bg-gray-50 border border-gray-100 hover:border-emerald-200 transition-colors">
                    <div className="flex justify-between items-start mb-1">
                      <span className="text-xs font-bold text-emerald-600 uppercase tracking-tighter bg-emerald-50 px-2 py-0.5 rounded-full">
                        Week {task.week}
                      </span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${
                        task.status === 'Completed' ? 'bg-green-100 text-green-700' :
                        task.status === 'In Progress' ? 'bg-amber-100 text-amber-700' :
                        'bg-gray-200 text-gray-700'
                      }`}>
                        {task.status}
                      </span>
                    </div>
                    <h4 className="text-sm font-semibold text-gray-800 leading-tight">{task.task}</h4>
                    <div className="flex items-center gap-3 mt-2">
                      <div className="flex items-center gap-1 text-[10px] text-gray-500">
                        <Users className="w-3 h-3" />
                        {task.owner}
                      </div>
                      <div className="flex items-center gap-1 text-[10px] text-gray-500">
                        <Clock className="w-3 h-3" />
                        {task.deadline}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
          
          <div className="mt-8 pt-6 border-t border-gray-100 text-center">
            <p className="text-xs text-gray-400 uppercase tracking-widest font-bold">Demo Credentials</p>
            <div className="mt-2 text-sm text-gray-500 space-y-1">
              <p>Mohan Y (Admin): 1234</p>
              <p>Tejas K: 2411 | Pooja Y: 4321</p>
            </div>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F5F5F5] flex">
      {/* Sidebar */}
      <aside className="w-64 bg-white border-r border-black/5 flex flex-col fixed h-full">
        <div className="p-6 flex items-center gap-3 border-b border-black/5">
          <div className="w-8 h-8 bg-emerald-500 rounded-lg flex items-center justify-center shadow-md shadow-emerald-500/20">
            <TrendingUp className="text-white w-5 h-5" />
          </div>
          <span className="font-bold text-lg tracking-tight">ProTrack</span>
        </div>

        <nav className="flex-1 p-4 space-y-1">
          <button 
            onClick={() => setView('dashboard')}
            className={cn(
              "w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all font-medium",
              view === 'dashboard' ? "bg-gray-900 text-white shadow-lg shadow-gray-900/10" : "text-gray-500 hover:bg-black/5"
            )}
          >
            <LayoutDashboard size={20} />
            Dashboard
          </button>
          <button 
            onClick={() => setView('my-tasks')}
            className={cn(
              "w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all font-medium",
              view === 'my-tasks' ? "bg-gray-900 text-white shadow-lg shadow-gray-900/10" : "text-gray-500 hover:bg-black/5"
            )}
          >
            <CheckSquare size={20} />
            My Tasks
          </button>
          <button 
            onClick={() => setView('reports')}
            className={cn(
              "w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all font-medium",
              view === 'reports' ? "bg-gray-900 text-white shadow-lg shadow-gray-900/10" : "text-gray-500 hover:bg-black/5"
            )}
          >
            <FileText size={20} />
            Reports
          </button>
          {user?.role === 'ADMIN' && (
            <button 
              onClick={() => setView('admin')}
              className={cn(
                "w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all font-medium",
                view === 'admin' ? "bg-gray-900 text-white shadow-lg shadow-gray-900/10" : "text-gray-500 hover:bg-black/5"
              )}
            >
              <Settings size={20} />
              Admin Panel
            </button>
          )}
        </nav>

        <div className="p-4 border-t border-black/5">
          <button 
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-red-500 hover:bg-red-50 transition-all font-medium"
          >
            <LogOut size={20} />
            Logout
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 ml-64 p-8">
        <header className="flex items-center justify-between mb-8">
          <div>
            <h2 className="text-3xl font-bold text-gray-900 tracking-tight">
              {view === 'dashboard' && 'Project Dashboard'}
              {view === 'my-tasks' && 'My Tasks'}
              {view === 'reports' && 'Project Reports'}
              {view === 'admin' && 'Admin Control Panel'}
            </h2>
            <p className="text-gray-500 mt-1">Welcome back, {user?.name}</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="font-bold text-gray-900">{user?.name}</p>
              <p className="text-xs text-emerald-500 font-bold uppercase tracking-widest">{user?.role}</p>
            </div>
            <div className="w-12 h-12 bg-gray-200 rounded-2xl border-2 border-white shadow-sm overflow-hidden">
              <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${user?.email}`} alt="avatar" />
            </div>
          </div>
        </header>

        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-500"></div>
          </div>
        ) : (
          <AnimatePresence mode="wait">
            {view === 'dashboard' && (
              <motion.div 
                key="dashboard"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-8"
              >
                {/* Summary Cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                  <Card className="flex items-center gap-6">
                    <CircularProgress value={stats.overallProgress} size={100} />
                    <div>
                      <p className="text-sm font-medium text-gray-500 uppercase tracking-wider">Overall</p>
                      <p className="text-2xl font-bold text-gray-900">Progress</p>
                    </div>
                  </Card>
                  <Card>
                    <div className="flex items-center justify-between mb-4">
                      <div className="p-3 bg-blue-50 text-blue-600 rounded-xl">
                        <LayoutDashboard size={24} />
                      </div>
                      <span className="text-xs font-bold text-blue-600 bg-blue-50 px-2 py-1 rounded-lg">Total</span>
                    </div>
                    <p className="text-3xl font-bold text-gray-900">{stats.total}</p>
                    <p className="text-sm text-gray-500 mt-1 font-medium">Total Tasks</p>
                  </Card>
                  <Card>
                    <div className="flex items-center justify-between mb-4">
                      <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl">
                        <CheckSquare size={24} />
                      </div>
                      <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded-lg">Done</span>
                    </div>
                    <p className="text-3xl font-bold text-gray-900">{stats.completed}</p>
                    <p className="text-sm text-gray-500 mt-1 font-medium">Completed Tasks</p>
                  </Card>
                  <Card>
                    <div className="flex items-center justify-between mb-4">
                      <div className="p-3 bg-amber-50 text-amber-600 rounded-xl">
                        <Clock size={24} />
                      </div>
                      <span className="text-xs font-bold text-amber-600 bg-amber-50 px-2 py-1 rounded-lg">Pending</span>
                    </div>
                    <p className="text-3xl font-bold text-gray-900">{stats.pending + stats.inProgress}</p>
                    <p className="text-sm text-gray-500 mt-1 font-medium">Active Tasks</p>
                  </Card>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                  {/* Charts */}
                  <div className="lg:col-span-2 space-y-8">
                    <Card>
                      <h3 className="text-lg font-bold mb-6 flex items-center gap-2">
                        <TrendingUp size={20} className="text-emerald-500" />
                        Weekly Progress
                      </h3>
                      <div className="h-64">
                        <Bar 
                          data={{
                            labels: stats.weeklyProgress.map(w => `Week ${w.week}`),
                            datasets: [{
                              label: 'Completion %',
                              data: stats.weeklyProgress.map(w => w.progress),
                              backgroundColor: '#10b981',
                              borderRadius: 8,
                            }]
                          }}
                          options={{
                            responsive: true,
                            maintainAspectRatio: false,
                            plugins: { legend: { display: false } },
                            scales: { y: { beginAtZero: true, max: 100 } }
                          }}
                        />
                      </div>
                    </Card>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                      <Card>
                        <h3 className="text-lg font-bold mb-6 flex items-center gap-2">
                          <CheckSquare size={20} className="text-blue-500" />
                          Focus Areas
                        </h3>
                        <div className="h-64 flex items-center justify-center">
                          <Pie 
                            data={{
                              labels: Array.from(new Set(tasks.map(t => t.focusArea))),
                              datasets: [{
                                data: Array.from(new Set(tasks.map(t => t.focusArea))).map(area => 
                                  tasks.filter(t => t.focusArea === area).length
                                ),
                                backgroundColor: ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'],
                                borderWidth: 0,
                              }]
                            }}
                            options={{
                              responsive: true,
                              maintainAspectRatio: false,
                              plugins: { legend: { position: 'bottom' } }
                            }}
                          />
                        </div>
                      </Card>

                      <Card>
                        <h3 className="text-lg font-bold mb-6 flex items-center gap-2">
                          <AlertCircle size={20} className="text-amber-500" />
                          Priority Breakdown
                        </h3>
                        <div className="h-64 flex items-center justify-center">
                          <Doughnut 
                            data={{
                              labels: ['High', 'Medium', 'Low'],
                              datasets: [{
                                data: [
                                  tasks.filter(t => t.priority === 'High').length,
                                  tasks.filter(t => t.priority === 'Medium').length,
                                  tasks.filter(t => t.priority === 'Low').length,
                                ],
                                backgroundColor: ['#ef4444', '#f59e0b', '#10b981'],
                                borderWidth: 0,
                              }]
                            }}
                            options={{
                              responsive: true,
                              maintainAspectRatio: false,
                              cutout: '70%',
                              plugins: { legend: { position: 'bottom' } }
                            }}
                          />
                        </div>
                      </Card>
                    </div>
                  </div>

                  {/* Sidebar Panel */}
                  <div className="space-y-8">
                    <Card className="bg-gray-900 text-white border-none shadow-xl shadow-gray-900/20">
                      <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                        <TrendingUp size={20} className="text-emerald-400" />
                        Project Health
                      </h3>
                      <div className="space-y-4">
                        <div>
                          <div className="flex justify-between text-sm mb-1">
                            <span className="text-gray-400">Completion Rate</span>
                            <span className="font-bold">{Math.round((stats.completed / stats.total) * 100) || 0}%</span>
                          </div>
                          <div className="w-full bg-white/10 h-2 rounded-full overflow-hidden">
                            <div 
                              className="bg-emerald-500 h-full transition-all duration-1000" 
                              style={{ width: `${(stats.completed / stats.total) * 100 || 0}%` }}
                            />
                          </div>
                        </div>
                        <div>
                          <div className="flex justify-between text-sm mb-1">
                            <span className="text-gray-400">On-Time Delivery</span>
                            <span className="font-bold">92%</span>
                          </div>
                          <div className="w-full bg-white/10 h-2 rounded-full overflow-hidden">
                            <div 
                              className="bg-blue-500 h-full transition-all duration-1000" 
                              style={{ width: '92%' }}
                            />
                          </div>
                        </div>
                      </div>
                      <button className="w-full mt-6 py-3 bg-white/10 hover:bg-white/20 rounded-xl text-sm font-bold transition-colors">
                        View Detailed Audit
                      </button>
                    </Card>

                    {/* Activity Log */}
                    <Card className="h-full">
                      <h3 className="text-lg font-bold mb-6 flex items-center gap-2">
                        <Clock size={20} className="text-blue-500" />
                        Recent Activity
                      </h3>
                      <div className="space-y-6 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                        {logs.length === 0 ? (
                          <p className="text-center text-gray-400 py-8 italic">No activity yet</p>
                        ) : logs.slice(0, 5).map(log => (
                          <div key={log.id} className="relative pl-6 border-l-2 border-gray-100 pb-2">
                            <div className="absolute -left-[9px] top-0 w-4 h-4 rounded-full bg-white border-2 border-emerald-500" />
                            <p className="text-sm font-bold text-gray-900">{log.userName}</p>
                            <p className="text-xs text-gray-500 mt-0.5">
                              Updated <span className="font-semibold text-gray-700">{log.taskUpdated}</span>
                            </p>
                            <div className="mt-2 flex items-center gap-2">
                              <span className="text-[10px] px-2 py-0.5 bg-gray-100 rounded-full text-gray-500 font-bold uppercase">
                                {log.oldStatus} → {log.newStatus}
                              </span>
                            </div>
                            <p className="text-[10px] text-gray-400 mt-2 font-medium">
                              {new Date(log.timestamp).toLocaleTimeString()}
                            </p>
                          </div>
                        ))}
                      </div>
                    </Card>

                    {/* AI Assistant */}
                    <Card className="bg-gray-900 text-white border-none shadow-xl shadow-gray-900/20">
                      <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                        <TrendingUp size={20} className="text-emerald-400" />
                        AI Project Assistant
                      </h3>
                      <div className="space-y-4">
                        <div className="bg-white/10 rounded-xl p-3 text-sm text-gray-300 min-h-[80px] max-h-[150px] overflow-y-auto custom-scrollbar">
                          {aiLoading ? (
                            <div className="flex items-center gap-2">
                              <div className="w-2 h-2 bg-emerald-400 rounded-full animate-bounce" />
                              <div className="w-2 h-2 bg-emerald-400 rounded-full animate-bounce [animation-delay:0.2s]" />
                              <div className="w-2 h-2 bg-emerald-400 rounded-full animate-bounce [animation-delay:0.4s]" />
                            </div>
                          ) : aiResponse || "Ask me anything about the project status..."}
                        </div>
                        <div className="relative">
                          <input 
                            type="text" 
                            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all pr-10"
                            placeholder="What tasks are pending?"
                            value={aiQuery}
                            onChange={e => setAiQuery(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && handleAiAssistant()}
                          />
                          <button 
                            onClick={handleAiAssistant}
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-emerald-400 hover:text-emerald-300 transition-colors"
                          >
                            <Send size={18} />
                          </button>
                        </div>
                      </div>
                    </Card>
                  </div>
                </div>
              </motion.div>
            )}

            {(view === 'my-tasks' || view === 'admin') && (
              <motion.div 
                key="tasks"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-6"
              >
                <Card>
                  <div className="flex items-center justify-between mb-8">
                    <div className="flex items-center gap-4 flex-1 max-w-md">
                      <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                        <input 
                          type="text" 
                          placeholder="Search tasks..." 
                          className="w-full pl-10 pr-4 py-2 rounded-xl border border-gray-200 outline-none focus:ring-2 focus:ring-emerald-500 transition-all"
                        />
                      </div>
                    </div>
                    {view === 'admin' && (
                      <div className="flex gap-3">
                        <label className="bg-gray-100 text-gray-700 px-4 py-2 rounded-xl font-semibold cursor-pointer hover:bg-gray-200 transition-all flex items-center gap-2">
                          <Plus size={18} />
                          Import CSV
                          <input 
                            type="file" 
                            accept=".csv" 
                            className="hidden" 
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) {
                                Papa.parse(file, {
                                  header: true,
                                  complete: (results) => {
                                    importTasks(results.data);
                                  }
                                });
                              }
                            }}
                          />
                        </label>
                        <button className="bg-emerald-500 text-white px-4 py-2 rounded-xl font-semibold hover:bg-emerald-600 transition-all shadow-lg shadow-emerald-500/20 flex items-center gap-2">
                          <Plus size={18} />
                          New Task
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-gray-100">
                          <th className="py-4 px-4 text-xs font-bold text-gray-400 uppercase tracking-widest">Week</th>
                          <th className="py-4 px-4 text-xs font-bold text-gray-400 uppercase tracking-widest">Task</th>
                          <th className="py-4 px-4 text-xs font-bold text-gray-400 uppercase tracking-widest">Owner</th>
                          <th className="py-4 px-4 text-xs font-bold text-gray-400 uppercase tracking-widest">Priority</th>
                          <th className="py-4 px-4 text-xs font-bold text-gray-400 uppercase tracking-widest">Status</th>
                          <th className="py-4 px-4 text-xs font-bold text-gray-400 uppercase tracking-widest">Progress</th>
                          <th className="py-4 px-4 text-xs font-bold text-gray-400 uppercase tracking-widest">Deadline</th>
                          <th className="py-4 px-4 text-xs font-bold text-gray-400 uppercase tracking-widest">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {tasks.map(task => {
                          const isDelayed = task.status !== 'Completed' && new Date(task.deadline) < new Date();
                          return (
                            <tr key={task.id} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors group">
                              <td className="py-4 px-4 font-bold text-gray-900">W{task.week}</td>
                              <td className="py-4 px-4">
                                <p className="font-bold text-gray-900">{task.task}</p>
                                <p className="text-xs text-gray-400 font-medium">{task.focusArea}</p>
                              </td>
                              <td className="py-4 px-4">
                                <div className="flex items-center gap-2">
                                  <div className="w-6 h-6 rounded-full bg-gray-200 overflow-hidden">
                                    <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${task.owner}`} alt="owner" />
                                  </div>
                                  <span className="text-sm font-semibold text-gray-700">{task.owner}</span>
                                </div>
                              </td>
                              <td className="py-4 px-4">
                                <span className={cn(
                                  "text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider",
                                  task.priority === 'High' ? "bg-red-50 text-red-600" :
                                  task.priority === 'Medium' ? "bg-amber-50 text-amber-600" :
                                  "bg-blue-50 text-blue-600"
                                )}>
                                  {task.priority}
                                </span>
                              </td>
                              <td className="py-4 px-4">
                                <select 
                                  value={task.status}
                                  onChange={(e) => updateTask(task.id, { status: e.target.value as any })}
                                  className={cn(
                                    "text-xs font-bold px-3 py-1.5 rounded-lg outline-none transition-all cursor-pointer",
                                    task.status === 'Completed' ? "bg-emerald-100 text-emerald-700" :
                                    task.status === 'In Progress' ? "bg-amber-100 text-amber-700" :
                                    isDelayed ? "bg-red-100 text-red-700" :
                                    "bg-gray-100 text-gray-500"
                                  )}
                                >
                                  <option value="Not Started">Not Started</option>
                                  <option value="In Progress">In Progress</option>
                                  <option value="Completed">Completed</option>
                                </select>
                              </td>
                              <td className="py-4 px-4 min-w-[120px]">
                                <div className="flex items-center gap-2">
                                  <div className="flex-1">
                                    <ProgressBar value={task.completion} color={task.status === 'Completed' ? 'bg-emerald-500' : 'bg-blue-500'} />
                                  </div>
                                  <input 
                                    type="number" 
                                    value={task.completion}
                                    onChange={(e) => updateTask(task.id, { completion: parseInt(e.target.value) || 0 })}
                                    className="w-10 text-xs font-bold text-gray-900 bg-transparent outline-none"
                                  />
                                  <span className="text-[10px] font-bold text-gray-400">%</span>
                                </div>
                              </td>
                              <td className="py-4 px-4">
                                <div className="flex flex-col">
                                  <span className={cn("text-xs font-bold", isDelayed ? "text-red-500" : "text-gray-700")}>
                                    {new Date(task.deadline).toLocaleDateString()}
                                  </span>
                                  {isDelayed && <span className="text-[10px] text-red-400 font-bold uppercase">Delayed</span>}
                                </div>
                              </td>
                              <td className="py-4 px-4">
                                <button className="p-2 text-gray-400 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-all">
                                  <ChevronRight size={18} />
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </Card>
              </motion.div>
            )}

            {view === 'reports' && (
              <motion.div 
                key="reports"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-8"
              >
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <Card className="flex flex-col items-center text-center py-12">
                    <div className="w-20 h-20 bg-emerald-100 text-emerald-600 rounded-3xl flex items-center justify-center mb-6">
                      <FileText size={40} />
                    </div>
                    <h3 className="text-2xl font-bold text-gray-900 mb-2">Project Summary Report</h3>
                    <p className="text-gray-500 mb-8 max-w-xs">Generate a comprehensive PDF report including progress charts, task summaries, and user performance.</p>
                    <button 
                      onClick={generateReport}
                      className="flex items-center gap-2 bg-gray-900 text-white px-8 py-3 rounded-2xl font-bold hover:bg-gray-800 transition-all shadow-xl shadow-gray-900/10"
                    >
                      <Download size={20} />
                      Generate PDF Report
                    </button>
                  </Card>

                  <Card>
                    <h3 className="text-lg font-bold mb-6">Report Preview</h3>
                    <div className="space-y-6">
                      <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100">
                        <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">Overall Completion</p>
                        <div className="flex items-end gap-2">
                          <span className="text-3xl font-bold text-gray-900">{Math.round(stats.overallProgress)}%</span>
                          <span className="text-sm text-emerald-500 font-bold mb-1">+5% from last week</span>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100">
                          <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">Active Tasks</p>
                          <p className="text-2xl font-bold text-gray-900">{stats.inProgress + stats.pending}</p>
                        </div>
                        <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100">
                          <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">Delayed</p>
                          <p className="text-2xl font-bold text-red-500">{stats.delayed}</p>
                        </div>
                      </div>
                    </div>
                  </Card>
                </div>
              </motion.div>
            )}

            {view === 'admin' && user?.role === 'ADMIN' && (
              <motion.div 
                key="admin"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-8"
              >
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  <Card>
                    <h3 className="text-lg font-bold mb-6 flex items-center gap-2">
                      <Users size={20} className="text-blue-500" />
                      User Management
                    </h3>
                    <div className="space-y-4">
                      {users.map(u => (
                        <div key={u.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-2xl border border-gray-100">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-gray-200 overflow-hidden">
                              <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${u.email}`} alt="avatar" />
                            </div>
                            <div>
                              <p className="font-bold text-gray-900">{u.name}</p>
                              <p className="text-xs text-gray-500">{u.email}</p>
                            </div>
                          </div>
                          <span className={cn(
                            "text-[10px] px-2 py-1 rounded-lg font-bold uppercase tracking-wider",
                            u.role === 'ADMIN' ? "bg-gray-900 text-white" : "bg-white text-gray-500 border border-gray-200"
                          )}>
                            {u.role}
                          </span>
                        </div>
                      ))}
                      <button className="w-full py-3 border-2 border-dashed border-gray-200 rounded-2xl text-gray-400 font-bold hover:border-gray-900 hover:text-gray-900 transition-all">
                        + Add New User
                      </button>
                    </div>
                  </Card>

                  <Card>
                    <h3 className="text-lg font-bold mb-6 flex items-center gap-2">
                      <Settings size={20} className="text-emerald-500" />
                      System Settings
                    </h3>
                    <div className="space-y-6">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-bold text-gray-900">Email Notifications</p>
                          <p className="text-xs text-gray-500">Notify users about task deadlines</p>
                        </div>
                        <div className="w-12 h-6 bg-emerald-500 rounded-full relative">
                          <div className="absolute right-1 top-1 w-4 h-4 bg-white rounded-full shadow-sm" />
                        </div>
                      </div>
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-bold text-gray-900">Auto-Archive</p>
                          <p className="text-xs text-gray-500">Archive completed tasks after 30 days</p>
                        </div>
                        <div className="w-12 h-6 bg-gray-200 rounded-full relative">
                          <div className="absolute left-1 top-1 w-4 h-4 bg-white rounded-full shadow-sm" />
                        </div>
                      </div>
                      <div className="pt-6 border-t border-gray-100">
                        <button className="w-full bg-red-50 text-red-600 py-3 rounded-2xl font-bold hover:bg-red-100 transition-all">
                          Reset Project Data
                        </button>
                      </div>
                    </div>
                  </Card>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        )}
      </main>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(0,0,0,0.1);
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(0,0,0,0.2);
        }
      `}</style>
    </div>
  );
}

