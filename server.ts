import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json());

// API Routes
app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

app.get("/api/ip", (req, res) => {
  const forwardedFor = req.headers['x-forwarded-for'];
  let ip = '';
  if (typeof forwardedFor === 'string') {
    ip = forwardedFor.split(',')[0].trim();
  } else if (Array.isArray(forwardedFor)) {
    ip = forwardedFor[0].trim();
  } else {
    ip = (req.headers['x-real-ip'] as string) || req.socket.remoteAddress || '127.0.0.1';
  }
  
  // Clean up IPv6 loopback representation if needed
  if (ip === '::1' || ip === '::ffff:127.0.0.1') {
    ip = '127.0.0.1';
  }
  res.json({ ip });
});

// Vite middleware for development
async function startServer() {
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
