const express = require('express');
const router = express.Router();
const iotController = require('../controllers/iot.controller');
const { protect, authorize } = require('../middleware/auth.middleware');

router.post('/ingest', iotController.ingestReading);

router.use(protect, authorize('admin'));
router.get('/latest', iotController.getLatestReading);
router.get('/history', iotController.getReadingHistory);
router.post('/forecast', iotController.forecastReading);
router.get('/forecast/latest', iotController.forecastLatestReadings);

module.exports = router;