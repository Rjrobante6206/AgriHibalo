<?php
/**
 * AgriHibalo — config.php
 * Central configuration file for the application.
 * All database credentials and app settings are defined here.
 * ─────────────────────────────────────────────────────────────
 * When MySQL is set up, replace every "PLACEHOLDER" below with
 * your actual values. Then require this file from every other
 * PHP script using:  require_once __DIR__ . '/config.php';
 */

/* ── DATABASE CREDENTIALS ──────────────────────────────────── */
define('DB_HOST',     '127.0.0.1'); // e.g. 'localhost' or '127.0.0.1'
define('DB_PORT',     '3306'); // usually '3306' for MySQL
define('DB_NAME',     'agrihibalo_db'); // the MySQL database name, e.g. 'agrihibalo_db'
define('DB_USER',     'root'); // MySQL username, e.g. 'root'
define('DB_PASS',     ''); // MySQL password
define('DB_CHARSET',  'utf8mb4');     // Character set — keep as utf8mb4 for emoji support

/* ── APPLICATION SETTINGS ──────────────────────────────────── */
define('APP_NAME',    'AgriHibalo');
define('APP_URL',     'http://localhost/AgriHibalo'); // Base URL of the site, e.g. 'http://localhost/AgriHibalo'
define('APP_VERSION', '1.0.0');

/* ── POINT MECHANICS ─────────────────────────────────────────
   Mirror these constants in app.js so both sides stay in sync.
─────────────────────────────────────────────────────────────── */
define('NEW_USER_PTS',    50);  // Starting points for every new account
define('BOUNTY_MIN',       5);  // Minimum bounty a question can offer
define('BOUNTY_MAX',      10);  // Maximum bounty a question can offer
define('ANSWER_FLAT_PTS',  3);  // Flat points every answerer earns for participating
define('ASKER_RETURN',     3);  // Points returned to asker when Best Answer is marked

/* ── SESSION & SECURITY ─────────────────────────────────────── */
define('SESSION_LIFETIME', 3600);          // Session lifetime in seconds (1 hour)
define('SECRET_KEY',       'your_secret_key_here'); // Secret key for JWT or CSRF tokens — use a long random string

/* ── ERROR REPORTING (change to 0 in production) ─────────────── */
ini_set('display_errors', 1);
ini_set('display_startup_errors', 1);
error_reporting(E_ALL);

/* ── CORS HEADERS (allow frontend JavaScript to reach the API) ── */
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');              // Restrict to your domain in production
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');

// Handle pre-flight OPTIONS request from browsers
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}
