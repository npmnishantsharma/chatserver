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
    clientTracking: true,
    // Remove path and verifyClient for now to test basic connectivity
    pingTimeout: 30000, // 30 seconds
    pingInterval: 25000 // 25 seconds
});

// Update the heartbeat mechanism
function noop() {}

function heartbeat() {
    this.isAlive = true;
}

// WebSocket connection handler
wss.on('connection', (ws, req) => {
    const connectionId = uuidv4();
    const timestamp = new Date().toISOString();
    
    console.log('New WebSocket connection:', {
        id: connectionId,
        timestamp,
        remoteAddress: req.socket.remoteAddress,
        headers: {
            origin: req.headers.origin,
            userAgent: req.headers['user-agent']
        }
    });
    
    ws.isAlive = true;
    ws.connectionId = connectionId;
    ws.connectionTime = timestamp;
    
    ws.on('pong', heartbeat);
    ws.on('error', (error) => {
        console.error('WebSocket error:', {
            connectionId,
            error: error.message,
            timestamp: new Date().toISOString(),
            remoteAddress: req.socket.remoteAddress
        });
    });
    
    ws.on('close', (code, reason) => {
        console.log('WebSocket closed:', {
            connectionId,
            code,
            reason: reason.toString(),
            timestamp: new Date().toISOString(),
            duration: `${(new Date().getTime() - new Date(timestamp).getTime()) / 1000}s`
        });
    });

    connections.set(connectionId, ws);
    ws.ping(noop);
});

// Update the ping interval
const interval = setInterval(function ping() {
    wss.clients.forEach(function each(ws) {
        if (ws.isAlive === false) {
            console.log('Terminating inactive connection');
            return ws.terminate();
        }
        
        ws.isAlive = false;
        ws.ping(noop);
    });
}, 30000);

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

