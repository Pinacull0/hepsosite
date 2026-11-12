<?php

declare(strict_types=1);

use PHPMailer\PHPMailer\PHPMailer;

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, private');
header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: DENY');

function reply(int $code, string $message, array $extra = []): never
{
    http_response_code($code);
    echo json_encode(array_merge(['ok' => $code < 400, 'message' => $message], $extra), JSON_UNESCAPED_UNICODE);
    exit;
}

$method = $_SERVER['REQUEST_METHOD'] ?? '';
if (!in_array($method, ['GET', 'POST'], true)) {
    header('Allow: GET, POST');
    reply(405, 'Método não permitido.');
}

// REMOTE_ADDR is used directly: untrusted forwarding headers cannot bypass the limit.
function rateLimit(string $bucket, int $limit, int $window): void
{
    $directory = sys_get_temp_dir() . '/hepso-careers-' . substr(hash('sha256', __DIR__), 0, 16);
    if ((!is_dir($directory) && !@mkdir($directory, 0700)) || is_link($directory)) {
        reply(503, 'Envio indisponível no momento. Tente mais tarde.');
    }
    $ip = (string)($_SERVER['REMOTE_ADDR'] ?? 'unknown');
    $file = $directory . '/' . hash('sha256', $bucket . '|' . $ip) . '.json';
    if (is_link($file)) reply(503, 'Envio indisponível no momento.');
    $handle = @fopen($file, 'c+');
    if ($handle === false || !flock($handle, LOCK_EX)) reply(503, 'Envio indisponível no momento.');
    @chmod($file, 0600);
    $times = json_decode(stream_get_contents($handle) ?: '[]', true);
    $times = is_array($times) ? array_values(array_filter($times, static fn($time) => is_int($time) && $time > time() - $window)) : [];
    if (count($times) >= $limit) {
        flock($handle, LOCK_UN); fclose($handle);
        header('Retry-After: ' . $window);
        reply(429, 'Muitas tentativas. Aguarde alguns minutos antes de tentar novamente.');
    }
    $times[] = time();
    rewind($handle); ftruncate($handle, 0);
    $written = fwrite($handle, json_encode($times));
    fflush($handle); flock($handle, LOCK_UN); fclose($handle);
    if ($written === false) reply(503, 'Envio indisponível no momento.');
}

// Serve the form and API over HTTPS in production. Only loopback may use HTTP for development.
$local = in_array($_SERVER['REMOTE_ADDR'] ?? '', ['127.0.0.1', '::1'], true);
$https = isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off';
if (!$https && !$local) reply(400, 'Use a conexão HTTPS para enviar seu currículo.');
$publicOrigin = rtrim(getenv('HEPSO_PUBLIC_ORIGIN') ?: 'https://hepso.com.br', '/');
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if ($method === 'POST' && $origin !== '' && !hash_equals($publicOrigin, $origin)) {
    reply(403, 'Origem inválida. Recarregue a página e tente novamente.');
}
if (($_SERVER['HTTP_SEC_FETCH_SITE'] ?? '') === 'cross-site') reply(403, 'Origem inválida.');

$cookiePath = rtrim(str_replace('\\', '/', dirname(dirname($_SERVER['SCRIPT_NAME'] ?? '/api/careers.php'))), '/');
session_name('hepso_careers');
session_start([
    'use_strict_mode' => 1,
    'use_only_cookies' => 1,
    'cookie_httponly' => true,
    'cookie_secure' => $https,
    'cookie_samesite' => 'Strict',
    'cookie_path' => ($cookiePath === '' ? '' : $cookiePath) . '/',
    'gc_maxlifetime' => 1800,
]);
if ($method === 'GET') {
    rateLimit('token', 30, 900);
    if (empty($_SESSION['csrf']) || (int)($_SESSION['issued'] ?? 0) < time() - 1800) {
        session_regenerate_id(true);
        $_SESSION['csrf'] = bin2hex(random_bytes(32));
        $_SESSION['issued'] = time();
    }
    reply(200, 'Formulário disponível.', ['csrf' => $_SESSION['csrf']]);
}

if ((int)($_SERVER['CONTENT_LENGTH'] ?? 0) > 6 * 1024 * 1024) reply(413, 'O PDF deve ter até 5 MB.');
rateLimit('submit', 5, 900);
$token = $_POST['csrf'] ?? null;
if (!is_string($token) || !isset($_SESSION['csrf']) || !hash_equals($_SESSION['csrf'], $token) || (int)($_SESSION['issued'] ?? 0) < time() - 1800) {
    reply(403, 'Sua sessão expirou. Recarregue a página e tente novamente.');
}
if (($_POST['site'] ?? '') !== '' || ($_POST['consent'] ?? null) !== '1') reply(400, 'Confira os campos e o consentimento.');
unset($_SESSION['csrf'], $_SESSION['issued']);
session_write_close();

function field(string $name, int $max): string
{
    $value = $_POST[$name] ?? '';
    if (!is_string($value) || !preg_match('//u', $value) || preg_match('/[\x00-\x1F\x7F]/u', $value)) reply(400, 'Preencha os campos com dados válidos.');
    $value = trim(strip_tags($value));
    if ($value === '' || strlen($value) > $max) reply(400, 'Preencha os campos com dados válidos.');
    return $value;
}
$name = field('nome', 240);
$email = field('email', 254);
$phone = field('telefone', 25);
$area = field('area', 240);
if (!filter_var($email, FILTER_VALIDATE_EMAIL) || !preg_match('/^[+\d\s().-]{10,25}$/D', $phone)) reply(400, 'Confira seu e-mail e telefone.');
$digits = preg_replace('/\D/', '', $phone);
if (strlen($digits) < 10 || strlen($digits) > 13) reply(400, 'Informe o telefone com DDD.');

$file = $_FILES['curriculo'] ?? null;
if (!is_array($file) || !isset($file['error'], $file['tmp_name'], $file['name']) || !is_int($file['error']) || !is_string($file['tmp_name']) || !is_string($file['name'])) reply(400, 'Selecione um currículo em PDF.');
if (in_array($file['error'], [UPLOAD_ERR_INI_SIZE, UPLOAD_ERR_FORM_SIZE], true)) reply(413, 'O PDF deve ter até 5 MB.');
if ($file['error'] !== UPLOAD_ERR_OK || !is_uploaded_file($file['tmp_name'])) reply(400, 'Não foi possível receber o arquivo.');
$path = $file['tmp_name'];
$size = filesize($path);
if ($size === false || $size < 32 || $size > 5 * 1024 * 1024) reply(413, 'Selecione um PDF válido de até 5 MB.');
if (strtolower(pathinfo($file['name'], PATHINFO_EXTENSION)) !== 'pdf') reply(400, 'Somente arquivos PDF são aceitos.');
if (!class_exists('finfo')) reply(503, 'Envio indisponível no momento.');
if ((new finfo(FILEINFO_MIME_TYPE))->file($path) !== 'application/pdf') reply(400, 'O arquivo deve ser um PDF válido.');
$content = file_get_contents($path);
if ($content === false || !preg_match('/^%PDF-(?:1\.[0-7]|2\.0)\b/', $content) || !preg_match('/%%EOF\s*$/D', $content)) reply(400, 'O PDF está inválido ou incompleto.');
// Reject common active/encrypted PDFs in addition to malware scanning. This is a
// defense in depth check, not a claim that a text match can parse every PDF object.
if (preg_match('~/\s*(?:JavaScript|JS|Launch|EmbeddedFile|Filespec|RichMedia|XFA|Encrypt|OpenAction|AA)\b~i', $content)) reply(400, 'Envie um PDF sem senha, anexos ou conteúdo interativo.');
unset($content);

function writeAll($stream, string $data): void
{
    while ($data !== '') {
        $n = fwrite($stream, $data);
        if ($n === false || $n === 0) throw new RuntimeException('scanner_write');
        $data = substr($data, $n);
    }
}
function scanPdf(string $path): void
{
    // INSTREAM sends bytes to local ClamAV; no shell execution and no public upload directory.
    $address = getenv('HEPSO_CLAMAV_SOCKET') ?: 'unix:///run/clamav/clamd.ctl';
    if (!str_starts_with($address, 'unix://') && !preg_match('~^tcp://(?:127\.0\.0\.1|\[::1\]):\d+$~D', $address)) throw new RuntimeException('scanner_config');
    $scanner = @stream_socket_client($address, $errno, $errstr, 5);
    if ($scanner === false) throw new RuntimeException('scanner_unavailable');
    $input = null;
    try {
        stream_set_timeout($scanner, 15);
        writeAll($scanner, "zINSTREAM\0");
        $input = fopen($path, 'rb');
        if ($input === false) throw new RuntimeException('scanner_input');
        while (!feof($input)) {
            $chunk = fread($input, 8192);
            if ($chunk === false) throw new RuntimeException('scanner_read');
            if ($chunk !== '') writeAll($scanner, pack('N', strlen($chunk)) . $chunk);
        }
        writeAll($scanner, pack('N', 0));
        $response = stream_get_line($scanner, 4096, "\0");
        if ($response === false || trim($response) !== 'stream: OK') throw new RuntimeException('scanner_rejected');
    } finally {
        if (is_resource($input)) fclose($input);
        fclose($scanner);
    }
}

try {
    scanPdf($path);
} catch (Throwable $error) {
    error_log('Hepso careers: ' . $error->getMessage());
    reply(422, 'Não foi possível validar o PDF com segurança. Tente novamente mais tarde ou envie outro PDF.');
}

$host = getenv('HEPSO_SMTP_HOST') ?: '';
$user = getenv('HEPSO_SMTP_USER') ?: '';
$pass = getenv('HEPSO_SMTP_PASS') ?: '';
$recipient = getenv('HEPSO_HR_EMAIL') ?: '';
$port = (int)(getenv('HEPSO_SMTP_PORT') ?: '587');
if ($host === '' || $pass === '' || !filter_var($user, FILTER_VALIDATE_EMAIL) || !filter_var($recipient, FILTER_VALIDATE_EMAIL) || !in_array($port, [465, 587], true)) reply(503, 'O envio está indisponível no momento. Tente novamente mais tarde.');
try {
    require_once __DIR__ . '/PHPMailer/src/Exception.php';
    require_once __DIR__ . '/PHPMailer/src/PHPMailer.php';
    require_once __DIR__ . '/PHPMailer/src/SMTP.php';
    $mail = new PHPMailer(true);
    $mail->CharSet = 'UTF-8';
    $mail->isSMTP();
    $mail->Host = $host;
    $mail->Port = $port;
    $mail->SMTPAuth = true;
    $mail->Username = $user;
    $mail->Password = $pass;
    $mail->SMTPSecure = $port === 465 ? PHPMailer::ENCRYPTION_SMTPS : PHPMailer::ENCRYPTION_STARTTLS;
    $mail->Timeout = 20;
    $mail->setFrom($user, 'Hepso — Trabalhe Conosco');
    $mail->addAddress($recipient);
    $mail->addReplyTo($email, $name);
    $mail->Subject = 'Nova candidatura pelo site Hepso';
    $mail->isHTML(false);
    $mail->Body = "Candidatura recebida com consentimento para recrutamento.\n\nNome: {$name}\nE-mail: {$email}\nTelefone: {$phone}\nÁrea: {$area}\n\nRecebida em: " . gmdate('c') . "\nPolítica: https://hepso.com.br/politica-de-privacidade/#curriculos\n";
    $mail->addAttachment($path, 'curriculo.pdf', PHPMailer::ENCODING_BASE64, 'application/pdf');
    $mail->send();
    reply(200, 'Currículo enviado com sucesso.');
} catch (Throwable $error) {
    // Do not log the CV, personal data, credentials or SMTP transcript.
    error_log('Hepso careers: mail delivery failed');
    reply(503, 'Não foi possível enviar agora. Tente novamente mais tarde.');
}
