<?php
require __DIR__ . '/_lib.php';
if ($_SERVER['REQUEST_METHOD'] !== 'POST') send_json(405, ['error' => 'Method not allowed']);
try {
    ensure_schema();
    $body = json_body();
    $u = strtolower(trim((string)($body['username'] ?? '')));
    $p = (string)($body['password'] ?? '');
    $stmt = pdo()->prepare('SELECT id, username, password_hash, balance FROM users WHERE username = ? LIMIT 1');
    $stmt->execute([$u]);
    $user = $stmt->fetch();
    if (!$user || !password_verify($p, $user['password_hash'])) {
        send_json(401, ['error' => 'Invalid username or password.']);
    }
    set_session_cookie(create_token($user));
    send_json(200, ['user' => public_user($user)]);
} catch (Throwable $e) {
    send_json(500, ['error' => $e->getMessage() ?: 'Login failed.']);
}
