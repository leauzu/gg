<?php
const START_BALANCE = 10000000;
const TOKEN_COOKIE = 'lj_session';
const COOKIE_MAX_AGE = 2592000; // 30 days

function json_body(): array {
    $raw = file_get_contents('php://input');
    if (!$raw) return [];
    $data = json_decode($raw, true);
    return is_array($data) ? $data : [];
}

function send_json(int $status, array $data): void {
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function envv(string $key, ?string $default = null): ?string {
    $v = getenv($key);
    if ($v === false || $v === '') return $default;
    return $v;
}

function pdo(): PDO {
    static $pdo = null;
    if ($pdo instanceof PDO) return $pdo;
    $url = envv('DATABASE_URL') ?: envv('POSTGRES_URL');
    if (!$url) throw new RuntimeException('DATABASE_URL is not configured.');
    $parts = parse_url($url);
    if (!$parts || empty($parts['host']) || empty($parts['path'])) {
        throw new RuntimeException('Invalid DATABASE_URL.');
    }
    $host = $parts['host'];
    $port = $parts['port'] ?? 5432;
    $db = ltrim($parts['path'], '/');
    $user = rawurldecode($parts['user'] ?? '');
    $pass = rawurldecode($parts['pass'] ?? '');
    $dsn = "pgsql:host={$host};port={$port};dbname={$db};sslmode=require";
    $pdo = new PDO($dsn, $user, $pass, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
    ]);
    return $pdo;
}

function ensure_schema(): void {
    static $ready = false;
    if ($ready) return;
    $db = pdo();
    $db->exec("CREATE TABLE IF NOT EXISTS users (
        id BIGSERIAL PRIMARY KEY,
        username VARCHAR(32) UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        balance BIGINT NOT NULL DEFAULT 10000000,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )");
    $db->exec("CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)");
    $ready = true;
}

function validate_user_input($username, $password): array {
    $u = strtolower(trim((string)$username));
    $p = (string)$password;
    if (!preg_match('/^[a-z0-9_]{3,32}$/', $u)) {
        return ['error' => 'Username must be 3-32 chars: a-z, 0-9, underscore only.'];
    }
    if (strlen($p) < 6 || strlen($p) > 72) {
        return ['error' => 'Password must be 6-72 characters.'];
    }
    return ['username' => $u, 'password' => $p];
}

function auth_secret(): string {
    return envv('AUTH_SECRET') ?: envv('JWT_SECRET') ?: 'dev-change-this-secret';
}

function b64url_encode(string $s): string {
    return rtrim(strtr(base64_encode($s), '+/', '-_'), '=');
}

function b64url_decode(string $s): string {
    $pad = strlen($s) % 4;
    if ($pad) $s .= str_repeat('=', 4 - $pad);
    return base64_decode(strtr($s, '-_', '+/')) ?: '';
}

function create_token(array $user): string {
    $payload = b64url_encode(json_encode([
        'id' => (int)$user['id'],
        'username' => $user['username'],
        'iat' => (int)(microtime(true) * 1000),
    ], JSON_UNESCAPED_SLASHES));
    $sig = b64url_encode(hash_hmac('sha256', $payload, auth_secret(), true));
    return $payload . '.' . $sig;
}

function verify_token(?string $token): ?array {
    if (!$token || strpos($token, '.') === false) return null;
    [$payload, $sig] = explode('.', $token, 2);
    $expected = b64url_encode(hash_hmac('sha256', $payload, auth_secret(), true));
    if (!hash_equals($expected, $sig)) return null;
    $data = json_decode(b64url_decode($payload), true);
    if (!is_array($data) || empty($data['id'])) return null;
    if ((int)(microtime(true) * 1000) - (int)($data['iat'] ?? 0) > COOKIE_MAX_AGE * 1000) return null;
    return $data;
}

function set_session_cookie(string $token): void {
    setcookie(TOKEN_COOKIE, $token, [
        'expires' => time() + COOKIE_MAX_AGE,
        'path' => '/',
        'secure' => (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off'),
        'httponly' => true,
        'samesite' => 'Lax',
    ]);
}

function clear_session_cookie(): void {
    setcookie(TOKEN_COOKIE, '', [
        'expires' => time() - 3600,
        'path' => '/',
        'secure' => (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off'),
        'httponly' => true,
        'samesite' => 'Lax',
    ]);
}

function current_user(): ?array {
    $data = verify_token($_COOKIE[TOKEN_COOKIE] ?? null);
    if (!$data) return null;
    ensure_schema();
    $stmt = pdo()->prepare('SELECT id, username, balance FROM users WHERE id = ? LIMIT 1');
    $stmt->execute([(int)$data['id']]);
    $user = $stmt->fetch();
    return $user ?: null;
}

function public_user(array $row): array {
    return [
        'id' => (int)$row['id'],
        'username' => $row['username'],
        'balance' => (int)($row['balance'] ?? START_BALANCE),
    ];
}
