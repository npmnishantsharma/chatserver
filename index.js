const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const dotenv = require('dotenv');

dotenv.config();

const app = express();
const port = process.env.PORT||3009;

// Enable CORS first
app.use(cors({
    origin: "*",
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

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

const chatRoutes = require('./routes/chat');
const createSessionRoutes = require('./routes/createSession');
app.use('/web', chatRoutes);
app.use('/web', createSessionRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Global error handler:', err);
    res.status(500).json({
        status: 'error',
        message: 'Internal server error',
        error: err.message
    });
});

app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});
