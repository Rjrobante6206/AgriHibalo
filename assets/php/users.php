<?php
/**
 * AgriHibalo — users.php
 * User profile, leaderboard, admin user management, and badge equipping.
 *
 * ENDPOINTS:
 *   GET  ?action=leaderboard          → Sorted user rankings
 *   GET  ?action=profile&name=...     → A user's public profile data
 *   POST action=equip_badge           → Equip/unequip a display badge (auth required)
 *   POST action=ban                   → Admin: ban/unban a user
 *   POST action=update_pts            → Internal: adjust a user's pts (admin or system only)
 */

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/db.php';

session_start();

$input  = json_decode(file_get_contents('php://input'), true) ?? [];
$action = $input['action'] ?? $_GET['action'] ?? '';

switch ($action) {
    case 'leaderboard':  handleLeaderboard(); break;
    case 'profile':      handleProfile();     break;
    case 'equip_badge':  requireAuth(); handleEquipBadge($input);    break;
    case 'ban':          requireAdmin(); handleBan($input);           break;
    case 'update_pts':   requireAdmin(); handleUpdatePts($input);     break;
    default: jsonError('Unknown action.', 400);
}

/* ── AUTH GUARDS ─────────────────────────────────────────────── */
function requireAuth(): void {
    if (empty($_SESSION['user_id'])) {             // PLACEHOLDER — session key from auth.php
        jsonError('You must be logged in.', 401);
    }
}
function requireAdmin(): void {
    if (($_SESSION['user_role'] ?? '') !== 'admin') { // PLACEHOLDER — session role key
        jsonError('Admin access required.', 403);
    }
}


/* ══════════════════════════════════════════════════════════════
   LEADERBOARD — returns all non-banned users sorted by pts
   Used by:  renderLeaderboard() and renderSidebarLB() in app.js
*/
function handleLeaderboard(): void {
    $pdo = getDB();                                // PLACEHOLDER — requires real DB credentials

    /* SQL: SELECT user data ordered by points descending */
    $stmt = $pdo->prepare('
        SELECT id, full_name, username, role, pts, q_count, a_count, best_ans, banned, active_badge
        FROM users                                  -- PLACEHOLDER table: users
        WHERE banned = 0
        ORDER BY pts DESC
    ');
    $stmt->execute();
    $users = $stmt->fetchAll();

    /* ── Derive initials for each user ── */
    foreach ($users as &$u) {
        $u['init'] = strtoupper(substr(implode('', array_map(
            fn($w) => $w[0] ?? '',
            array_filter(explode(' ', $u['full_name']))
        )), 0, 2)) ?: 'AN';
        $u['pts']     = (int) $u['pts'];
        $u['banned']  = (bool) $u['banned'];
        $u['q_count'] = (int) $u['q_count'];
        $u['a_count'] = (int) $u['a_count'];
        $u['best_ans']= (int) $u['best_ans'];
    }

    jsonResponse(true, $users);
}


/* ══════════════════════════════════════════════════════════════
   PROFILE — fetch a single user's public profile
   GET ?action=profile&name=Juan+dela+Cruz
*/
function handleProfile(): void {
    $name = trim($_GET['name'] ?? '');
    if (!$name) jsonError('User name is required.');

    $pdo = getDB();                                // PLACEHOLDER — requires real DB credentials

    /* SQL: SELECT user by full_name */
    $stmt = $pdo->prepare('
        SELECT id, full_name, username, role, pts, q_count, a_count, best_ans, banned, active_badge
        FROM users WHERE full_name = ? LIMIT 1     -- PLACEHOLDER table: users
    ');
    $stmt->execute([$name]);
    $u = $stmt->fetch();

    if (!$u) jsonError('User not found.', 404);
    if ($u['banned']) jsonError('This account is suspended.', 403);

    $u['init']     = strtoupper(substr(implode('', array_map(fn($w) => $w[0] ?? '', array_filter(explode(' ', $u['full_name'])))), 0, 2)) ?: 'AN';
    $u['pts']      = (int) $u['pts'];
    $u['q_count']  = (int) $u['q_count'];
    $u['a_count']  = (int) $u['a_count'];
    $u['best_ans'] = (int) $u['best_ans'];
    $u['banned']   = (bool) $u['banned'];

    /* ── Attach their questions and answers ── */
    $stmt = $pdo->prepare('
        SELECT id, title, domain, category, votes, bounty, best_ans_id, created_at,
               (SELECT COUNT(*) FROM answers a WHERE a.question_id = q.id) AS answer_count
        FROM questions q                            -- PLACEHOLDER table: questions
        WHERE author_id = ? AND hidden = 0
        ORDER BY created_at DESC
    ');
    $stmt->execute([$u['id']]);
    $u['questions'] = $stmt->fetchAll();           // PLACEHOLDER — questions list for profile

    $stmt = $pdo->prepare('
        SELECT a.id, a.text, a.votes, a.best_answer, a.pts_earned, a.created_at,
               q.title AS question_title, q.id AS question_id
        FROM answers a                              -- PLACEHOLDER table: answers
        JOIN questions q ON q.id = a.question_id   -- PLACEHOLDER table: questions
        WHERE a.author_id = ?
        ORDER BY a.created_at DESC
    ');
    $stmt->execute([$u['id']]);
    $u['answers'] = $stmt->fetchAll();             // PLACEHOLDER — answers list for profile

    jsonResponse(true, $u);
}


/* ══════════════════════════════════════════════════════════════
   EQUIP BADGE — toggle a badge display on the user's profile
   ══════════════════════════════════════════════════════════════
   Expected input:
     { action:'equip_badge', badge_id: 'first_q' }

   Badge eligibility is validated server-side using the same
   rules as the JS BADGES_DEF array.  If badge_id matches the
   user's current active_badge, it is unequipped (set to NULL).
*/
function handleEquipBadge(array $input): void {
    $badge_id = $input['badge_id'] ?? '';
    $uid      = (int) $_SESSION['user_id'];        // PLACEHOLDER — session key

    if (!$badge_id) jsonError('Badge ID is required.');
    $pdo = getDB();                                // PLACEHOLDER — requires real DB credentials

    /* ── Fetch current user data to validate badge eligibility ── */
    $stmt = $pdo->prepare('
        SELECT pts, q_count, a_count, best_ans, active_badge
        FROM users WHERE id = ?                    -- PLACEHOLDER table: users
    ');
    $stmt->execute([$uid]);
    $u = $stmt->fetch();
    if (!$u) jsonError('User not found.', 404);

    /* ── Simple badge eligibility check (mirrors BADGES_DEF in app.js) ──
       Add/adjust checks to match any new badges you introduce.
    ── */
    $eligible = match ($badge_id) {
        'first_q'    => (int) $u['q_count']  >= 1,
        'first_a'    => (int) $u['a_count']  >= 1,
        'sprout'     => (int) $u['pts']       >= 100,
        'planter'    => (int) $u['pts']       >= 200,
        'best_ans'   => (int) $u['best_ans']  >= 1,
        'helpful'    => (int) $u['best_ans']  >= 5,
        'cultivator' => (int) $u['pts']       >= 400,
        'popular'    => false, // Requires checking max votes on a question — PLACEHOLDER: add query if needed
        default      => false,
    };

    if (!$eligible) {
        jsonError('You have not earned this badge yet.', 403);
    }

    /* ── Toggle: unequip if already active, equip if different ── */
    $new_badge = ($u['active_badge'] === $badge_id) ? null : $badge_id;

    /* SQL: UPDATE users SET active_badge = ? WHERE id = ? */
    $pdo->prepare('UPDATE users SET active_badge = ? WHERE id = ?')   // PLACEHOLDER table: users
        ->execute([$new_badge, $uid]);

    jsonResponse(true, [
        'active_badge' => $new_badge,
        'message'      => $new_badge ? "Badge '{$new_badge}' is now displayed." : 'Badge removed from display.',
    ]);
}


/* ══════════════════════════════════════════════════════════════
   BAN — admin toggle a user's banned status
   ══════════════════════════════════════════════════════════════
   Expected input:
     { action:'ban', user_id: 42 }
*/
function handleBan(array $input): void {
    $target_uid = (int) ($input['user_id'] ?? 0);
    if (!$target_uid) jsonError('User ID is required.');

    $pdo = getDB();                                // PLACEHOLDER — requires real DB credentials

    /* SQL: Toggle banned column */
    $pdo->prepare('UPDATE users SET banned = 1 - banned WHERE id = ?')  // PLACEHOLDER table: users
        ->execute([$target_uid]);

    $stmt = $pdo->prepare('SELECT banned, full_name FROM users WHERE id = ?'); // PLACEHOLDER table: users
    $stmt->execute([$target_uid]);
    $u = $stmt->fetch();

    jsonResponse(true, [
        'banned'  => (bool) $u['banned'],
        'message' => $u['banned']
            ? "{$u['full_name']} has been banned."
            : "{$u['full_name']} has been unbanned.",
    ]);
}


/* ══════════════════════════════════════════════════════════════
   UPDATE PTS — admin manually adjust a user's point balance
   ══════════════════════════════════════════════════════════════
   Expected input:
     { action:'update_pts', user_id: 42, delta: -10 }
   delta can be positive (award pts) or negative (deduct pts).
*/
function handleUpdatePts(array $input): void {
    $target_uid = (int) ($input['user_id'] ?? 0);
    $delta      = (int) ($input['delta']   ?? 0);
    if (!$target_uid || $delta === 0) jsonError('User ID and a non-zero delta are required.');

    $pdo = getDB();                                // PLACEHOLDER — requires real DB credentials

    /* SQL: UPDATE users SET pts = pts + delta WHERE id = ? */
    $pdo->prepare('UPDATE users SET pts = pts + ? WHERE id = ?')       // PLACEHOLDER table: users
        ->execute([$delta, $target_uid]);

    $stmt = $pdo->prepare('SELECT pts, full_name FROM users WHERE id = ?'); // PLACEHOLDER table: users
    $stmt->execute([$target_uid]);
    $u = $stmt->fetch();

    jsonResponse(true, [
        'new_pts' => (int) $u['pts'],
        'message' => "{$u['full_name']}'s balance updated to {$u['pts']} pts.",
    ]);
}
