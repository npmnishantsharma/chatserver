const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');

// Store active quiz sessions
const quizSessions = new Map();

// Create a new quiz session
router.post('/create', (req, res) => {
    try {
        const sessionId = uuidv4();
        
        // Initialize session data
        quizSessions.set(sessionId, {
            id: sessionId,
            host: null,
            players: new Set(),
            currentQuestion: 0,
            scores: new Map(),
            status: 'waiting', // waiting, active, completed
            createdAt: new Date(),
            lastActivity: new Date()
        });

        console.log(`Created quiz session: ${sessionId}`);
        
        res.json({ 
            status: 'success',
            sessionId,
            message: 'Quiz session created successfully'
        });
    } catch (error) {
        console.error('Error creating quiz session:', error);
        res.status(500).json({
            status: 'error',
            message: 'Failed to create quiz session'
        });
    }
});

// Get session info
router.get('/:sessionId', (req, res) => {
    const { sessionId } = req.params;
    
    if (!quizSessions.has(sessionId)) {
        return res.status(404).json({
            status: 'error',
            message: 'Quiz session not found'
        });
    }

    const session = quizSessions.get(sessionId);
    
    res.json({
        status: 'success',
        session: {
            id: session.id,
            playerCount: session.players.size,
            status: session.status,
            currentQuestion: session.currentQuestion
        }
    });
});

// Clean up inactive sessions periodically
setInterval(() => {
    const now = new Date();
    for (const [sessionId, session] of quizSessions) {
        // Remove sessions that are inactive for more than 1 hour
        if (now.getTime() - session.lastActivity.getTime() > 3600000) {
            quizSessions.delete(sessionId);
            console.log(`Cleaned up inactive session: ${sessionId}`);
        }
    }
}, 300000); // Run every 5 minutes

module.exports = router; 