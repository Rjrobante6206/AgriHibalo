<?php
/**
 * AgriHibalo — db.php
 * Creates and returns a PDO database connection.
 * All other PHP scripts should call getDB() instead of
 * creating their own connections.
 *
 * HOW TO USE IN OTHER FILES:
 *   require_once __DIR__ . '/db.php';
 *   $pdo = getDB();
 */

require_once __DIR__ . '/config.php';

/**
 * Returns a singleton PDO instance connected to the MySQL database.
 * The connection is created once per request and reused.
 *
 * @return PDO  Active database connection
 * @throws PDOException if the connection fails
 */
function getDB(): PDO {
    static $pdo = null; // Store connection across calls within the same request

    if ($pdo === null) {
        /* ── DSN (Data Source Name) ──────────────────────────────────
           Replace the PLACEHOLDER constants in config.php with real
           values before connecting to MySQL.
        ─────────────────────────────────────────────────────────── */
        $dsn = sprintf(
            'mysql:host=%s;port=%s;dbname=%s;charset=%s',
            DB_HOST,    // PLACEHOLDER → actual DB host
            DB_PORT,    // PLACEHOLDER → actual DB port (usually 3306)
            DB_NAME,    // PLACEHOLDER → actual DB name
            DB_CHARSET  // utf8mb4 — keep this as-is for emoji support
        );

        $options = [
            PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,  // Throw exceptions on errors
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,        // Return arrays by default
            PDO::ATTR_EMULATE_PREPARES   => false,                   // Use real prepared statements
        ];

        try {
            /* ── DB_USER and DB_PASS are defined in config.php ─────── */
            $pdo = new PDO($dsn, DB_USER, DB_PASS, $options);         // PLACEHOLDER credentials in config.php
        } catch (PDOException $e) {
            // Return a JSON error so the frontend can handle it gracefully
            http_response_code(503);
            echo json_encode([
                'success' => false,
                'error'   => 'Database connection failed. Please check config.php.',
                // Remove the next line in production — do not expose the real error message
                'debug'   => $e->getMessage(),
            ]);
            exit();
        }
    }

    return $pdo;
}

/**
 * Helper: send a JSON response and exit.
 *
 * @param  bool   $success
 * @param  mixed  $data     Any data to include in the response
 * @param  int    $code     HTTP status code
 */
function jsonResponse(bool $success, mixed $data = null, int $code = 200): void {
    http_response_code($code);
    echo json_encode([
        'success' => $success,
        'data'    => $data,
    ]);
    exit();
}

/**
 * Helper: send an error JSON response and exit.
 *
 * @param  string $message  Human-readable error
 * @param  int    $code     HTTP status code (default 400)
 */
function jsonError(string $message, int $code = 400): void {
    http_response_code($code);
    echo json_encode([
        'success' => false,
        'error'   => $message,
    ]);
    exit();
}
