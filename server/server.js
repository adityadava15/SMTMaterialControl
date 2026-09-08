const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Session configuration with 15-minute inactivity timeout
app.use(session({
    secret: process.env.SESSION_SECRET || 'smt-material-control-secret',
    resave: false,
    saveUninitialized: false,
    rolling: true, // Reset expiration on every request (activity)
    cookie: {
        maxAge: 1000 * 60 * 15, // 15 minutes
        httpOnly: true,
        secure: false // Set to true if using HTTPS
    }
}));

// Static files
app.use(express.static(path.join(__dirname, '../public')));

// API Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/materials', require('./routes/materials'));
app.use('/api/material-catalog', require('./routes/material-catalog'));
app.use('/api/transactions', require('./routes/transactions'));
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api/users', require('./routes/users'));
app.use('/api/machine-output', require('./routes/machine-output'));

// Root route - redirect to login
app.get('/', (req, res) => {
    if (req.session && req.session.userId) {
        res.redirect('/dashboard.html');
    } else {
        res.redirect('/login.html');
    }
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({ error: 'Route not found' });
});

// Error handler
app.use((err, req, res, next) => {
    console.error('Server error:', err);
    res.status(500).json({ error: 'Internal server error' });
});

// Start server
app.listen(PORT, () => {
    console.log(`
╔═══════════════════════════════════════════════════════╗
║     SMT Material Control System                      ║
║     Server running on http://localhost:${PORT}         ║
╚═══════════════════════════════════════════════════════╝
    `);
});

module.exports = app;
