const express = require('express');
const app = express();

app.use(express.json());
app.use(express.static('public'));

// API Routes
app.get('/api/appointments', (req, res) => {
    res.json({ message: 'Get appointments' });
});

app.post('/api/appointments', (req, res) => {
    res.json({ message: 'Create appointment', data: req.body });
});

app.get('/api/services', (req, res) => {
    res.json({ services: ['Haircut', 'Color', 'Treatment'] });
});

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok' });
});

exports.handler = async (event, context) => {
    return app(event, context);
};
