// src/logger.ts
import pino from 'pino';

// Konfigurasi log level dari environment variable
const logLevel = process.env.LOG_LEVEL || 'info';

// Konfigurasi apakah pretty print (development) atau JSON (production)
const isDevelopment = process.env.NODE_ENV !== 'production';

// Buat logger instance
export const logger = pino({
    level: logLevel,
    // Format timestamp ISO
    timestamp: pino.stdTimeFunctions.isoTime,
    // Formatter untuk custom fields
    formatters: {
        level: (label) => {
            return { level: label.toUpperCase() };
        },
        bindings: (bindings) => {
            return { pid: bindings.pid, hostname: bindings.hostname };
        }
    },
    // Pretty print hanya di development
    transport: isDevelopment ? {
        target: 'pino-pretty',
        options: {
            colorize: true,
            translateTime: 'SYS:standard',
            ignore: 'pid,hostname'
        }
    } : undefined
});

// Export child logger untuk konteks tertentu
export function createChildLogger(context: Record<string, unknown>) {
    return logger.child(context);
}

// Export utility untuk log dengan metadata
export function logAPIRequest(method: string, url: string, durationMs: number) {
    logger.info({ method, url, durationMs }, 'API request completed');
}

export function logToolCall(toolName: string, params: Record<string, unknown>, durationMs: number) {
    logger.info({ toolName, params, durationMs }, 'Tool called');
}

export function logError(error: Error, context?: Record<string, unknown>) {
    logger.error({
        error: {
            message: error.message,
            stack: error.stack,
            name: error.name
        },
        ...context
    }, 'Error occurred');
}

