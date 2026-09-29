const express = require('express');
const path = require('path');
const fs = require('fs');
const router = express.Router();

// The collector app (AquaBilling) is for Metolza collector staff only, not
// the general public — unlike the consumer app, its file isn't in the
// frontend's public/ folder (which anyone could hit directly by URL). It
// lives here instead, only reachable through this password check.
const COLLECTOR_APK_PATH = path.join(__dirname, '..', 'private-downloads', 'aquabilling.apk');

router.post('/collector-app', (req, res) => {
  const expected = process.env.COLLECTOR_APP_PASSWORD;
  if (!expected) {
    return res.status(500).json({ message: 'Collector app download is not configured yet.' });
  }

  const password = String(req.body?.password ?? '');
  if (password !== expected) {
    return res.status(401).json({ message: 'Incorrect password.' });
  }

  if (!fs.existsSync(COLLECTOR_APK_PATH)) {
    return res.status(404).json({ message: 'App file not found on the server.' });
  }

  res.download(COLLECTOR_APK_PATH, 'AquaBilling.apk');
});

module.exports = router;
