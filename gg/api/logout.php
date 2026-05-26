<?php
require __DIR__ . '/_lib.php';
clear_session_cookie();
send_json(200, ['ok' => true]);
