import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const JWT_SECRET = process.env.JWT_SECRET || "default_secret_key";
const DATA_FILE = path.join(__dirname, "data.json");

// Initial data structure
const initialData = {
  users: [
    { id: "1", email: "mohan@protrack.com", password: "", name: "Mohan Y", role: "ADMIN" },
    { id: "2", email: "tejas@protrack.com", password: "", name: "Tejas K", role: "USER" },
    { id: "3", email: "pooja@protrack.com", password: "", name: "Pooja Y", role: "USER" }
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

// Helper to read/write data
function readData() {
  if (!fs.existsSync(DATA_FILE)) {
    // Hash default passwords on first run
    const salt = bcrypt.genSaltSync(10);
    initialData.users[0].password = bcrypt.hashSync("1234", salt);
    initialData.users[1].password = bcrypt.hashSync("2411", salt);
    initialData.users[2].password = bcrypt.hashSync("4321", salt);
    fs.writeFileSync(DATA_FILE, JSON.stringify(initialData, null, 2));
    return initialData;
  }
  return JSON.parse(fs.readFileSync(DATA_FILE, "utf-8"));
}

function writeData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // --- Auth Middleware ---
  const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.sendStatus(401);

    jwt.verify(token, JWT_SECRET, (err, user) => {
      if (err) return res.sendStatus(403);
      (req as any).user = user;
      next();
    });
  };

  const isAdmin = (req, res, next) => {
    if ((req as any).user.role !== 'ADMIN') return res.status(403).send("Admin access required");
    next();
  };

  // --- API Routes ---

  // Public endpoint for login dropdown
  app.get("/api/public/users", (req, res) => {
    const data = readData();
    res.json(data.users.map(u => ({ email: u.email, name: u.name })));
  });

  // Public endpoint for "See Tasks"
  app.get("/api/public/tasks", (req, res) => {
    const data = readData();
    res.json(data.tasks);
  });

  // Login
  app.post("/api/login", async (req, res) => {
    const { email, password } = req.body;
    const data = readData();
    const user = data.users.find(u => u.email === email);
    if (!user || !bcrypt.compareSync(password, user.password)) {
      return res.status(401).json({ message: "Invalid credentials" });
    }
    const token = jwt.sign({ id: user.id, email: user.email, role: user.role, name: user.name }, JWT_SECRET);
    res.json({ token, user: { id: user.id, email: user.email, role: user.role, name: user.name } });
  });

  // Tasks
  app.get("/api/tasks", authenticateToken, (req, res) => {
    const data = readData();
    if ((req as any).user.role === 'ADMIN') {
      res.json(data.tasks);
    } else {
      res.json(data.tasks.filter(t => t.owner === (req as any).user.name));
    }
  });

  app.post("/api/tasks", authenticateToken, isAdmin, (req, res) => {
    const data = readData();
    const newTask = { ...req.body, id: Date.now().toString() };
    data.tasks.push(newTask);
    data.logs.push({
      id: Date.now().toString(),
      userName: (req as any).user.name,
      taskUpdated: newTask.task,
      oldStatus: "N/A",
      newStatus: newTask.status,
      completion: newTask.completion,
      timestamp: new Date().toISOString()
    });
    writeData(data);
    res.status(201).json(newTask);
  });

  app.put("/api/tasks/:id", authenticateToken, (req, res) => {
    const data = readData();
    const index = data.tasks.findIndex(t => t.id === req.params.id);
    if (index === -1) return res.status(404).send("Task not found");

    const oldTask = data.tasks[index];
    
    // Check permissions
    if ((req as any).user.role !== 'ADMIN' && oldTask.owner !== (req as any).user.name) {
      return res.status(403).send("Unauthorized to update this task");
    }

    const updatedTask = { ...oldTask, ...req.body };
    
    // Logic: When status = Completed automatically set completion = 100%
    if (updatedTask.status === 'Completed') {
      updatedTask.completion = 100;
    }

    data.tasks[index] = updatedTask;

    // Log update
    data.logs.push({
      id: Date.now().toString(),
      userName: (req as any).user.name,
      taskUpdated: updatedTask.task,
      oldStatus: oldTask.status,
      newStatus: updatedTask.status,
      completion: updatedTask.completion,
      timestamp: new Date().toISOString()
    });

    writeData(data);
    res.json(updatedTask);
  });

  app.delete("/api/tasks/:id", authenticateToken, isAdmin, (req, res) => {
    const data = readData();
    data.tasks = data.tasks.filter(t => t.id !== req.params.id);
    writeData(data);
    res.sendStatus(204);
  });

  // Users Management
  app.get("/api/users", authenticateToken, isAdmin, (req, res) => {
    const data = readData();
    res.json(data.users.map(({ password, ...u }) => u));
  });

  app.post("/api/users", authenticateToken, isAdmin, (req, res) => {
    const { email, password, name, role } = req.body;
    const data = readData();
    if (data.users.find(u => u.email === email)) return res.status(400).send("User exists");
    
    const salt = bcrypt.genSaltSync(10);
    const newUser = {
      id: Date.now().toString(),
      email,
      name,
      role,
      password: bcrypt.hashSync(password, salt)
    };
    data.users.push(newUser);
    writeData(data);
    res.status(201).json({ id: newUser.id, email, name, role });
  });

  app.delete("/api/users/:id", authenticateToken, isAdmin, (req, res) => {
    const data = readData();
    data.users = data.users.filter(u => u.id !== req.params.id);
    writeData(data);
    res.sendStatus(204);
  });

  // Logs
  app.get("/api/logs", authenticateToken, (req, res) => {
    const data = readData();
    res.json(data.logs.slice(-50).reverse()); // Last 50 logs
  });

  // CSV Import
  app.post("/api/import-tasks", authenticateToken, isAdmin, (req, res) => {
    const { tasks } = req.body;
    const data = readData();
    const processedTasks = tasks.map(t => ({
      ...t,
      id: Math.random().toString(36).substr(2, 9),
      completion: parseInt(t.completion) || 0,
      week: parseInt(t.week) || 1
    }));
    data.tasks = [...data.tasks, ...processedTasks];
    writeData(data);
    res.json({ message: "Imported successfully", count: processedTasks.length });
  });

  // --- Vite / Static Files ---
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
