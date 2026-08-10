const express = require('express');
const router = express.Router();
const disconnectionController = require('../controllers/disconnection.controller');
const { protect, authorize } = require('../middleware/auth.middleware');

router.use(protect);

router.get('/', disconnectionController.getDisconnectionCandidates);
router.patch('/:id/status', authorize('admin'), disconnectionController.updateConnectionStatus);

module.exports = router;
