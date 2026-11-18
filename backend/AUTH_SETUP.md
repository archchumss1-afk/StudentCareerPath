# Administrator login setup

Everyone can browse careers. Administrator accounts can add, edit, and delete them.
Express checks the administrator session on every write request.

## Recreating the database on another computer

This project has two setup files with separate tables:

- `careers-schema.sql` creates the public careers table using your existing structure.
- `auth-schema.sql` creates the administrator and session tables. The administrator
  setup command in step 2 applies this authentication file automatically.

On your current computer, the careers table already exists. Continue at step 1.
On another computer, install PostgreSQL, then use PowerShell in `backend`:

```powershell
& "C:\Program Files\PostgreSQL\18\bin\psql.exe" -h localhost -U postgres -d postgres -c "CREATE DATABASE edupath;"
& "C:\Program Files\PostgreSQL\18\bin\psql.exe" -h localhost -U postgres -d edupath -f .\careers-schema.sql
```

Adjust the PostgreSQL installation path if your version differs. Enter your database
password privately when prompted. Skip database creation if `edupath` already exists.
The careers file uses `CREATE TABLE IF NOT EXISTS`, preserves existing rows, and
contains no sample data. It saves the structure needed to create an empty table.
It does not copy your career records or administrator accounts to another computer.
Continue with steps 1 and 2 to configure the backend and create your administrator.

## 1. Configure your local backend

Stop Express with Ctrl+C. Open PowerShell in the `backend` folder.

```powershell
Copy-Item .env.example .env
```

If you already have `.env`, keep it and add the needed settings from `.env.example`.
The backend loads this file automatically using Node.js 24's built-in environment loader.
Keep the same hostname in both apps: `localhost:5173` and `localhost:5000`.

Set your PostgreSQL password privately in this PowerShell window:

```powershell
$databasePassword = Read-Host "PostgreSQL password" -AsSecureString
$env:PGPASSWORD = [System.Net.NetworkCredential]::new("", $databasePassword).Password
Remove-Variable databasePassword
```

Generate a random session secret and save it directly to the ignored `.env` file:

```powershell
node -e "require('node:fs').appendFileSync('.env', '\nSESSION_SECRET=' + require('node:crypto').randomBytes(48).toString('hex') + '\n')"
```

Run this secret-generation command once. Keep one `SESSION_SECRET` entry in `.env`.
Keep the secret stable across restarts so existing sessions continue to work.
The repository's `.gitignore` excludes `.env` files. `.env.example` contains configuration names only.

## 2. Create the first administrator

In the same PowerShell window:

```powershell
$env:ADMIN_EMAIL = Read-Host "Your administrator email"
$administratorPassword = Read-Host "Choose an administrator password (12+ characters)" -AsSecureString
$env:ADMIN_PASSWORD = [System.Net.NetworkCredential]::new("", $administratorPassword).Password
node .\scripts\create-admin.js
Remove-Item Env:ADMIN_PASSWORD, Env:ADMIN_EMAIL
Remove-Variable administratorPassword
```

Use an email and password you choose. They are entered privately on your computer.
The command creates `administrators` and `admin_sessions` using `auth-schema.sql`,
then inserts your administrator with a random salt and a scrypt password hash.
The `careers` table and its rows are preserved. No separate SQL command is needed.
An existing email is preserved when this command is repeated.
To authorize another administrator, repeat this local command with their credentials.
The website has no public signup endpoint.

## 3. Start and test

```powershell
node .\server.js
```

Run `npm run dev` in a second terminal in `frontend`, then open `http://localhost:5173`.

1. Logged out, confirm careers are visible and Add, Edit, and Delete are hidden.
2. Open Administrator login. A wrong password should show an error.
3. Log in with your new account. Add a temporary `Test Engineering` career.
4. Edit its name and specializations. Save and refresh to check persistence.
5. Delete the temporary career and confirm its removal.
6. Log out. Refresh to check that administrator controls stay hidden.

A direct unauthenticated POST, PUT, or DELETE returns HTTP 401.
Authenticated writes also require the session's CSRF token and the configured frontend Origin.
Sessions expire eight hours after login. A server restart preserves sessions in PostgreSQL.
Logout deletes the server session and clears the browser cookie.

`npm test` runs HTTP authentication/authorization checks against an isolated in-memory
test database and session store. The test suite uses randomly generated test credentials
and cleans up its temporary career. Your PostgreSQL database is never used by these tests.

## Production configuration

- Set `NODE_ENV=production` and `FRONTEND_ORIGIN` to the exact HTTPS frontend origin
  without a trailing slash, for example `https://your-domain.example`.
- Serve the frontend and `/api` through the same HTTPS origin. Production frontend
  builds use relative `/api` URLs by default. To use another API on the same site,
  set `VITE_API_ORIGIN` before building. Cross-site hosting needs a separate cookie design.
- Secure, HttpOnly, SameSite=Lax cookies are enabled automatically in production,
  with a `__Host-` name, root path, and no Domain attribute.
- When a known reverse proxy terminates HTTPS, set `TRUST_PROXY` to its trusted
  address or subnet, such as `loopback` for a local proxy. The proxy must replace
  incoming forwarding headers, and direct backend access must be restricted.
- Configure the database credentials and a stable random `SESSION_SECRET` privately
  on the server. Share that secret across instances using this same database.
- Login attempts are limited to ten per fifteen minutes per IP per backend process.
  Multiple backend instances need a shared limiter or equivalent ingress limit.

## Troubleshooting

- `Backend setup required` about `SESSION_SECRET`: complete step 1 before restarting Express.
- `relation ... does not exist`: run the administrator setup command against `edupath`.
- Database password errors: set `PGPASSWORD` in the same terminal that starts Express.
- A failed security check: refresh the page and ensure `FRONTEND_ORIGIN` exactly matches
  the address used in the browser. If the frontend uses another port, update that value.
- Failed logout: the page shows the error and keeps the signed-in view so you can retry.

Implementation references: [Express sessions](https://expressjs.com/en/resources/middleware/session/),
[Node.js scrypt](https://nodejs.org/api/crypto.html#cryptoscryptpassword-salt-keylen-options-callback),
and [OWASP CSRF guidance](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html).
