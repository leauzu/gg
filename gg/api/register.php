<?php
ini_set('display_errors', '1');
ini_set('display_startup_errors', '1');
error_reporting(E_ALL);

header('Content-Type: application/json');

function json_response($data, $status = 200) {
    http_response_code($status);
    echo json_encode($data);
    exit;
}

try {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        json_response(['error' => 'Method not allowed'], 405);
    }

    $databaseUrl = getenv('DATABASE_URL');
    if (!$databaseUrl) {
        json_response(['error' => 'DATABASE_URL not configured'], 500);
    }

    $input = json_decode(file_get_contents('php://input'), true);
    if (!$input) {
        json_response(['error' => 'Invalid JSON input'], 400);
    }

    $username = trim($input['username'] ?? '');
    $password = $input['password'] ?? '';

    if ($username === '' || $password === '') {
        json_response(['error' => 'Username and password required'], 400);
    }

    if (strlen($username) < 3 || strlen($username) > 32) {
        json_response(['error' => 'Username must be 3-32 characters'], 400);
    }

    if (strlen($password) < 3) {
        json_response(['error' => 'Password too short'], 400);
    }

    $parts = parse_url($databaseUrl);

    if (!$parts || empty($parts['host']) || empty($parts['user']) || empty($parts['pass']) || empty($parts['path'])) {
        json_response([
            'error' => 'Invalid DATABASE_URL format',
            'parsed' => $parts
        ], 500);
    }

    $host = $parts['host'];
    $port = $parts['port'] ?? 5432;
    $dbname = ltrim($parts['path'], '/');
    $user = $parts['user'];
    $pass = $parts['pass'];

    $dsn = "pgsql:host={$host};port={$port};dbname={$dbname};sslmode=require";

    $pdo = new PDO($dsn, $user, $pass, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    ]);

    $pdo->exec("
        CREATE TABLE IF NOT EXISTS users (
            id BIGSERIAL PRIMARY KEY,
            username VARCHAR(32) UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            salt TEXT NOT NULL,
            balance BIGINT NOT NULL DEFAULT 10000000,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    ");

    $salt = bin2hex(random_bytes(16));
    $passwordHash = password_hash($password . $salt, PASSWORD_DEFAULT);

    $stmt = $pdo->prepare("
        INSERT INTO users (username, password_hash, salt, balance)
        VALUES (:username, :password_hash, :salt, 10000000)
        RETURNING id, username, balance
    ");

    $stmt->execute([
        ':username' => $username,
        ':password_hash' => $passwordHash,
        ':salt' => $salt,
    ]);

    $user = $stmt->fetch();

    json_response([
        'ok' => true,
        'user' => $user
    ]);

} catch (Throwable $e) {
    error_log('REGISTER REAL ERROR: ' . $e->getMessage());

    json_response([
        'error' => 'Register failed.',
        'detail' => $e->getMessage(),
        'file' => $e->getFile(),
        'line' => $e->getLine()
    ], 500);
}
