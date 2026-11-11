const express = require('express');
const router = express.Router();
const collectorPinController = require('../controllers/collectorPin.controller');
const { protect, authorize } = require('../middleware/auth.middleware');

// Collector app checks a PIN (public, rate-limited inside the controller).
router.post('/verify', collectorPinController.verifyPin);

// Admin site: see whether a PIN is set, and set/change it.
router.get('/', protect, authorize('admin'), collectorPinController.getPinStatus);
router.put('/', protect, authorize('admin'), collectorPinController.setPin);

module.exports = router;
