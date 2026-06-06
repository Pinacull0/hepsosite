<?php

declare(strict_types=1);

use PHPMailer\PHPMailer\Exception;
use PHPMailer\PHPMailer\PHPMailer;

header('Content-Type: text/plain; charset=utf-8');

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    http_response_code(405);
    exit('Método não permitido.');
}

if (!loadMailer()) {
    http_response_code(500);
    exit('Erro: PHPMailer não encontrado.');
}

// ========== CONFIG ==========
$SMTP_HOST = 'smtp.hepso.com.br';
$SMTP_PORT = 587;
$SMTP_USER = 'comercial@hepso.com.br';
$SMTP_PASS = 'SENHA_AQUI';
$FROM_EMAIL = $SMTP_USER;
$FROM_NAME = 'Hepso';
// E-mail do gestor (recebe todos os avisos internos)
$MANAGER_EMAIL = 'comercial@hepso.com.br';
$MANAGER_NAME = 'Comercial Hepso';

$pdfCandidates = [
    __DIR__ . '/../private/Catalogo-Hepso.pdf',
    __DIR__ . '/../assets/Catalogo_especial_unificado.pdf',
    __DIR__ . '/../assets/CATALOGO-HEPSO-RACKS-PISO.pdf',
];

$SUBJECT = 'Catálogo Hepso — PDF';
$HTML_BODY = '<p>Olá!</p><p>Segue em anexo o <strong>Catálogo Hepso</strong> com especificações e medidas.</p><p>Se precisar de ajuda, basta responder este e-mail.</p><p>Atenciosamente,<br>Equipe Hepso</p>';
// ===========================

if (!empty($_POST['site'] ?? '')) {
    http_response_code(400);
    exit('Falha na validação.');
}
if (isset($_POST['consent']) && empty($_POST['consent'])) {
    http_response_code(400);
    exit('É necessário aceitar as políticas do site.');
}

// E-mail do cliente (digitado no site)
$recipientEmail = sanitizeEmail((string)($_POST['email'] ?? ''));
if ($recipientEmail === null) {
    http_response_code(400);
    exit('E-mail inválido.');
}

$requesterEmail = sanitizeEmail((string)($_POST['requester_email'] ?? $recipientEmail)) ?? $recipientEmail;
$requesterName = sanitizeText((string)($_POST['requester_name'] ?? 'Visitante'), 120);

$pdfPath = resolveExistingFile($pdfCandidates);
if ($pdfPath === null) {
    http_response_code(500);
    exit('Arquivo PDF não encontrado.');
}

$clientIp = getClientIp();
$userAgent = sanitizeText((string)($_SERVER['HTTP_USER_AGENT'] ?? 'N/D'), 300);
$origin = sanitizeText((string)($_SERVER['HTTP_ORIGIN'] ?? ''), 250);
$referer = sanitizeText((string)($_SERVER['HTTP_REFERER'] ?? ''), 500);

if (!checkRateLimit('send_mail_' . $clientIp . '_' . md5($recipientEmail), 10 * 60, 8)) {
    http_response_code(429);
    exit('Muitas tentativas. Tente mais tarde.');
}

try {
    $mail = buildMailer($SMTP_HOST, $SMTP_PORT, $SMTP_USER, $SMTP_PASS, $FROM_EMAIL, $FROM_NAME);
    $mail->addAddress($recipientEmail);
    $mail->addReplyTo($requesterEmail, $requesterName);
    $mail->isHTML(true);
    $mail->Subject = $SUBJECT;
    $mail->Body = $HTML_BODY;
    $mail->AltBody = htmlToText($HTML_BODY);
    $mail->addAttachment($pdfPath, basename($pdfPath), PHPMailer::ENCODING_BASE64, 'application/pdf');
    $mail->send();

    // E-mail interno de aviso do envio
    $notify = buildMailer($SMTP_HOST, $SMTP_PORT, $SMTP_USER, $SMTP_PASS, $FROM_EMAIL, $FROM_NAME);
    $notify->addAddress($MANAGER_EMAIL, $MANAGER_NAME);
    $notify->isHTML(true);
    $notify->Subject = 'Aviso: catálogo enviado';
    $notify->Body =
        '<h3>Envio de catálogo realizado</h3>' .
        '<p><strong>E-mail do cliente (site):</strong> ' . htmlspecialchars($recipientEmail, ENT_QUOTES, 'UTF-8') . '</p>' .
        '<p><strong>Solicitante:</strong> ' . htmlspecialchars($requesterName, ENT_QUOTES, 'UTF-8') . ' (' . htmlspecialchars($requesterEmail, ENT_QUOTES, 'UTF-8') . ')</p>' .
        '<p><strong>IP:</strong> ' . htmlspecialchars($clientIp, ENT_QUOTES, 'UTF-8') . '</p>' .
        '<p><strong>User-Agent:</strong> ' . htmlspecialchars($userAgent, ENT_QUOTES, 'UTF-8') . '</p>' .
        '<p><strong>Origem:</strong> ' . htmlspecialchars($origin ?: 'N/D', ENT_QUOTES, 'UTF-8') . '</p>' .
        '<p><strong>Referer:</strong> ' . htmlspecialchars($referer ?: 'N/D', ENT_QUOTES, 'UTF-8') . '</p>' .
        '<p><strong>Arquivo enviado:</strong> ' . htmlspecialchars(basename($pdfPath), ENT_QUOTES, 'UTF-8') . '</p>';
    $notify->AltBody =
        "Envio de catálogo realizado\n" .
        "E-mail do cliente (site): {$recipientEmail}\n" .
        "Solicitante: {$requesterName} ({$requesterEmail})\n" .
        "IP: {$clientIp}\n" .
        "User-Agent: {$userAgent}\n" .
        "Origem: " . ($origin ?: 'N/D') . "\n" .
        "Referer: " . ($referer ?: 'N/D') . "\n" .
        "Arquivo enviado: " . basename($pdfPath);
    $notify->send();

    http_response_code(200);
    exit('Enviado ✔');
} catch (Exception $e) {
    error_log('MAIL ERROR(send.php): ' . $e->getMessage());
    http_response_code(500);
    exit('Não foi possível enviar o e-mail agora. Tente novamente.');
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

function sanitizeEmail(string $email): ?string
{
    $email = trim($email);
    if ($email === '' || preg_match('/[\r\n]/', $email)) {
        return null;
    }

    $valid = filter_var($email, FILTER_VALIDATE_EMAIL);
    return $valid ? mb_strtolower($valid, 'UTF-8') : null;
}

function sanitizeText(string $value, int $maxLen): string
{
    $value = trim($value);
    $value = preg_replace('/[\x00-\x1F\x7F]/u', '', $value) ?? '';
    if (mb_strlen($value, 'UTF-8') > $maxLen) {
        $value = mb_substr($value, 0, $maxLen, 'UTF-8');
    }
    return $value;
}

function resolveExistingFile(array $paths): ?string
{
    foreach ($paths as $path) {
        if (is_file($path) && is_readable($path)) {
            return $path;
        }
    }
    return null;
}

function htmlToText(string $html): string
{
    $text = preg_replace('/<br\s*\/?>/i', "\n", $html) ?? $html;
    return trim(strip_tags($text));
}

function getClientIp(): string
{
    $keys = ['HTTP_CF_CONNECTING_IP', 'HTTP_X_FORWARDED_FOR', 'REMOTE_ADDR'];
    foreach ($keys as $key) {
        $raw = $_SERVER[$key] ?? '';
        if ($raw === '') {
            continue;
        }

        $parts = array_map('trim', explode(',', $raw));
        foreach ($parts as $ip) {
            if (filter_var($ip, FILTER_VALIDATE_IP)) {
                return $ip;
            }
        }
    }
    return '0.0.0.0';
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
