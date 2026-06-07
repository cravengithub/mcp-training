// src/security-validator.ts
const path = require('path');
const fs = require('fs').promises;

// ============ KONFIGURASI ============
// Direktori yang diizinkan (whitelist)
const ALLOWED_BASE_DIRS = [
    path.resolve(process.cwd(), 'data'),
    path.resolve(process.cwd(), 'logs'),
    path.resolve(process.cwd(), 'temp')
];
// Path sistem yang diblokir (extra protection)
const FORBIDDEN_PATH_PATTERNS = [
    '/etc',
    '/var',
    '/usr',
    '/boot',
    '/root',
    '/proc',
    '/sys',
    'C:\\Windows',
    'C:\\System32',
    'C:\\Program Files',
    'C:\\Users'
];
// Ekstensi file yang diizinkan (opsional)
const ALLOWED_EXTENSIONS = [
    '.json', '.txt', '.log', '.md', '.csv', '.yml', '.yaml'
];
// ============ FUNGSI VALIDASI ============
/**
* Validasi path untuk keamanan (multiple layers)
*/
async function validateSecurePath(
    requestedPath: string,
    options: {
        checkExtension?: boolean;
        mustExist?: boolean;
        writeOperation?: boolean;
    } = {}
): Promise<{ valid: boolean; error?: string; resolvedPath?: string }> {
    const { checkExtension = false, mustExist = false, writeOperation = false } = options;
    // Layer 1: Cek input kosong
    if (!requestedPath || requestedPath.trim() === '') {
        return { valid: false, error: 'Path cannot be empty' };
    }
    // Layer 2: Normalisasi path
    let normalized: string;
    let resolved: string;
    try {
        normalized = path.normalize(requestedPath);
        // console.log(`Normalized path: ${normalized}`);
        resolved = path.resolve(normalized);
    } catch (error: unknown) {
        return { valid: false, error: `Invalid path format: ${(error as Error).message}` };
    }
    // Layer 3: Cegah path traversal obvious
    if (requestedPath.includes('..') || normalized.includes('..')) {
        return { valid: false, error: 'Path traversal not allowed (..)' };
    }
    // Layer 4: Cek karakter mencurigakan (command injection)
    const suspiciousChars = /[;&|`$<>]/;
    if (suspiciousChars.test(requestedPath)) {
        return { valid: false, error: 'Suspicious characters detected in path' };
    }
    // Layer 5: Cek apakah path di dalam direktori yang diizinkan
    const isInAllowedDir = ALLOWED_BASE_DIRS.some(allowedDir =>
        resolved.startsWith(allowedDir)
    );
    if (!isInAllowedDir) {
        return { valid: false, error: 'Path is outside of allowed directories' };
    }
    // Layer 6: Cek pola path yang diblokir
    const isForbidden = FORBIDDEN_PATH_PATTERNS.some(pattern =>
        resolved.includes(pattern)
    );
    if (isForbidden) {
        return { valid: false, error: 'Path contains forbidden patterns' };
    }   
    // Layer 7: Cek ekstensi file jika diperlukan
    if (checkExtension) {
        const ext = path.extname(resolved).toLowerCase();
        if (!ALLOWED_EXTENSIONS.includes(ext)) {
            return { valid: false, error: `File extension ${ext} is not allowed` };
        }
    }
    // Layer 8: Cek symbolic link (untuk keamanan tambahan)
    try {
        const stat = await fs.lstat(resolved);
        if (stat.isSymbolicLink()) {
            return { valid: false, error: 'Symbolic links are not allowed' };
        }
    } catch (error: unknown) {
        if (mustExist) {
            return { valid: false, error: `Path does not exist: ${(error as Error).message}` };
        }
        // Jika tidak harus ada, kita bisa lanjutkan
    }
    // Layer 9: Validasi filename (tanpa path)
    const filename = path.basename(resolved);
    const invalidFilenameChars = /[<>:"/\\|?*\x00-\x1F]/g;
    if (invalidFilenameChars.test(filename)) {
        return { valid: false, error: 'Filename contains invalid characters' };
    }
    // Cek Ekstensi file jika operasi tulis
    if (writeOperation) {
        const ext = path.extname(resolved).toLowerCase();
        if (!ALLOWED_EXTENSIONS.includes(ext)) {
            return { valid: false, error: `File extension ${ext} is not allowed for write operations` };
        }
    }
    // Layer 10: Cek panjang path (opsional, untuk mencegah DoS)
    if (resolved.length > 4096) {
        return { valid: false, error: 'Path is too long' };
    }
    // Semua cek lolos
    return { valid: true, resolvedPath: resolved };
}

module.exports = { validateSecurePath };

