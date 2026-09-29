const express = require('express');
const router = express.Router();
const claimRequestController = require('../controllers/claimRequest.controller');
const { protect, authorize } = require('../middleware/auth.middleware');

router.use(protect);
router.use(authorize('admin'));

router.get('/', claimRequestController.getAllClaimRequests);
router.patch('/:id/approve', claimRequestController.approveClaimRequest);
router.patch('/:id/reject', claimRequestController.rejectClaimRequest);

module.exports = router;
