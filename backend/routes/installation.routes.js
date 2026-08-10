const express = require('express');
const router = express.Router();
const installationController = require('../controllers/installation.controller');
const { protect, authorize } = require('../middleware/auth.middleware');

router.use(protect);

router.route('/')
  .get(authorize('admin'), installationController.getAllInstallations)
  .post(authorize('admin'), installationController.createInstallation);

router.route('/:id')
  .delete(authorize('admin'), installationController.deleteInstallation);

router.patch('/:id/status', authorize('admin'), installationController.updateInstallationStatus);

module.exports = router;
