const express = require('express');
const router = express.Router();
const leakReportController = require('../controllers/leakReport.controller');
const { protect, authorize } = require('../middleware/auth.middleware');

router.use(protect);

router.route('/')
  .get(authorize('admin'), leakReportController.getAllLeakReports)
  .post(authorize('admin'), leakReportController.createLeakReport);

router.route('/:id')
  .put(authorize('admin'), leakReportController.updateLeakReport)
  .delete(authorize('admin'), leakReportController.deleteLeakReport);

router.patch('/:id/status', authorize('admin'), leakReportController.updateLeakReportStatus);

module.exports = router;
