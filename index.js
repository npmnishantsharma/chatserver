const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const dotenv = require('dotenv');
const fs = require('fs').promises;
const path = require('path');
const imageAnalysisRoutes = require('./routes/imageAnalysis');
const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');

dotenv.config();

const app = express();
const port = process.env.PORT||3009;

// Create HTTP server instance
const server = require('http').createServer(app);

// Create WebSocket server attached to HTTP server
const wss = new WebSocket.Server({ server });

// Store active connections and sessions
const connections = new Map();
const userSessions = new Map();

app.use(express.json());

// Enable CORS
app.use(cors("*"));

// Add body parser middleware with increased limit
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

// Routes
const chatRoutes = require('./routes/chat');
const createSessionRoutes = require('./routes/createSession');
const quizRoutes = require('./routes/quiz');

app.use('/web', chatRoutes);
app.use('/web', createSessionRoutes);
app.use('/web', imageAnalysisRoutes);
app.use('/quiz', quizRoutes);
app.use(express.static('public'));


// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Global error handler:', err);
    
    if (req.accepts('html')) {
        res.status(500).send(`
            <html>
                <body style="background: #1a1a1a; color: white; font-family: system-ui; padding: 2rem;">
                    <h1>Error</h1>
                    <p>${err.message}</p>
                </body>
            </html>
        `);
    } else {
        res.status(500).json({
            status: 'error',
            message: 'Internal server error',
            error: err.message
        });
    }
});

// Start server
server.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});

// Image upload endpoint
app.post('/chat', async (req, res) => {
    const { message, imageData } = req.body;
    
    if (imageData) {
        const base64Data = imageData.replace(/^data:image\/png;base64,/, '');
        const uploadsDir = path.join(__dirname, 'uploads');
        
        try {
            await fs.mkdir(uploadsDir, { recursive: true });
            const filename = `drawing-${Date.now()}.png`;
            const filepath = path.join(uploadsDir, filename);
            await fs.writeFile(filepath, base64Data, 'base64');
        } catch (err) {
            console.error('Error saving image:', err);
            res.status(500).json({ error: 'Failed to save image' });
        }
    }
});

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
    console.log('New WebSocket connection');
    
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

