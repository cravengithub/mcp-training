// app.js - Aplikasi Hello World untuk latihan Docker
const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;
app.get('/', (req, res) => {
    res.json({
        message: 'Hello from Docker!',
        timestamp: new Date().toISOString(),
        container: process.env.HOSTNAME || 'unknown'
    });
});
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok' });
});
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Container hostname: ${process.env.HOSTNAME || 'unknown'}`);
});