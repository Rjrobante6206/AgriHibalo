<?php
/**
 * AgriHibalo — answers.php
 * Handles posting answers, voting on answers, marking Best Answer,
 * and the answer report system.
 *
 * ENDPOINTS:
 *   POST action=post         → Post a new answer (auth required)
 *   POST action=vote         → Vote on an answer (auth required)
 *   POST action=mark_best    → Mark an answer as Best (question author only)
 *   POST action=report       → Report an answer (question author only)
 *   POST action=resolve_report → Admin: approve or dismiss an answer report
 *
 * Database tables needed:
 *   answers        (id, question_id, author_id, text, votes, best_answer,
 *                   pts_earned, reported_by, report_reason, report_status, created_at)
 *   answer_votes   (answer_id, user_id, direction)
 *   answer_reports (id, question_id, answer_id, reporter_id, reason,
 *                   pts_at_risk, status, created_at)
 */

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/db.php';

session_start();

$input  = json_decode(file_get_contents('php://input'), true) ?? [];
$action = $input['action'] ?? $_GET['action'] ?? '';

switch ($action) {
    case 'post':           requireAuth(); handlePost($input);          break;
    case 'vote':           requireAuth(); handleVote($input);          break;
    case 'mark_best':      requireAuth(); handleMarkBest($input);      break;
    case 'report':         requireAuth(); handleReport($input);        break;
    case 'resolve_report': requireAdmin(); handleResolveReport($input); break;
    default: jsonError('Unknown action.', 400);
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
   POST — submit a new answer
   ══════════════════════════════════════════════════════════════
   Expected input:
     { action:'post', question_id: 123, text: '...' }

   Points awarded:
     - ANSWER_FLAT_PTS (defined in config.php) is immediately credited
       to the answerer for participating.
     - The full bounty is paid out when the asker marks Best Answer.
*/
function handlePost(array $input): void {
    $qid  = (int) ($input['question_id'] ?? 0);
    $text = trim($input['text'] ?? '');
    $uid  = (int) $_SESSION['user_id'];            // PLACEHOLDER — session key

    if (!$qid || !$text) jsonError('Question ID and answer text are required.');
    if (strlen($text) < 10) jsonError('Answer is too short. Please provide more detail.');

    $pdo = getDB();                                // PLACEHOLDER — requires real DB credentials

    /* ── Verify question exists and is not hidden ── */
    /* SQL: SELECT id, author_id FROM questions WHERE id = ? AND hidden = 0 */
    $stmt = $pdo->prepare('SELECT id, author_id FROM questions WHERE id = ? AND hidden = 0'); // PLACEHOLDER table: questions
    $stmt->execute([$qid]);
    $q = $stmt->fetch();
    if (!$q) jsonError('Question not found or is no longer available.', 404);

    /* ── Prevent answering your own question ── */
    if ((int) $q['author_id'] === $uid) {
        jsonError('You cannot answer your own question.');
    }

    /* ── Insert the answer ── */
    /* SQL: INSERT INTO answers ... */
    $stmt = $pdo->prepare('
        INSERT INTO answers (question_id, author_id, text, votes, best_answer, pts_earned)
        VALUES (?, ?, ?, 0, 0, ?)                  -- PLACEHOLDER table: answers
    ');
    $stmt->execute([$qid, $uid, $text, ANSWER_FLAT_PTS]);
    $new_id = (int) $pdo->lastInsertId();

    /* ── Award ANSWER_FLAT_PTS to the answerer immediately ── */
    /* SQL: UPDATE users SET pts = pts + ANSWER_FLAT_PTS, a_count = a_count + 1 WHERE id = uid */
    $pdo->prepare('UPDATE users SET pts = pts + ?, a_count = a_count + 1 WHERE id = ?')  // PLACEHOLDER table: users
        ->execute([ANSWER_FLAT_PTS, $uid]);

    jsonResponse(true, [
        'id'        => $new_id,
        'pts_earned'=> ANSWER_FLAT_PTS,
        'message'   => 'Answer posted! +' . ANSWER_FLAT_PTS . ' pts awarded.',
    ], 201);
}


/* ══════════════════════════════════════════════════════════════
   VOTE — upvote an answer
   ══════════════════════════════════════════════════════════════
   Expected input:
     { action:'vote', answer_id: 456, direction: 1 | -1 }
*/
function handleVote(array $input): void {
    $aid = (int) ($input['answer_id']  ?? 0);
    $dir = (int) ($input['direction']  ?? 1);
    $dir = $dir >= 0 ? 1 : -1;
    $uid = (int) $_SESSION['user_id'];             // PLACEHOLDER — session key

    if (!$aid) jsonError('Answer ID is required.');
    $pdo = getDB();                                // PLACEHOLDER — requires real DB credentials

    /* ── Check existing vote ── */
    /* SQL: SELECT direction FROM answer_votes WHERE answer_id = ? AND user_id = ? */
    $stmt = $pdo->prepare(
        'SELECT direction FROM answer_votes WHERE answer_id = ? AND user_id = ?'  // PLACEHOLDER table: answer_votes
    );
    $stmt->execute([$aid, $uid]);
    $existing = $stmt->fetch();

    if ($existing) {
        if ((int) $existing['direction'] === $dir) {
            /* ── Toggle off ── */
            $pdo->prepare('DELETE FROM answer_votes WHERE answer_id = ? AND user_id = ?') // PLACEHOLDER table: answer_votes
                ->execute([$aid, $uid]);
            $pdo->prepare('UPDATE answers SET votes = votes - ? WHERE id = ?')             // PLACEHOLDER table: answers
                ->execute([$dir, $aid]);
        } else {
            /* ── Switch direction ── */
            $pdo->prepare('UPDATE answer_votes SET direction = ? WHERE answer_id = ? AND user_id = ?') // PLACEHOLDER table: answer_votes
                ->execute([$dir, $aid, $uid]);
            $pdo->prepare('UPDATE answers SET votes = votes + ? WHERE id = ?')             // PLACEHOLDER table: answers
                ->execute([$dir * 2, $aid]);
        }
    } else {
        /* ── New vote ── */
        $pdo->prepare('INSERT INTO answer_votes (answer_id, user_id, direction) VALUES (?,?,?)') // PLACEHOLDER table: answer_votes
            ->execute([$aid, $uid, $dir]);
        $pdo->prepare('UPDATE answers SET votes = votes + ? WHERE id = ?')                  // PLACEHOLDER table: answers
            ->execute([$dir, $aid]);
    }

    $stmt = $pdo->prepare('SELECT votes FROM answers WHERE id = ?');   // PLACEHOLDER table: answers
    $stmt->execute([$aid]);
    $a = $stmt->fetch();
    jsonResponse(true, ['votes' => (int) $a['votes']]);
}


/* ══════════════════════════════════════════════════════════════
   MARK BEST ANSWER
   ══════════════════════════════════════════════════════════════
   Expected input:
     { action:'mark_best', question_id: 123, answer_id: 456 }

   Point distribution:
     - Answerer earns the full bounty (q.bounty)
     - Asker earns ASKER_RETURN pts back for closing the question
     - Both defined in config.php
*/
function handleMarkBest(array $input): void {
    $qid  = (int) ($input['question_id'] ?? 0);
    $aid  = (int) ($input['answer_id']   ?? 0);
    $uid  = (int) $_SESSION['user_id'];            // PLACEHOLDER — session key

    if (!$qid || !$aid) jsonError('Question ID and Answer ID are required.');
    $pdo = getDB();                                // PLACEHOLDER — requires real DB credentials

    /* ── Fetch question, verify ownership and no existing Best Answer ── */
    /* SQL: SELECT id, author_id, bounty, best_ans_id FROM questions WHERE id = ? */
    $stmt = $pdo->prepare(
        'SELECT id, author_id, bounty, best_ans_id FROM questions WHERE id = ?'  // PLACEHOLDER table: questions
    );
    $stmt->execute([$qid]);
    $q = $stmt->fetch();

    if (!$q) jsonError('Question not found.', 404);
    if ((int) $q['author_id'] !== $uid) jsonError('Only the question author can mark Best Answer.', 403);
    if ($q['best_ans_id'])              jsonError('Best Answer is already marked.');

    /* ── Fetch answer and its author ── */
    /* SQL: SELECT id, author_id, pts_earned FROM answers WHERE id = ? AND question_id = ? */
    $stmt = $pdo->prepare(
        'SELECT id, author_id, pts_earned FROM answers WHERE id = ? AND question_id = ?'  // PLACEHOLDER table: answers
    );
    $stmt->execute([$aid, $qid]);
    $a = $stmt->fetch();
    if (!$a) jsonError('Answer not found.', 404);

    $bounty = (int) $q['bounty'];

    /* ── Mark Best Answer ── */
    /* SQL: UPDATE answers SET best_answer = 1, pts_earned = pts_earned + bounty WHERE id = ? */
    $pdo->prepare('UPDATE answers SET best_answer = 1, pts_earned = pts_earned + ? WHERE id = ?')  // PLACEHOLDER table: answers
        ->execute([$bounty, $aid]);

    /* ── Update question: record Best Answer ID ── */
    /* SQL: UPDATE questions SET best_ans_id = ?, pts_distributed = pts_distributed + bounty WHERE id = ? */
    $pdo->prepare(
        'UPDATE questions SET best_ans_id = ?, pts_distributed = pts_distributed + ? WHERE id = ?' // PLACEHOLDER table: questions
    )->execute([$aid, $bounty, $qid]);

    /* ── Pay the bounty to the answerer ── */
    /* SQL: UPDATE users SET pts = pts + bounty, best_ans = best_ans + 1 WHERE id = answerer_id */
    $pdo->prepare('UPDATE users SET pts = pts + ?, best_ans = best_ans + 1 WHERE id = ?')  // PLACEHOLDER table: users
        ->execute([$bounty, $a['author_id']]);

    /* ── Give ASKER_RETURN pts back to the asker ── */
    /* SQL: UPDATE users SET pts = pts + ASKER_RETURN WHERE id = asker_id */
    $pdo->prepare('UPDATE users SET pts = pts + ? WHERE id = ?')                           // PLACEHOLDER table: users
        ->execute([ASKER_RETURN, $uid]);

    jsonResponse(true, [
        'bounty_paid'  => $bounty,
        'asker_return' => ASKER_RETURN,
        'message'      => "Best Answer marked! Answerer earns +{$bounty} pts. You get back +" . ASKER_RETURN . ' pts.',
    ]);
}


/* ══════════════════════════════════════════════════════════════
   REPORT ANSWER — question author reports a bad answer
   ══════════════════════════════════════════════════════════════
   Expected input:
     { action:'report', question_id: 123, answer_id: 456, reason: '...' }

   NOTE: No points are deducted yet. Admin reviews the report first.
         Points are only deducted when admin calls resolve_report with action='approve'.
*/
function handleReport(array $input): void {
    $qid    = (int) ($input['question_id'] ?? 0);
    $aid    = (int) ($input['answer_id']   ?? 0);
    $reason = trim($input['reason'] ?? '');
    $uid    = (int) $_SESSION['user_id'];          // PLACEHOLDER — session key

    if (!$qid || !$aid || !$reason) jsonError('Question ID, Answer ID, and reason are required.');
    $pdo = getDB();                                // PLACEHOLDER — requires real DB credentials

    /* ── Verify question ownership ── */
    $stmt = $pdo->prepare('SELECT author_id FROM questions WHERE id = ?');  // PLACEHOLDER table: questions
    $stmt->execute([$qid]);
    $q = $stmt->fetch();
    if (!$q || (int) $q['author_id'] !== $uid) {
        jsonError('Only the question author can report answers.', 403);
    }

    /* ── Check if already reported ── */
    $stmt = $pdo->prepare('SELECT reported_by FROM answers WHERE id = ? AND question_id = ?');  // PLACEHOLDER table: answers
    $stmt->execute([$aid, $qid]);
    $a = $stmt->fetch();
    if ($a && $a['reported_by']) jsonError('This answer has already been reported.', 409);

    /* ── Fetch pts_earned so admin knows what is at risk ── */
    $pts_at_risk = (int) ($a['pts_earned'] ?? ANSWER_FLAT_PTS);

    /* ── Mark answer as reported (pending) ── */
    $pdo->prepare(
        'UPDATE answers SET reported_by = ?, report_reason = ?, report_status = "pending" WHERE id = ?'  // PLACEHOLDER table: answers
    )->execute([$uid, $reason, $aid]);

    /* ── Insert into answer_reports for admin dashboard ── */
    /* answer_reports table: id, question_id, answer_id, reporter_id, reason, pts_at_risk, status, created_at */
    $pdo->prepare(
        'INSERT INTO answer_reports (question_id, answer_id, reporter_id, reason, pts_at_risk, status)
         VALUES (?, ?, ?, ?, ?, "pending")'        // PLACEHOLDER table: answer_reports
    )->execute([$qid, $aid, $uid, $reason, $pts_at_risk]);

    jsonResponse(true, ['message' => 'Answer reported. Admin will review it shortly.']);
}


/* ══════════════════════════════════════════════════════════════
   RESOLVE ANSWER REPORT (admin only)
   ══════════════════════════════════════════════════════════════
   Expected input:
     { action:'resolve_report', report_id: 789, decision: 'approve'|'dismiss' }

   approve  → deduct pts from answerer (can go negative)
   dismiss  → no change, clear the report
*/
function handleResolveReport(array $input): void {
    $rid      = (int) ($input['report_id'] ?? 0);
    $decision = $input['decision'] ?? '';

    if (!$rid || !in_array($decision, ['approve', 'dismiss'])) {
        jsonError('Report ID and a valid decision (approve|dismiss) are required.');
    }
    $pdo = getDB();                                // PLACEHOLDER — requires real DB credentials

    /* ── Fetch the report ── */
    $stmt = $pdo->prepare(
        'SELECT * FROM answer_reports WHERE id = ? AND status = "pending"'  // PLACEHOLDER table: answer_reports
    );
    $stmt->execute([$rid]);
    $rep = $stmt->fetch();
    if (!$rep) jsonError('Report not found or already resolved.', 404);

    if ($decision === 'approve') {
        /* ── Deduct pts from the answerer ── */
        /* SQL: UPDATE users SET pts = pts - pts_at_risk WHERE id = answerer_id */
        // First get the answerer's id
        $stmt = $pdo->prepare('SELECT author_id FROM answers WHERE id = ?');  // PLACEHOLDER table: answers
        $stmt->execute([$rep['answer_id']]);
        $ans = $stmt->fetch();

        if ($ans) {
            $pdo->prepare('UPDATE users SET pts = pts - ? WHERE id = ?')      // PLACEHOLDER table: users
                ->execute([$rep['pts_at_risk'], $ans['author_id']]);
        }

        /* ── Mark answer as penalised ── */
        $pdo->prepare(
            'UPDATE answers SET report_status = "approved" WHERE id = ?'      // PLACEHOLDER table: answers
        )->execute([$rep['answer_id']]);

        /* ── Mark report as approved ── */
        $pdo->prepare('UPDATE answer_reports SET status = "approved" WHERE id = ?')  // PLACEHOLDER table: answer_reports
            ->execute([$rid]);

        jsonResponse(true, ['message' => "Report approved. Answerer loses {$rep['pts_at_risk']} pts."]);

    } else {
        /* ── Dismiss: clear the report from the answer ── */
        $pdo->prepare(
            'UPDATE answers SET reported_by = NULL, report_reason = NULL, report_status = "dismissed" WHERE id = ?'  // PLACEHOLDER table: answers
        )->execute([$rep['answer_id']]);

        $pdo->prepare('UPDATE answer_reports SET status = "dismissed" WHERE id = ?')  // PLACEHOLDER table: answer_reports
            ->execute([$rid]);

        jsonResponse(true, ['message' => 'Report dismissed. No points changed.']);
    }
}
