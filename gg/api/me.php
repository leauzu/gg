<?php
require __DIR__ . '/_lib.php';
try {
    $user = current_user();
    if (!$user) send_json(401, ['error' => 'Not authenticated']);
    send_json(200, ['user' => public_user($user)]);
} catch (Throwable $e) {
    send_json(500, ['error' => $e->getMessage() ?: 'Auth check failed.']);
}
