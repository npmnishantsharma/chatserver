const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const dotenv = require('dotenv');
const fs = require('fs').promises;
const path = require('path');
const imageAnalysisRoutes = require('./routes/imageAnalysis');
const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');
const https = require('https');
const http = require('http');

dotenv.config();

const app = express();
const port = process.env.PORT || 3009;

// Create server instance based on environment
let server;
if (process.env.NODE_ENV === 'production') {
    // For Render deployment, we don't need to create HTTPS server
    // as Render handles SSL/TLS termination
    server = http.createServer(app);
    console.log('Created HTTP server for production (SSL handled by Render)');
} else {
    // For local development
    server = http.createServer(app);
    console.log('Created HTTP server for development');
}

// Update CORS configuration to be more specific
app.use(cors({
  origin: process.env.NODE_ENV === 'production' 
    ? ['https://mathsketch.nishantapps.in', 'https://chatserver-r7nu.onrender.com']
    : '*',
  methods: ['GET', 'POST'],
  credentials: true
}));

// Create WebSocket server with more specific configuration
const wss = new WebSocket.Server({ 
    server,
    path: '/ws', // Specific path for WebSocket connections
    clientTracking: true,
    // Add WebSocket server options
    verifyClient: (info, cb) => {
        const origin = info.origin || info.req.headers.origin;
        // Allow connections from our domains
        const allowedOrigins = process.env.NODE_ENV === 'production'
            ? ['https://mathsketch.nishantapps.in', 'https://chatserver-r7nu.onrender.com']
            : ['http://localhost:3000'];
            
        if (allowedOrigins.includes(origin)) {
            cb(true);
        } else {
            cb(false, 403, 'Forbidden');
        }
    },
    handleProtocols: (protocols, req) => {
        // Accept any protocol or return false if none are supported
        return protocols[0] || false;
    }
});

// Add heartbeat to keep connections alive
function heartbeat() {
    this.isAlive = true;
}

const interval = setInterval(function ping() {
    wss.clients.forEach(function each(ws) {
        if (ws.isAlive === false) return ws.terminate();
        ws.isAlive = false;
        ws.ping();
    });
}, 30000);

// Store active connections and sessions
const connections = new Map();
const userSessions = new Map();

// Middleware setup
app.use(express.json());
app.use(cors());
app.use(bodyParser.json({
    limit: '50mb',
    verify: (req, res, buf) => {
        try {
            JSON.parse(buf);
        } catch(e) {
            res.status(400).json({ 
                status: 'error', 
                message: 'Invalid JSON' 
            });
            throw new Error('Invalid JSON');
        }
    }
}));

app.use(bodyParser.urlencoded({ 
    extended: true, 
    limit: '50mb' 
}));

// Function to broadcast session count to all connections of a user
const broadcastSessionCount = (userId) => {
    if (userSessions.has(userId)) {
        const sessionCount = userSessions.get(userId).size;
        userSessions.get(userId).forEach(sessionId => {
            const connection = connections.get(sessionId);
            if (connection && connection.readyState === WebSocket.OPEN) {
                connection.send(JSON.stringify({
                    type: 'sessions',
                    count: sessionCount
                }));
            }
        });
    }
};

// Function to broadcast updates to all active users
const broadcastAllUpdates = () => {
    for (const [userId] of userSessions) {
        broadcastSessionCount(userId);
    }
};

// Set up interval for regular updates
setInterval(broadcastAllUpdates, 5000);

// WebSocket connection handler
wss.on('connection', (ws, req) => {
    console.log('New WebSocket connection from:', req.headers.origin);
    ws.isAlive = true;
    ws.on('pong', heartbeat);
    
    const connectionId = uuidv4();
    connections.set(connectionId, ws);

    // Handle incoming messages
    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            
            // Handle session registration
            if (data.type === 'register') {
                const { userId } = data;
                if (!userSessions.has(userId)) {
                    userSessions.set(userId, new Set());
                }
                userSessions.get(userId).add(connectionId);
                
                // Broadcast updated session count immediately
                broadcastSessionCount(userId);
            }
            if(data.type === 'getUpdates') {
                const { userId } = data;
                broadcastSessionCount(userId);
            }
        } catch (error) {
            console.error('Error processing WebSocket message:', error);
        }
    });

    // Handle client disconnection
    ws.on('close', () => {
        // Clean up the connection
        connections.delete(connectionId);
        
        // Remove session from user sessions and notify others
        for (const [userId, sessions] of userSessions.entries()) {
            if (sessions.has(connectionId)) {
                sessions.delete(connectionId);
                
                // Broadcast updated count to remaining sessions
                broadcastSessionCount(userId);
                
                // Clean up empty user entries
                if (sessions.size === 0) {
                    userSessions.delete(userId);
                }
                break;
            }
        }
    });

    // Send initial connection status
    ws.send(JSON.stringify({
        type: 'connection',
        status: 'connected'
    }));
});

wss.on('close', function close() {
    clearInterval(interval);
});

// Routes
app.use('/web', imageAnalysisRoutes);
app.use(express.static('public'));

// Add a health check endpoint
app.get('/health', (req, res) => {
    res.json({ status: 'ok', connections: wss.clients.size });
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Global error handler:', err);
    res.status(500).json({
        status: 'error',
        message: 'Internal server error',
        error: err.message
    });
});

// Start server
server.listen(port, () => {
    console.log(`Server is running on port ${port} (${process.env.NODE_ENV || 'development'})`);
});

