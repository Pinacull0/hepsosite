<?php

declare(strict_types=1);

use PHPMailer\PHPMailer\Exception;
use PHPMailer\PHPMailer\PHPMailer;

header('Content-Type: application/json; charset=utf-8');

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    http_response_code(405);
    echo json_encode(['ok' => false, 'error' => 'method_not_allowed']);
    exit;
}

// ========== CONFIG ==========
$SMTP_HOST = 'smtp.hepso.com.br';
$SMTP_PORT = 587;
$SMTP_USER = 'comercial@hepso.com.br';
$SMTP_PASS = 'SENHA_AQUI';
$FROM_EMAIL = $SMTP_USER;
$FROM_NAME = 'Hepso Monitor';
// E-mail do gestor (recebe alertas de bot/suspeito)
$MANAGER_EMAIL = 'comercial@hepso.com.br';
$MANAGER_NAME = 'Comercial Hepso';
$logFile = sys_get_temp_dir() . '/hepso_visitors.ndjson';
// ===========================

$body = json_decode((string)file_get_contents('php://input'), true);
if (!is_array($body)) {
    $body = [];
}

$ip = getClientIp();
$ua = sanitizeText((string)($_SERVER['HTTP_USER_AGENT'] ?? 'N/D'), 400);
$method = sanitizeText((string)($_SERVER['REQUEST_METHOD'] ?? 'N/D'), 16);
$referer = sanitizeText((string)($_SERVER['HTTP_REFERER'] ?? ''), 500);
$path = sanitizeText((string)($body['path'] ?? ($_SERVER['REQUEST_URI'] ?? '/')), 300);
$query = sanitizeText((string)($body['query'] ?? ''), 300);
$lang = sanitizeText((string)($_SERVER['HTTP_ACCEPT_LANGUAGE'] ?? ''), 120);
$tz = sanitizeText((string)($body['timezone'] ?? ''), 80);
$screen = sanitizeText((string)($body['screen'] ?? ''), 30);
$url = sanitizeText((string)($body['url'] ?? ''), 600);

[$type, $reasons] = classifyVisitor($ua, $method, $path, $query);

$entry = [
    'ts' => gmdate('c'),
    'ip' => $ip,
    'type' => $type,
    'reasons' => $reasons,
    'path' => $path,
    'query' => $query,
    'url' => $url,
    'referer' => $referer,
    'ua' => $ua,
    'lang' => $lang,
    'tz' => $tz,
    'screen' => $screen,
];
appendLog($logFile, $entry);

$shouldAlert = ($type === 'bot' || $type === 'suspeito');
if ($shouldAlert && checkRateLimit('visit_alert_' . md5($ip . '|' . $type), 30 * 60, 2)) {
    if (loadMailer()) {
        try {
            $mail = buildMailer($SMTP_HOST, $SMTP_PORT, $SMTP_USER, $SMTP_PASS, $FROM_EMAIL, $FROM_NAME);
            $mail->addAddress($MANAGER_EMAIL, $MANAGER_NAME);
            $mail->isHTML(true);
            $mail->Subject = '[Monitor] Acesso ' . strtoupper($type) . ' detectado';

            $safeReasons = htmlspecialchars(implode(', ', $reasons), ENT_QUOTES, 'UTF-8');
            $mail->Body =
                '<h3>Monitoramento de acesso</h3>' .
                '<p><strong>Classificação:</strong> ' . htmlspecialchars($type, ENT_QUOTES, 'UTF-8') . '</p>' .
                '<p><strong>Motivos:</strong> ' . ($safeReasons !== '' ? $safeReasons : 'N/D') . '</p>' .
                '<p><strong>IP:</strong> ' . htmlspecialchars($ip, ENT_QUOTES, 'UTF-8') . '</p>' .
                '<p><strong>Path:</strong> ' . htmlspecialchars($path, ENT_QUOTES, 'UTF-8') . '</p>' .
                '<p><strong>URL:</strong> ' . htmlspecialchars($url ?: 'N/D', ENT_QUOTES, 'UTF-8') . '</p>' .
                '<p><strong>Query:</strong> ' . htmlspecialchars($query ?: 'N/D', ENT_QUOTES, 'UTF-8') . '</p>' .
                '<p><strong>Referer:</strong> ' . htmlspecialchars($referer ?: 'N/D', ENT_QUOTES, 'UTF-8') . '</p>' .
                '<p><strong>User-Agent:</strong> ' . htmlspecialchars($ua, ENT_QUOTES, 'UTF-8') . '</p>' .
                '<p><strong>Idioma:</strong> ' . htmlspecialchars($lang ?: 'N/D', ENT_QUOTES, 'UTF-8') . '</p>' .
                '<p><strong>Timezone:</strong> ' . htmlspecialchars($tz ?: 'N/D', ENT_QUOTES, 'UTF-8') . '</p>' .
                '<p><strong>Screen:</strong> ' . htmlspecialchars($screen ?: 'N/D', ENT_QUOTES, 'UTF-8') . '</p>';

            $mail->AltBody =
                "Monitoramento de acesso\n" .
                "Classificação: {$type}\n" .
                'Motivos: ' . (implode(', ', $reasons) ?: 'N/D') . "\n" .
                "IP: {$ip}\n" .
                "Path: {$path}\n" .
                'URL: ' . ($url ?: 'N/D') . "\n" .
                'Query: ' . ($query ?: 'N/D') . "\n" .
                'Referer: ' . ($referer ?: 'N/D') . "\n" .
                "User-Agent: {$ua}\n" .
                'Idioma: ' . ($lang ?: 'N/D') . "\n" .
                'Timezone: ' . ($tz ?: 'N/D') . "\n" .
                'Screen: ' . ($screen ?: 'N/D');

            $mail->send();
        } catch (Exception $e) {
            error_log('MAIL ERROR(track-visit): ' . $e->getMessage());
        }
    }
}

echo json_encode(['ok' => true, 'type' => $type]);

function sanitizeText(string $value, int $maxLen): string
{
    $value = trim($value);
    $value = preg_replace('/[\x00-\x1F\x7F]/u', '', $value) ?? '';
    if (mb_strlen($value, 'UTF-8') > $maxLen) {
        $value = mb_substr($value, 0, $maxLen, 'UTF-8');
    }
    return $value;
}

function getClientIp(): string
{
    $keys = ['HTTP_CF_CONNECTING_IP', 'HTTP_X_FORWARDED_FOR', 'REMOTE_ADDR'];
    foreach ($keys as $key) {
        $raw = $_SERVER[$key] ?? '';
        if ($raw === '') {
            continue;
        }
        foreach (array_map('trim', explode(',', $raw)) as $ip) {
            if (filter_var($ip, FILTER_VALIDATE_IP)) {
                return $ip;
            }
        }
    }
    return '0.0.0.0';
}

function classifyVisitor(string $ua, string $method, string $path, string $query): array
{
    $uaLower = mb_strtolower($ua, 'UTF-8');
    $full = mb_strtolower($path . '?' . $query, 'UTF-8');
    $reasons = [];

    $botPatterns = [
        'bot', 'spider', 'crawler', 'slurp', 'bingpreview', 'facebookexternalhit',
        'whatsapp', 'telegrambot', 'googlebot', 'yandex', 'semrush', 'ahrefs',
        'mj12bot', 'dotbot', 'petalbot', 'baiduspider', 'duckduckbot', 'applebot'
    ];
    foreach ($botPatterns as $pattern) {
        if (str_contains($uaLower, $pattern)) {
            $reasons[] = 'ua_bot:' . $pattern;
            break;
        }
    }

    if ($uaLower === '' || $uaLower === 'n/d') {
        $reasons[] = 'ua_ausente';
    }

    if (!in_array($method, ['GET', 'POST', 'HEAD'], true)) {
        $reasons[] = 'metodo_incomum';
    }

    $suspiciousPatterns = [
        '../', '..\\', '<script', 'union select', ' or 1=1', 'wp-admin', 'wp-login',
        'xmlrpc.php', '.env', 'phpmyadmin', 'select%20', '%3cscript', 'cmd=', 'shell',
    ];
    foreach ($suspiciousPatterns as $pattern) {
        if (str_contains($full, $pattern)) {
            $reasons[] = 'payload_suspeito:' . $pattern;
            break;
        }
    }

    $type = 'humano';
    $hasBot = false;
    foreach ($reasons as $reason) {
        if (str_starts_with($reason, 'ua_bot:')) {
            $hasBot = true;
            break;
        }
    }

    if ($hasBot) {
        $type = 'bot';
    }

    foreach ($reasons as $reason) {
        if (str_starts_with($reason, 'payload_suspeito:') || $reason === 'ua_ausente' || $reason === 'metodo_incomum') {
            $type = 'suspeito';
            break;
        }
    }

    return [$type, $reasons];
}

function appendLog(string $file, array $entry): void
{
    $line = json_encode($entry, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if ($line === false) {
        return;
    }
    @file_put_contents($file, $line . PHP_EOL, FILE_APPEND | LOCK_EX);
}

function checkRateLimit(string $key, int $windowSeconds, int $maxAttempts): bool
{
    $file = sys_get_temp_dir() . '/rl_' . md5($key) . '.json';
    $now = time();
    $payload = ['count' => 0, 'reset' => $now + $windowSeconds];

    if (is_file($file)) {
        $stored = json_decode((string)@file_get_contents($file), true);
        if (is_array($stored) && isset($stored['count'], $stored['reset'])) {
            $payload = $stored;
        }
        if ($now > (int)$payload['reset']) {
            $payload = ['count' => 0, 'reset' => $now + $windowSeconds];
        }
    }

    if ((int)$payload['count'] >= $maxAttempts) {
        return false;
    }

    $payload['count'] = (int)$payload['count'] + 1;
    @file_put_contents($file, json_encode($payload, JSON_UNESCAPED_UNICODE), LOCK_EX);
    return true;
}

function loadMailer(): bool
{
    if (is_file(__DIR__ . '/vendor/autoload.php')) {
        require_once __DIR__ . '/vendor/autoload.php';
        return true;
    }

    $required = [
        __DIR__ . '/PHPMailer/src/PHPMailer.php',
        __DIR__ . '/PHPMailer/src/SMTP.php',
        __DIR__ . '/PHPMailer/src/Exception.php',
    ];

    foreach ($required as $file) {
        if (!is_file($file)) {
            return false;
        }
        require_once $file;
    }

    return true;
}

function buildMailer(string $host, int $port, string $user, string $pass, string $fromEmail, string $fromName): PHPMailer
{
    $mail = new PHPMailer(true);
    $mail->CharSet = 'UTF-8';
    $mail->isSMTP();
    $mail->Host = $host;
    $mail->Port = $port;
    $mail->SMTPAuth = true;
    $mail->Username = $user;
    $mail->Password = $pass;
    $mail->SMTPSecure = ($port === 465)
        ? PHPMailer::ENCRYPTION_SMTPS
        : PHPMailer::ENCRYPTION_STARTTLS;
    $mail->setFrom($fromEmail, $fromName);
    return $mail;
}
