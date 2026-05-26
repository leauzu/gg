<?php
require __DIR__ . '/_lib.php';
try {
    $user = current_user();
    if (!$user) send_json(401, ['error' => 'Not authenticated']);
    // Client may read balance, but cannot directly overwrite it.
    if ($_SERVER['REQUEST_METHOD'] === 'GET') send_json(200, ['user' => public_user($user)]);
    send_json(403, ['error' => 'Balance is server controlled.']);
} catch (Throwable $e) {
    send_json(500, ['error' => $e->getMessage() ?: 'Balance failed']);
}
