<?php
header('Content-Type: application/json');

echo json_encode([
    'php_version' => PHP_VERSION,
    'database_url_exists' => getenv('DATABASE_URL') ? true : false,
    'auth_secret_exists' => getenv('AUTH_SECRET') ? true : false,
    'pdo_pgsql_loaded' => extension_loaded('pdo_pgsql'),
    'pgsql_loaded' => extension_loaded('pgsql'),
    'loaded_extensions' => get_loaded_extensions()
]);
