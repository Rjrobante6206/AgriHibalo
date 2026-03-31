<?php
/**
 * AgriHibalo — auth.php
 * Handles user registration, login, and logout.
 *
 * ENDPOINTS (POST with JSON body):
 *   action=register  → Create a new user account
 *   action=login     → Authenticate an existing user
 *   action=logout    → Destroy the session
 *   action=me        → Return the currently logged-in user's data
 *
 * FRONTEND USAGE (in app.js, replace fetch calls):
 *   fetch('assets/php/auth.php', {
 *       method: 'POST',
 *       headers: { 'Content-Type': 'application/json' },
 *       body: JSON.stringify({ action: 'login', username: '...', password: '...' })
 *   }).then(r => r.json()).then(data => { ... });
 */

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/db.php';

/* ── SESSION SETUP ─────────────────────────────────────────── */
// Sessions are used to keep the user logged in across page loads.
// SESSION_LIFETIME is defined in config.php (default: 3600 seconds = 1 hour)
ini_set('session.gc_maxlifetime', SESSION_LIFETIME);
session_set_cookie_params(SESSION_LIFETIME);
session_start();

/* ── ROUTE REQUEST ─────────────────────────────────────────── */
$input  = json_decode(file_get_contents('php://input'), true) ?? [];
$action = $input['action'] ?? $_GET['action'] ?? '';

switch ($action) {
    case 'register': handleRegister($input); break;
    case 'login':    handleLogin($input);    break;
    case 'logout':   handleLogout();         break;
    case 'me':       handleMe();             break;
    default:         jsonError('Unknown action.', 400);
}


/* ══════════════════════════════════════════════════════════════
   REGISTER
   ══════════════════════════════════════════════════════════════
   Expected input:
     { action: 'register', full_name: '...', username: '...', password: '...', role: 'student'|'farmer' }

   Database table needed (add to your schema):
     CREATE TABLE users (
         id          INT AUTO_INCREMENT PRIMARY KEY,
         full_name   VARCHAR(100)  NOT NULL,
         username    VARCHAR(60)   NOT NULL UNIQUE,
         password    VARCHAR(255)  NOT NULL,  -- bcrypt hash, never plaintext
         role        ENUM('student','farmer','admin') DEFAULT 'student',
         pts         INT           DEFAULT 50, -- NEW_USER_PTS from config.php
         q_count     INT           DEFAULT 0,
         a_count     INT           DEFAULT 0,
         best_ans    INT           DEFAULT 0,
         banned      TINYINT(1)    DEFAULT 0,
         active_badge VARCHAR(60)  DEFAULT NULL,
         created_at  DATETIME      DEFAULT CURRENT_TIMESTAMP
     );
*/
function handleRegister(array $input): void {
    /* ── Validate input ── */
    $full_name = trim($input['full_name'] ?? '');
    $username  = trim($input['username']  ?? '');
    $password  = $input['password']  ?? '';
    $role      = $input['role']      ?? 'student';

    if (!$full_name || !$username || !$password) {
        jsonError('All fields are required.');
    }
    if (strlen($full_name) < 2) jsonError('Full name must be at least 2 characters.');
    if (strlen($username)  < 3) jsonError('Username must be at least 3 characters.');
    if (strlen($password)  < 6) jsonError('Password must be at least 6 characters.');
    if (!in_array($role, ['student', 'farmer'])) $role = 'student';

    $pdo = getDB(); // PLACEHOLDER — requires real DB credentials in config.php

    /* ── Check for duplicate username ── */
    /* SQL: SELECT id FROM users WHERE username = ? LIMIT 1 */
    $stmt = $pdo->prepare('SELECT id FROM users WHERE username = ? LIMIT 1'); // PLACEHOLDER table: users
    $stmt->execute([$username]);
    if ($stmt->fetch()) {
        jsonError('Username is already taken. Please choose another.');
    }

    /* ── Hash the password before storing ── */
    $hashed = password_hash($password, PASSWORD_BCRYPT);

    /* ── Derive initials from the full name (e.g. "Juan Cruz" → "JC") ── */
    $initials = strtoupper(implode('', array_map(
        fn($w) => $w[0] ?? '',
        array_filter(explode(' ', $full_name))
    )));
    $initials = substr($initials, 0, 2) ?: 'AN';

    /* ── Insert new user ── */
    // NEW_USER_PTS (50) is defined in config.php
    /* SQL: INSERT INTO users (full_name, username, password, role, pts, ...) VALUES (?, ?, ?, ?, ?, ...) */
    $stmt = $pdo->prepare(
        'INSERT INTO users (full_name, username, password, role, pts, q_count, a_count, best_ans, banned)
         VALUES (?, ?, ?, ?, ?, 0, 0, 0, 0)'                          // PLACEHOLDER table: users
    );
    $stmt->execute([$full_name, $username, $hashed, $role, NEW_USER_PTS]);
    $new_id = (int) $pdo->lastInsertId();

    /* ── Start session ── */
    $_SESSION['user_id']   = $new_id;           // PLACEHOLDER — session key for user id
    $_SESSION['user_name'] = $full_name;         // PLACEHOLDER — session key for full name
    $_SESSION['user_role'] = $role;              // PLACEHOLDER — session key for role

    jsonResponse(true, [
        'id'       => $new_id,
        'name'     => $full_name,
        'init'     => $initials,
        'username' => $username,
        'role'     => $role,
        'pts'      => NEW_USER_PTS,
        'q_count'  => 0,
        'a_count'  => 0,
        'best_ans' => 0,
        'banned'   => false,
    ], 201);
}


/* ══════════════════════════════════════════════════════════════
   LOGIN
   ══════════════════════════════════════════════════════════════
   Expected input:
     { action: 'login', username: '...', password: '...' }
*/
function handleLogin(array $input): void {
    $username = trim($input['username'] ?? '');
    $password = $input['password'] ?? '';

    if (!$username || !$password) {
        jsonError('Please fill in all fields.');
    }

    /* ── Admin shortcut ── */
    // Admin credentials are defined in config.php as constants (PLACEHOLDER).
    // For now the check is hardcoded to match the JS demo.
    if ($username === 'admin' && $password === 'admin123') { // PLACEHOLDER — replace with a real admin account in the DB
        $_SESSION['user_id']   = 0;             // PLACEHOLDER — admin session user id
        $_SESSION['user_name'] = 'Administrator';
        $_SESSION['user_role'] = 'admin';        // PLACEHOLDER — role value for admin
        jsonResponse(true, [
            'id'      => 0,
            'name'    => 'Administrator',
            'init'    => 'AD',
            'role'    => 'admin',
            'pts'     => 0,
            'q_count' => 0,
            'a_count' => 0,
            'best_ans'=> 0,
            'banned'  => false,
        ]);
        return;
    }

    $pdo = getDB(); // PLACEHOLDER — requires real DB credentials in config.php

    /* ── Fetch user by username ── */
    /* SQL: SELECT * FROM users WHERE username = ? LIMIT 1 */
    $stmt = $pdo->prepare(
        'SELECT id, full_name, username, password, role, pts, q_count, a_count, best_ans, banned
         FROM users WHERE username = ? LIMIT 1'                        // PLACEHOLDER table: users
    );
    $stmt->execute([$username]);
    $user = $stmt->fetch();

    if (!$user) {
        jsonError('No account found. Please register first.', 401);
    }

    /* ── Verify password hash ── */
    if (!password_verify($password, $user['password'])) {              // PLACEHOLDER — password column name
        jsonError('Incorrect password.', 401);
    }

    if ((int) $user['banned']) {
        jsonError('This account has been suspended. Contact the administrator.', 403);
    }

    /* ── Derive initials ── */
    $initials = strtoupper(implode('', array_map(
        fn($w) => $w[0] ?? '',
        array_filter(explode(' ', $user['full_name']))
    )));
    $initials = substr($initials, 0, 2) ?: 'AN';

    /* ── Start session ── */
    $_SESSION['user_id']   = $user['id'];        // PLACEHOLDER — session key for user id
    $_SESSION['user_name'] = $user['full_name']; // PLACEHOLDER — session key for full name
    $_SESSION['user_role'] = $user['role'];       // PLACEHOLDER — session key for role

    jsonResponse(true, [
        'id'       => $user['id'],
        'name'     => $user['full_name'],
        'init'     => $initials,
        'username' => $user['username'],
        'role'     => $user['role'],
        'pts'      => (int) $user['pts'],
        'q_count'  => (int) $user['q_count'],
        'a_count'  => (int) $user['a_count'],
        'best_ans' => (int) $user['best_ans'],
        'banned'   => (bool) $user['banned'],
    ]);
}


/* ══════════════════════════════════════════════════════════════
   LOGOUT — destroys the session
*/
function handleLogout(): void {
    session_unset();
    session_destroy();
    jsonResponse(true, ['message' => 'Logged out successfully.']);
}


/* ══════════════════════════════════════════════════════════════
   ME — return the currently logged-in user from session
*/
function handleMe(): void {
    if (empty($_SESSION['user_id'])) {             // PLACEHOLDER — checks session key from login
        jsonResponse(false, null, 401);
        return;
    }

    $pdo  = getDB();                               // PLACEHOLDER — requires real DB credentials
    /* SQL: SELECT * FROM users WHERE id = ? LIMIT 1 */
    $stmt = $pdo->prepare(
        'SELECT id, full_name, username, role, pts, q_count, a_count, best_ans, banned, active_badge
         FROM users WHERE id = ? LIMIT 1'          // PLACEHOLDER table: users
    );
    $stmt->execute([$_SESSION['user_id']]);        // PLACEHOLDER — session key user_id
    $user = $stmt->fetch();

    if (!$user) {
        session_destroy();
        jsonError('Session expired. Please log in again.', 401);
    }

    $initials = strtoupper(implode('', array_map(
        fn($w) => $w[0] ?? '',
        array_filter(explode(' ', $user['full_name']))
    )));

    jsonResponse(true, [
        'id'          => $user['id'],
        'name'        => $user['full_name'],
        'init'        => substr($initials, 0, 2) ?: 'AN',
        'username'    => $user['username'],
        'role'        => $user['role'],
        'pts'         => (int) $user['pts'],
        'q_count'     => (int) $user['q_count'],
        'a_count'     => (int) $user['a_count'],
        'best_ans'    => (int) $user['best_ans'],
        'banned'      => (bool) $user['banned'],
        'active_badge'=> $user['active_badge'],
    ]);
}
