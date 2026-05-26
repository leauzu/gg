<?php
require __DIR__ . '/_lib.php';
if ($_SERVER['REQUEST_METHOD'] !== 'POST') send_json(405, ['error' => 'Method not allowed']);
try {
    ensure_schema();
    $body = json_body();
    $v = validate_user_input($body['username'] ?? '', $body['password'] ?? '');
    if (isset($v['error'])) send_json(400, ['error' => $v['error']]);

    $hash = password_hash($v['password'], PASSWORD_DEFAULT);
    $stmt = pdo()->prepare('INSERT INTO users (username, password_hash, balance) VALUES (?, ?, ?) RETURNING id, username, balance');
    $stmt->execute([$v['username'], $hash, START_BALANCE]);
    $user = $stmt->fetch();
    set_session_cookie(create_token($user));
    send_json(200, ['user' => public_user($user)]);
} catch (PDOException $e) {
    if ($e->getCode() === '23505') send_json(409, ['error' => 'Username already exists.']);
    send_json(500, ['error' => 'Register failed.']);
} catch (Throwable $e) {
    error_log('REGISTER ERROR: ' . $e->getMessage());
    json_response([
        'error' => 'Register failed.',
        'detail' => $e->getMessage()
    ], 500);
}
