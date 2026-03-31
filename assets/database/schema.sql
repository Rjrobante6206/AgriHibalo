-- ═══════════════════════════════════════════════════════════════════
-- AgriHibalo — schema.sql
-- Full MySQL database schema for the AgriHibalo Q&A platform.
--
-- HOW TO RUN:
--   1. Open phpMyAdmin (or any MySQL client).
--   2. Create a new database named: agrihibalo_db
--      (or whatever you set as DB_NAME in config.php)
--   3. Select that database, go to the SQL tab, paste this entire
--      file, and click "Go".
--
-- TABLE OVERVIEW:
--   users           — registered members (students, farmers, admin)
--   questions       — Q&A posts with bounty and domain info
--   question_votes  — tracks who voted on which question
--   answers         — replies to questions
--   answer_votes    — tracks who voted on which answer
--   reports         — question-level reports filed by users
--   answer_reports  — answer-level reports (reviewed by admin)
--   notifications   — per-user notification feed
--   activity_log    — admin activity log
-- ═══════════════════════════════════════════════════════════════════

SET FOREIGN_KEY_CHECKS = 0;
SET NAMES utf8mb4;

-- ────────────────────────────────────────────────────────────────────
-- 1. USERS
--    Stores every registered account including the admin.
--    `pts`         — current point balance (can go negative if penalised)
--    `q_count`     — cached count of questions posted (updated on insert)
--    `a_count`     — cached count of answers posted
--    `best_ans`    — cached count of Best Answer marks earned
--    `active_badge`— the badge_id the user has chosen to display
-- ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
    id            INT UNSIGNED    AUTO_INCREMENT PRIMARY KEY,
    full_name     VARCHAR(100)    NOT NULL,
    username      VARCHAR(60)     NOT NULL,
    password      VARCHAR(255)    NOT NULL,          -- bcrypt hash, NEVER plaintext
    role          ENUM('student','farmer','admin')
                                  NOT NULL DEFAULT 'student',
    pts           INT             NOT NULL DEFAULT 50, -- NEW_USER_PTS from config.php
    q_count       INT UNSIGNED    NOT NULL DEFAULT 0,
    a_count       INT UNSIGNED    NOT NULL DEFAULT 0,
    best_ans      INT UNSIGNED    NOT NULL DEFAULT 0,
    banned        TINYINT(1)      NOT NULL DEFAULT 0,
    active_badge  VARCHAR(60)     DEFAULT NULL,       -- e.g. 'first_q', 'best_ans'
    created_at    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_username (username)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Seed: default admin account (password is 'admin123' — bcrypt hash below)
-- Change the password hash in production via:  password_hash('yourpassword', PASSWORD_BCRYPT)
INSERT IGNORE INTO users (full_name, username, password, role, pts)
VALUES (
    'Administrator',
    'admin',
    '$2y$12$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', -- bcrypt of 'admin123'
    'admin',
    0
);

-- Seed: sample community members (password = 'password123' for all)
INSERT IGNORE INTO users (full_name, username, password, role, pts, q_count, a_count, best_ans) VALUES
('Maria Santos',   'maria_santos',   '$2y$12$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'farmer',  170, 12, 28, 3),
('Juan dela Cruz', 'juan_delacruz',  '$2y$12$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'student', 140,  8, 22, 1),
('Pedro Reyes',    'pedro_reyes',    '$2y$12$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'farmer',  105,  5, 18, 2),
('Ana Gomez',      'ana_gomez',      '$2y$12$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'student',  90, 10, 14, 1),
('Ramon Flores',   'ramon_flores',   '$2y$12$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'farmer',   60,  4, 10, 0);


-- ────────────────────────────────────────────────────────────────────
-- 2. QUESTIONS
--    Each row is one Q&A post.
--    `domain`          — 'farm' or 'animal'
--    `tags`            — stored as a JSON array string, e.g. '["rice","pests"]'
--    `bounty`          — points the asker offered (deducted on post)
--    `pts_distributed` — total points paid out to answerers so far
--    `best_ans_id`     — FK to answers.id once a Best Answer is chosen
--    `reported`        — 1 = flagged, pending admin review
--    `hidden`          — 1 = hidden by admin (not shown in feed)
-- ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS questions (
    id               INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    title            VARCHAR(200)  NOT NULL,
    body             TEXT          NOT NULL,
    domain           ENUM('farm','animal') NOT NULL DEFAULT 'farm',
    category         VARCHAR(80)   NOT NULL DEFAULT 'General',
    tags             JSON          DEFAULT NULL,      -- e.g. ["rice","yellowing","nutrient"]
    image_url        VARCHAR(500)  DEFAULT NULL,
    author_id        INT UNSIGNED  NOT NULL,
    bounty           TINYINT UNSIGNED NOT NULL DEFAULT 5,  -- 5–10 per config.php
    pts              TINYINT UNSIGNED NOT NULL DEFAULT 5,  -- mirrors bounty at post time
    pts_distributed  INT UNSIGNED  NOT NULL DEFAULT 0,
    votes            INT           NOT NULL DEFAULT 0,
    best_ans_id      INT UNSIGNED  DEFAULT NULL,
    reported         TINYINT(1)    NOT NULL DEFAULT 0,
    hidden           TINYINT(1)    NOT NULL DEFAULT 0,
    created_at       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_q_author  FOREIGN KEY (author_id)    REFERENCES users(id)    ON DELETE CASCADE,
    INDEX idx_q_domain     (domain),
    INDEX idx_q_author     (author_id),
    INDEX idx_q_created    (created_at),
    INDEX idx_q_hidden     (hidden)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Note: fk_q_bestans references answers(id) which is created below.
-- MySQL evaluates FKs at run time so this forward reference is fine.

-- Seed: five starter questions matching the JS demo data
INSERT IGNORE INTO questions
    (id, title, body, domain, category, tags, author_id, bounty, pts, votes) VALUES
(1001,
 'My rice leaves are turning yellow at the tips — what is causing this?',
 'My rice plants are about 4 weeks old and I noticed the leaf tips are turning yellow. Some plants also look stunted compared to the others. I applied urea two weeks ago. Soil is slightly acidic. Could this be a nutrient deficiency or a disease?',
 'farm', 'Pests & Disease',
 '["rice","yellowing","nutrient","deficiency"]',
 (SELECT id FROM users WHERE username='maria_santos'), 10, 10, 12),

(1002,
 'What is the ideal soil pH for planting corn in the Philippines?',
 'I am planning to plant sweet corn in my small farm in Cebu. The soil test showed my pH is around 5.5. Is this suitable or do I need to amend it first?',
 'farm', 'Soil Science',
 '["corn","soil","pH","Cebu"]',
 (SELECT id FROM users WHERE username='juan_delacruz'), 10, 10, 8),

(1003,
 'Signs of foot-and-mouth disease in cattle — how to identify early?',
 'One of my cows is limping and has reduced milk production. I noticed blisters around her mouth. Could this be FMD? What immediate steps should I take?',
 'animal', 'Veterinary',
 '["cattle","FMD","disease","emergency"]',
 (SELECT id FROM users WHERE username='pedro_reyes'), 10, 10, 15),

(1004,
 'How often should I deworm my goats and what product is best?',
 'I have 12 native goats and I am not sure about the deworming schedule. Some of them look thin even though they eat well. I suspect internal parasites. What deworming product works best and how often should I do it?',
 'animal', 'Veterinary',
 '["goats","deworming","parasites","livestock"]',
 (SELECT id FROM users WHERE username='ana_gomez'), 8, 8, 5),

(1005,
 'Best organic fertilizer for vegetable farming in small plots?',
 'I have a 200 sqm backyard vegetable garden. I want to go fully organic. What are the best locally available organic fertilizers for ampalaya and eggplant?',
 'farm', 'Fertilizers',
 '["organic","vegetables","ampalaya","eggplant"]',
 (SELECT id FROM users WHERE username='ramon_flores'), 5, 5, 3);


-- ────────────────────────────────────────────────────────────────────
-- 3. QUESTION_VOTES
--    Prevents the same user voting twice on the same question.
--    direction: 1 = upvote, -1 = downvote
-- ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS question_votes (
    question_id  INT UNSIGNED NOT NULL,
    user_id      INT UNSIGNED NOT NULL,
    direction    TINYINT      NOT NULL DEFAULT 1,   -- 1 or -1
    created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY  (question_id, user_id),
    CONSTRAINT fk_qv_question FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE,
    CONSTRAINT fk_qv_user     FOREIGN KEY (user_id)     REFERENCES users(id)     ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ────────────────────────────────────────────────────────────────────
-- 4. ANSWERS
--    `pts_earned`    — total points credited to this answerer
--    `best_answer`   — 1 once the question author marks it Best
--    `reported_by`   — user_id of the reporter (question author only)
--    `report_status` — pending | approved | dismissed
-- ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS answers (
    id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    question_id    INT UNSIGNED NOT NULL,
    author_id      INT UNSIGNED NOT NULL,
    text           TEXT         NOT NULL,
    votes          INT          NOT NULL DEFAULT 0,
    best_answer    TINYINT(1)   NOT NULL DEFAULT 0,
    pts_earned     INT          NOT NULL DEFAULT 0,
    reported_by    INT UNSIGNED DEFAULT NULL,        -- FK to users.id
    report_reason  VARCHAR(500) DEFAULT NULL,
    report_status  ENUM('pending','approved','dismissed') DEFAULT NULL,
    created_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_a_question   FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE,
    CONSTRAINT fk_a_author     FOREIGN KEY (author_id)   REFERENCES users(id)     ON DELETE CASCADE,
    CONSTRAINT fk_a_reportedby FOREIGN KEY (reported_by) REFERENCES users(id)     ON DELETE SET NULL,
    INDEX idx_a_question  (question_id),
    INDEX idx_a_author    (author_id),
    INDEX idx_a_best      (best_answer)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Seed: answers for the demo questions
-- Answers for Q1001
INSERT IGNORE INTO answers (id, question_id, author_id, text, votes, best_answer, pts_earned) VALUES
(2001, 1001,
 (SELECT id FROM users WHERE username='pedro_reyes'),
 'Yellow leaf tips in rice are usually a sign of nitrogen deficiency, especially if you see it on older leaves first. However if the yellowing starts at the tips of young leaves it could also be iron toxicity from waterlogged conditions. Check your drainage first, then apply a foliar spray of complete fertilizer as a corrective measure.',
 8, 1, 13),  -- 3 flat + 10 bounty

(2002, 1001,
 (SELECT id FROM users WHERE username='ramon_flores'),
 'Also consider sulfur deficiency — it causes yellowing similar to nitrogen deficiency but affects younger leaves first. A soil test would confirm this. In the meantime try applying ammonium sulfate which addresses both nitrogen and sulfur at once.',
 3, 0, 3);

-- Mark Q1001 Best Answer
UPDATE questions SET best_ans_id = 2001, pts_distributed = 10 WHERE id = 1001;

-- Answers for Q1002
INSERT IGNORE INTO answers (id, question_id, author_id, text, votes, best_answer, pts_earned) VALUES
(2003, 1002,
 (SELECT id FROM users WHERE username='maria_santos'),
 'Corn prefers a soil pH of 6.0–6.5. A pH of 5.5 is slightly acidic. Apply agricultural lime (dolomite) at about 2–3 bags per hectare and wait 2–3 weeks before planting. This will also add calcium and magnesium.',
 6, 1, 13);

UPDATE questions SET best_ans_id = 2003, pts_distributed = 10 WHERE id = 1002;

-- Answers for Q1003
INSERT IGNORE INTO answers (id, question_id, author_id, text, votes, best_answer, pts_earned) VALUES
(2004, 1003,
 (SELECT id FROM users WHERE username='ana_gomez'),
 'The symptoms you describe are consistent with FMD. IMMEDIATE steps: 1) Isolate the affected animal NOW. 2) Do NOT move animals on or off the farm. 3) Contact your local DA or veterinarian immediately. 4) Disinfect all equipment. FMD is highly contagious and reportable.',
 12, 1, 13);

UPDATE questions SET best_ans_id = 2004, pts_distributed = 10 WHERE id = 1003;


-- ────────────────────────────────────────────────────────────────────
-- 5. ANSWER_VOTES
-- ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS answer_votes (
    answer_id   INT UNSIGNED NOT NULL,
    user_id     INT UNSIGNED NOT NULL,
    direction   TINYINT      NOT NULL DEFAULT 1,
    created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (answer_id, user_id),
    CONSTRAINT fk_av_answer FOREIGN KEY (answer_id) REFERENCES answers(id)  ON DELETE CASCADE,
    CONSTRAINT fk_av_user   FOREIGN KEY (user_id)   REFERENCES users(id)    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ────────────────────────────────────────────────────────────────────
-- 6. REPORTS  (question-level reports)
--    `item_type` — 'question' (reserved for future post types)
-- ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS reports (
    id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    item_id     INT UNSIGNED NOT NULL,               -- questions.id
    item_type   ENUM('question') NOT NULL DEFAULT 'question',
    reason      VARCHAR(500) NOT NULL,
    reporter_id INT UNSIGNED NOT NULL,
    resolved    TINYINT(1)   NOT NULL DEFAULT 0,
    created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_rep_reporter FOREIGN KEY (reporter_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_rep_resolved (resolved),
    INDEX idx_rep_item     (item_id, item_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ────────────────────────────────────────────────────────────────────
-- 7. ANSWER_REPORTS  (answer-level reports, reviewed by admin)
--    `pts_at_risk` — points to deduct from answerer if admin approves
--    `status`      — pending | approved | dismissed
-- ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS answer_reports (
    id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    question_id  INT UNSIGNED NOT NULL,
    answer_id    INT UNSIGNED NOT NULL,
    reporter_id  INT UNSIGNED NOT NULL,
    reason       VARCHAR(500) NOT NULL,
    pts_at_risk  TINYINT UNSIGNED NOT NULL DEFAULT 3,
    status       ENUM('pending','approved','dismissed') NOT NULL DEFAULT 'pending',
    created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_ar_question  FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE,
    CONSTRAINT fk_ar_answer    FOREIGN KEY (answer_id)   REFERENCES answers(id)   ON DELETE CASCADE,
    CONSTRAINT fk_ar_reporter  FOREIGN KEY (reporter_id) REFERENCES users(id)     ON DELETE CASCADE,
    INDEX idx_ar_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ────────────────────────────────────────────────────────────────────
-- 8. NOTIFICATIONS  (per-user in-app notification feed)
--    `type`  — answer | badge | success | info
-- ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notifications (
    id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id    INT UNSIGNED NOT NULL,
    text       VARCHAR(500) NOT NULL,
    type       ENUM('answer','badge','success','info') NOT NULL DEFAULT 'info',
    is_read    TINYINT(1)   NOT NULL DEFAULT 0,
    created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_notif_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_notif_user   (user_id),
    INDEX idx_notif_unread (user_id, is_read)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ────────────────────────────────────────────────────────────────────
-- 9. ACTIVITY_LOG  (admin dashboard feed — last 50 actions)
--    `type` — q (question) | a (answer) | u (user) | d (delete/admin action)
-- ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS activity_log (
    id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    type       ENUM('q','a','u','d') NOT NULL DEFAULT 'q',
    text       VARCHAR(500)          NOT NULL,
    created_at DATETIME              NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_log_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Seed: activity log entries to match demo state
INSERT INTO activity_log (type, text, created_at) VALUES
('q', 'Maria Santos posted "My rice leaves are turning yellow at the tips"',   DATE_SUB(NOW(), INTERVAL 5 HOUR)),
('a', 'Pedro Reyes answered a question about rice leaf yellowing',              DATE_SUB(NOW(), INTERVAL 4 HOUR)),
('u', 'Ana Gomez registered as a new student member',                          DATE_SUB(NOW(), INTERVAL 6 HOUR)),
('q', 'Juan dela Cruz posted "What is the ideal soil pH for planting corn?"',  DATE_SUB(NOW(), INTERVAL 12 HOUR));

ALTER TABLE questions ADD CONSTRAINT fk_q_bestans FOREIGN KEY (best_ans_id) REFERENCES answers(id) ON DELETE SET NULL;
SET FOREIGN_KEY_CHECKS = 1;

-- ═══════════════════════════════════════════════════════════════════
-- END OF SCHEMA
-- After running this file, update config.php with your DB credentials
-- and the site will be fully connected to the database.
-- ═══════════════════════════════════════════════════════════════════
