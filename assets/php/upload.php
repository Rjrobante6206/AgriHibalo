<?php
/**
 * AgriHibalo — upload.php
 * Handles image uploads for question photos.
 *
 * ENDPOINT:
 *   POST (multipart/form-data) with field name 'image'
 *   → Returns { success: true, data: { url: '...' } }
 *
 * FRONTEND USAGE (replace the FileReader preview in app.js):
 *   const formData = new FormData();
 *   formData.append('image', fileInput.files[0]);
 *   fetch('assets/php/upload.php', { method: 'POST', body: formData })
 *     .then(r => r.json())
 *     .then(data => { if (data.success) imageUrl = data.data.url; });
 */

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/db.php';

session_start();

/* ── Auth: only logged-in users can upload ─────────────────── */
if (empty($_SESSION['user_id'])) {                 // PLACEHOLDER — session key from auth.php
    jsonError('You must be logged in to upload images.', 401);
}

/* ── Check a file was actually sent ─────────────────────────── */
if (empty($_FILES['image']) || $_FILES['image']['error'] !== UPLOAD_ERR_OK) {
    jsonError('No valid image file received.');
}

$file   = $_FILES['image'];
$size   = $file['size'];
$tmp    = $file['tmp_name'];
$type   = mime_content_type($tmp);

/* ── Validate MIME type ─────────────────────────────────────── */
$allowed_types = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
if (!in_array($type, $allowed_types)) {
    jsonError('Only JPG, PNG, GIF, and WEBP images are accepted.');
}

/* ── Validate file size (5 MB max) ─────────────────────────── */
$max_bytes = 5 * 1024 * 1024; // 5 MB
if ($size > $max_bytes) {
    jsonError('Image must be smaller than 5 MB.');
}

/* ── Determine upload directory ─────────────────────────────── */
// PLACEHOLDER — change UPLOAD_DIR to your actual server path.
// The path below assumes uploads go into AgriHibalo/assets/assets/uploads/
define('UPLOAD_DIR', __DIR__ . '/../assets/uploads/');   // PLACEHOLDER — actual directory on server
define('UPLOAD_URL', APP_URL . '/assets/assets/uploads/'); // PLACEHOLDER — public URL, set APP_URL in config.php

/* ── Create directory if it doesn't exist ── */
if (!is_dir(UPLOAD_DIR)) {
    mkdir(UPLOAD_DIR, 0755, true);
}

/* ── Generate a unique filename to avoid collisions ─────────── */
$ext      = match ($type) {
    'image/jpeg' => 'jpg',
    'image/png'  => 'png',
    'image/gif'  => 'gif',
    'image/webp' => 'webp',
    default      => 'jpg',
};
$filename = sprintf('%d_%s.%s', time(), bin2hex(random_bytes(8)), $ext);
$dest     = UPLOAD_DIR . $filename;

/* ── Move the uploaded temp file to the upload directory ─────── */
if (!move_uploaded_file($tmp, $dest)) {
    jsonError('Failed to save the uploaded image. Check server directory permissions.'); // PLACEHOLDER — check folder write permissions
}

/* ── Return the public URL to the frontend ─────────────────── */
$url = UPLOAD_URL . $filename;

jsonResponse(true, [
    'url'      => $url,
    'filename' => $filename,
]);
