require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();

// Hostinger runs the app behind a proxy; trust its X-Forwarded-For so req.ip is the
// real client address (the collector PIN lockout is per IP).
app.set('trust proxy', 1);

// Middleware
// CORS_ORIGIN: comma-separated list of allowed origins (e.g. https://yourdomain.com).
// Leave unset in development to allow all origins.
const allowedOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map((origin) => origin.trim())
  : null;
app.use(cors(allowedOrigins ? { origin: allowedOrigins } : undefined));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

console.log('Supabase backend ready');

// Routes
app.get('/', (req, res) => {
  res.json({ message: 'Welcome to AqualityBill Admin API' });
});

// Import routes
const userRoutes = require('./routes/user.routes');
const billRoutes = require('./routes/bill.routes');
const leakReportRoutes = require('./routes/leakReport.routes');
const iotRoutes = require('./routes/iot.routes');
const installationRoutes = require('./routes/installation.routes');
const disconnectionRoutes = require('./routes/disconnection.routes');
const claimRequestRoutes = require('./routes/claimRequest.routes');
const downloadRoutes = require('./routes/download.routes');
const collectorPinRoutes = require('./routes/collectorPin.routes');

app.use('/api/users', userRoutes);
app.use('/api/bills', billRoutes);
app.use('/api/leak-reports', leakReportRoutes);
app.use('/api/iot', iotRoutes);
app.use('/api/installations', installationRoutes);
app.use('/api/disconnections', disconnectionRoutes);
app.use('/api/account-claims', claimRequestRoutes);
app.use('/api/downloads', downloadRoutes);
app.use('/api/collector-pin', collectorPinRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ message: 'Something went wrong!', error: err.message });
});

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
