# AgriHibalo — Agricultural Knowledge Community
Proposed by: Guardapies, Robante & Timban

## Folder Structure
```
AgriHibalo/
├── index.html          ← Landing page
├── app.html            ← Q&A application page
└── assets/
    ├── assets/         ← Images, logos, videos
    │   └── logo.png
    ├── css/            ← Stylesheets
    │   ├── shared.css
    │   ├── landing.css
    │   └── app.css
    ├── js/             ← JavaScript files
    │   ├── landing.js
    │   └── app.js
    ├── php/            ← PHP backend (API endpoints)
    │   ├── config.php  ← ⚠️  CONFIGURE THIS FIRST (DB credentials)
    │   ├── db.php      ← Database connection helper
    │   ├── auth.php    ← Register / Login / Logout
    │   ├── questions.php ← Q&A feed CRUD
    │   ├── answers.php ← Answers + Best Answer + report system
    │   ├── users.php   ← Leaderboard, profiles, admin user management
    │   └── upload.php  ← Image upload handler
    └── database/       ← (Reserved for future MySQL schema files)
```

## Setting Up the PHP Backend

1. **Edit `assets/php/config.php`** — replace every `PLACEHOLDER` with real values:
   - `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASS`
   - `APP_URL` (e.g. `http://localhost/AgriHibalo`)
   - `SECRET_KEY` (any long random string)

2. **Create the MySQL database** using the schema defined in the
   `assets/database/` folder (to be added in a future step).

3. **Host on a PHP server** — XAMPP, Laragon, or any web host with PHP 8.0+.

4. **Connect the frontend** — in `assets/js/app.js`, replace the in-memory
   data and `doLogin` / `doRegister` functions with `fetch()` calls to the
   PHP endpoints:
   - Auth:      `fetch('assets/php/auth.php', { method:'POST', body: JSON.stringify({...}) })`
   - Questions: `fetch('assets/php/questions.php?action=list')`
   - Answers:   `fetch('assets/php/answers.php', { method:'POST', ... })`
   - Users:     `fetch('assets/php/users.php?action=leaderboard')`
   - Upload:    `fetch('assets/php/upload.php', { method:'POST', body: formData })`

## Current Status
The frontend (`index.html` + `app.html`) is **fully functional** using
in-memory JavaScript data (no database needed to view/demo).

The PHP backend files are **complete and documented** but require a
MySQL database to be wired up before they go live.
