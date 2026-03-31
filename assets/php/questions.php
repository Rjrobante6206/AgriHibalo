<?php
/**
 * AgriHibalo — questions.php
 * CRUD operations for questions (the Q&A feed).
 *
 * ENDPOINTS:
 *   GET  ?action=list              → Fetch all (optionally filtered) questions
 *   GET  ?action=get&id=123        → Fetch a single question with its answers
 *   POST action=post               → Post a new question (auth required)
 *   POST action=vote               → Vote on a question (auth required)
 *   POST action=delete             → Admin: delete a question
 *   POST action=toggle_hide        → Admin: hide/show a question
 *   POST action=report             → Report a question (auth required)
 *   POST action=clear_report       → Admin: clear a question report
 *
 * Database tables needed:
 *   questions (id, title, body, domain, category, tags, image_url, author_id,
 *              bounty, votes, best_ans_id, reported, hidden, created_at)
 *   question_votes (question_id, user_id, direction)  — tracks who voted which way
 */

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/db.php';

session_start();

$method = $_SERVER['REQUEST_METHOD'];
$input  = json_decode(file_get_contents('php://input'), true) ?? [];
$action = $input['action'] ?? $_GET['action'] ?? '';

switch ($action) {
    case 'list':         handleList();                  break;
    case 'get':          handleGet();                   break;
    case 'post':         requireAuth(); handlePost($input);          break;
    case 'vote':         requireAuth(); handleVote($input);          break;
    case 'delete':       requireAdmin(); handleDelete($input);       break;
    case 'toggle_hide':  requireAdmin(); handleToggleHide($input);   break;
    case 'report':       requireAuth(); handleReport($input);        break;
    case 'clear_report': requireAdmin(); handleClearReport($input);  break;
    default:             jsonError('Unknown action.', 400);
}


/* ── AUTH GUARDS ─────────────────────────────────────────────── */
function requireAuth(): void {
    if (empty($_SESSION['user_id'])) {             // PLACEHOLDER — session key from auth.php
        jsonError('You must be logged in.', 401);
    }
}
function requireAdmin(): void {
    if (($_SESSION['user_role'] ?? '') !== 'admin') { // PLACEHOLDER — session role key from auth.php
        jsonError('Admin access required.', 403);
    }
}


/* ══════════════════════════════════════════════════════════════
   LIST — returns questions filtered by domain, topic, sort
   ══════════════════════════════════════════════════════════════
   GET params:
     domain  = all | farm | animal
     sort    = newest | votes | unanswered
     topic   = (any topic pill string)
     search  = (search keyword)
*/
function handleList(): void {
    $pdo    = getDB();             // PLACEHOLDER — requires real DB credentials
    $domain = $_GET['domain'] ?? 'all';
    $sort   = $_GET['sort']   ?? 'newest';
    $search = trim($_GET['search'] ?? '');

    /* ── Base query ── */
    /* SQL selects all visible questions with answer count and author name */
    $sql = '
        SELECT q.id, q.title, q.body, q.domain, q.category, q.tags,
               q.image_url, q.bounty, q.votes, q.reported, q.hidden,
               q.best_ans_id, q.created_at,
               u.full_name AS author, u.role AS author_role,
               (SELECT COUNT(*) FROM answers a WHERE a.question_id = q.id) AS answer_count
        FROM questions q                              -- PLACEHOLDER table: questions
        JOIN users u ON u.id = q.author_id           -- PLACEHOLDER table: users
        WHERE q.hidden = 0
    ';

    $params = [];

    /* ── Domain filter ── */
    if ($domain !== 'all') {
        $sql .= ' AND q.domain = ?';                 // PLACEHOLDER column: domain
        $params[] = $domain;
    }

    /* ── Search filter ── */
    if ($search) {
        $sql .= ' AND (q.title LIKE ? OR q.body LIKE ? OR q.tags LIKE ?)';
        $like = "%$search%";
        $params[] = $like; $params[] = $like; $params[] = $like;
    }

    /* ── Unanswered filter ── */
    if ($sort === 'unanswered') {
        $sql .= ' HAVING answer_count = 0';
    }

    /* ── Sort order ── */
    if ($sort === 'votes') {
        $sql .= ' ORDER BY q.votes DESC';            // PLACEHOLDER column: votes
    } else {
        $sql .= ' ORDER BY q.created_at DESC';       // PLACEHOLDER column: created_at
    }

    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    $rows = $stmt->fetchAll();

    /* ── Decode JSON tags stored as a string in the DB ── */
    foreach ($rows as &$row) {
        $row['tags'] = json_decode($row['tags'] ?? '[]', true) ?? [];  // PLACEHOLDER column: tags (stored as JSON string)
    }

    jsonResponse(true, $rows);
}


/* ══════════════════════════════════════════════════════════════
   GET — returns a single question with all its answers
*/
function handleGet(): void {
    $id = (int) ($_GET['id'] ?? 0);
    if (!$id) jsonError('Question ID is required.');

    $pdo = getDB();                                // PLACEHOLDER — requires real DB credentials

    /* ── Fetch question ── */
    /* SQL: SELECT question with author info */
    $stmt = $pdo->prepare('
        SELECT q.id, q.title, q.body, q.domain, q.category, q.tags,
               q.image_url, q.bounty, q.votes, q.reported, q.hidden,
               q.best_ans_id, q.pts_distributed, q.created_at,
               u.full_name AS author, u.role AS author_role
        FROM questions q                            -- PLACEHOLDER table: questions
        JOIN users u ON u.id = q.author_id          -- PLACEHOLDER table: users
        WHERE q.id = ?
    ');
    $stmt->execute([$id]);
    $q = $stmt->fetch();

    if (!$q) jsonError('Question not found.', 404);
    $q['tags'] = json_decode($q['tags'] ?? '[]', true) ?? [];         // PLACEHOLDER column: tags

    /* ── Fetch all answers for this question ── */
    /* SQL: SELECT answers with author info */
    $stmt = $pdo->prepare('
        SELECT a.id, a.text, a.votes, a.best_answer, a.pts_earned,
               a.reported_by, a.report_reason, a.report_status, a.created_at,
               u.full_name AS author, u.role AS author_role
        FROM answers a                              -- PLACEHOLDER table: answers
        JOIN users u ON u.id = a.author_id          -- PLACEHOLDER table: users
        WHERE a.question_id = ?
        ORDER BY a.best_answer DESC, a.votes DESC, a.created_at ASC
    ');
    $stmt->execute([$id]);
    $q['answers'] = $stmt->fetchAll();

    jsonResponse(true, $q);
}


/* ══════════════════════════════════════════════════════════════
   POST — submit a new question (deducts bounty from user balance)
   ══════════════════════════════════════════════════════════════
   Expected input:
     { action:'post', title, body, domain, category, tags:[], bounty, image_url? }

   Database table (questions):
     id, title, body, domain, category, tags (JSON), image_url, author_id,
     bounty, pts, pts_distributed, votes, reported, hidden, best_ans_id, created_at
*/
function handlePost(array $input): void {
    $title    = trim($input['title']    ?? '');
    $body     = trim($input['body']     ?? '');
    $domain   = $input['domain']   ?? 'farm';
    $category = $input['category'] ?? 'General';
    $tags     = $input['tags']     ?? [];
    $bounty   = max(BOUNTY_MIN, min(BOUNTY_MAX, (int) ($input['bounty'] ?? BOUNTY_MIN)));
    $img_url  = $input['image_url'] ?? null;      // PLACEHOLDER — handle image upload separately via upload.php

    if (!$title) jsonError('Question title is required.');
    if (!$body)  jsonError('Question body is required.');

    $user_id = $_SESSION['user_id'];               // PLACEHOLDER — session key from auth.php
    $pdo     = getDB();                            // PLACEHOLDER — requires real DB credentials

    /* ── Check user balance ── */
    /* SQL: SELECT pts FROM users WHERE id = ? */
    $stmt = $pdo->prepare('SELECT pts FROM users WHERE id = ?');       // PLACEHOLDER table: users
    $stmt->execute([$user_id]);
    $user = $stmt->fetch();
    if (!$user || (int) $user['pts'] < $bounty) {
        jsonError("Not enough points. You need {$bounty} pts to post this question.");
    }

    /* ── Deduct bounty from user's balance ── */
    /* SQL: UPDATE users SET pts = pts - bounty WHERE id = user_id */
    $pdo->prepare('UPDATE users SET pts = pts - ? WHERE id = ?')       // PLACEHOLDER table: users
        ->execute([$bounty, $user_id]);

    /* ── Insert the question ── */
    /* SQL: INSERT INTO questions ... */
    $stmt = $pdo->prepare('
        INSERT INTO questions (title, body, domain, category, tags, image_url, author_id, bounty, pts, pts_distributed, votes, reported, hidden)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, 0)               -- PLACEHOLDER table: questions
    ');
    $stmt->execute([
        $title,
        $body,
        in_array($domain, ['farm','animal']) ? $domain : 'farm',
        $category,
        json_encode(array_slice($tags, 0, 5)),                         // PLACEHOLDER column: tags — stored as JSON
        $img_url,
        $user_id,
        $bounty,
        $bounty,
    ]);
    $new_id = (int) $pdo->lastInsertId();

    /* ── Increment q_count on the user ── */
    $pdo->prepare('UPDATE users SET q_count = q_count + 1 WHERE id = ?') // PLACEHOLDER table: users
        ->execute([$user_id]);

    jsonResponse(true, ['id' => $new_id, 'pts_deducted' => $bounty], 201);
}


/* ══════════════════════════════════════════════════════════════
   VOTE — upvote or downvote a question
   ══════════════════════════════════════════════════════════════
   Expected input:
     { action:'vote', question_id: 123, direction: 1 | -1 }

   question_votes table:
     question_id, user_id, direction  (UNIQUE KEY on question_id + user_id)
*/
function handleVote(array $input): void {
    $qid  = (int) ($input['question_id'] ?? 0);
    $dir  = (int) ($input['direction']   ?? 1);
    $dir  = $dir >= 0 ? 1 : -1;  // Normalise to +1 or -1
    $uid  = (int) $_SESSION['user_id'];             // PLACEHOLDER — session key

    if (!$qid) jsonError('Question ID is required.');
    $pdo = getDB();                                 // PLACEHOLDER — requires real DB credentials

    /* ── Check existing vote ── */
    /* SQL: SELECT direction FROM question_votes WHERE question_id = ? AND user_id = ? */
    $stmt = $pdo->prepare(
        'SELECT direction FROM question_votes WHERE question_id = ? AND user_id = ?'  // PLACEHOLDER table: question_votes
    );
    $stmt->execute([$qid, $uid]);
    $existing = $stmt->fetch();

    if ($existing) {
        if ((int) $existing['direction'] === $dir) {
            /* ── Toggle off: remove the vote ── */
            $pdo->prepare('DELETE FROM question_votes WHERE question_id = ? AND user_id = ?') // PLACEHOLDER table: question_votes
                ->execute([$qid, $uid]);
            $pdo->prepare('UPDATE questions SET votes = votes - ? WHERE id = ?')              // PLACEHOLDER table: questions
                ->execute([$dir, $qid]);
            $new_dir = 0;
        } else {
            /* ── Switch direction: update existing vote ── */
            $pdo->prepare('UPDATE question_votes SET direction = ? WHERE question_id = ? AND user_id = ?') // PLACEHOLDER table: question_votes
                ->execute([$dir, $qid, $uid]);
            $pdo->prepare('UPDATE questions SET votes = votes + ? WHERE id = ?')              // PLACEHOLDER table: questions
                ->execute([$dir * 2, $qid]); // ×2 because we're reversing
            $new_dir = $dir;
        }
    } else {
        /* ── New vote ── */
        $pdo->prepare('INSERT INTO question_votes (question_id, user_id, direction) VALUES (?,?,?)') // PLACEHOLDER table: question_votes
            ->execute([$qid, $uid, $dir]);
        $pdo->prepare('UPDATE questions SET votes = votes + ? WHERE id = ?')                 // PLACEHOLDER table: questions
            ->execute([$dir, $qid]);
        $new_dir = $dir;
    }

    /* ── Return updated vote count ── */
    $stmt = $pdo->prepare('SELECT votes FROM questions WHERE id = ?');  // PLACEHOLDER table: questions
    $stmt->execute([$qid]);
    $q = $stmt->fetch();

    jsonResponse(true, ['votes' => (int) $q['votes'], 'your_vote' => $new_dir]);
}


/* ══════════════════════════════════════════════════════════════
   DELETE — admin removes a question permanently
*/
function handleDelete(array $input): void {
    $id  = (int) ($input['id'] ?? 0);
    if (!$id) jsonError('Question ID is required.');
    $pdo = getDB();                                // PLACEHOLDER — requires real DB credentials

    /* SQL: DELETE FROM questions WHERE id = ? */
    $pdo->prepare('DELETE FROM questions WHERE id = ?')                // PLACEHOLDER table: questions
        ->execute([$id]);
    jsonResponse(true, ['message' => 'Question deleted.']);
}


/* ── TOGGLE HIDE (admin) ─────────────────────────────────────── */
function handleToggleHide(array $input): void {
    $id  = (int) ($input['id'] ?? 0);
    if (!$id) jsonError('Question ID is required.');
    $pdo = getDB();                                // PLACEHOLDER — requires real DB credentials

    /* SQL: UPDATE questions SET hidden = 1 - hidden WHERE id = ? */
    $pdo->prepare('UPDATE questions SET hidden = 1 - hidden WHERE id = ?')  // PLACEHOLDER table: questions
        ->execute([$id]);
    $stmt = $pdo->prepare('SELECT hidden FROM questions WHERE id = ?');     // PLACEHOLDER table: questions
    $stmt->execute([$id]);
    $q = $stmt->fetch();

    jsonResponse(true, ['hidden' => (bool) $q['hidden']]);
}


/* ── REPORT ─────────────────────────────────────────────────── */
function handleReport(array $input): void {
    $id     = (int) ($input['id'] ?? 0);
    $reason = trim($input['reason'] ?? '');
    $uid    = (int) $_SESSION['user_id'];          // PLACEHOLDER — session key

    if (!$id || !$reason) jsonError('ID and reason are required.');
    $pdo = getDB();                                // PLACEHOLDER — requires real DB credentials

    /* SQL: Mark question as reported */
    $pdo->prepare('UPDATE questions SET reported = 1 WHERE id = ?')    // PLACEHOLDER table: questions
        ->execute([$id]);

    /* SQL: INSERT report record into reports table */
    /* reports table: id, item_id, item_type, reason, reporter_id, resolved, created_at */
    $pdo->prepare(
        'INSERT INTO reports (item_id, item_type, reason, reporter_id)
         VALUES (?, "question", ?, ?)'                                  // PLACEHOLDER table: reports
    )->execute([$id, $reason, $uid]);

    jsonResponse(true, ['message' => 'Report submitted.']);
}


/* ── CLEAR REPORT (admin) ────────────────────────────────────── */
function handleClearReport(array $input): void {
    $id  = (int) ($input['id'] ?? 0);
    if (!$id) jsonError('Question ID is required.');
    $pdo = getDB();                                // PLACEHOLDER — requires real DB credentials

    /* SQL: Clear report flag on question */
    $pdo->prepare('UPDATE questions SET reported = 0 WHERE id = ?')    // PLACEHOLDER table: questions
        ->execute([$id]);
    /* SQL: Mark all open reports for this question as resolved */
    $pdo->prepare(
        'UPDATE reports SET resolved = 1 WHERE item_id = ? AND item_type = "question"' // PLACEHOLDER table: reports
    )->execute([$id]);

    jsonResponse(true, ['message' => 'Report cleared.']);
}
