// src/database - advanced.ts
import { MongoClient, Db, ClientSession } from 'mongodb';
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const DB_NAME = 'mcp_training';
// Konfigurasi timeout
const TIMEOUT_CONFIG = {
    connectTimeoutMS: 5000, // 5 detik untuk koneksi awal
    socketTimeoutMS: 30000, // 30 detik socket idle
    serverSelectionTimeoutMS: 10000, // 10 detik pilih server
    waitQueueTimeoutMS: 5000 // 5 detik antri koneksi
};
// Konfigurasi retry
const RETRY_CONFIG = {
    maxRetries: 5,
    initialDelayMs: 1000,
    backoffMultiplier: 2
};
let client: MongoClient | null = null;
let db: Db | null = null;
/**
* Structured logger untuk database
*/
export const dbLogger = {
    info: (message: string, meta?: object) => {
        console.error(JSON.stringify({
            level: "INFO",
            module: "database",
            message,
            timestamp: new Date().toISOString(),
            ...meta
        }));
    },
    error: (message: string, error: Error, meta?: object) => {
        console.error(JSON.stringify({
            level: "ERROR",
            module: "database",
            message,
            error: {
                name: error.name,
                message: error.message,
                code: (error as any).code
            },
            timestamp: new Date().toISOString(),
            ...meta
        }));
    },
    warn: (message: string, meta?: object) => {
        console.error(JSON.stringify({
            level: "WARN",
            module: "database",
            message,
            timestamp: new Date().toISOString(),
            ...meta
        }));
    }
};
/**
* Koneksi ke MongoDB dengan retry mechanism
*/
export async function connectWithRetry(): Promise<MongoClient> {
    let lastError: Error;
    for (let attempt = 1; attempt <= RETRY_CONFIG.maxRetries; attempt++) {
        try {
            dbLogger.info(`Connecting to MongoDB (attempt ${attempt}/${RETRY_CONFIG.maxRetries})`);
            const newClient = new MongoClient(MONGODB_URI, TIMEOUT_CONFIG);
            await newClient.connect();
            client = newClient;
            db = client.db(DB_NAME);
            dbLogger.info(`✅ Connected to MongoDB successfully`, {
                attempt,
                database: DB_NAME
            });
            return client;
        } catch (error) {
            lastError = error as Error;
            const delayMs = RETRY_CONFIG.initialDelayMs * Math.pow(RETRY_CONFIG.backoffMultiplier,
                attempt - 1);
            dbLogger.error(`Connection attempt ${attempt} failed`, error as Error, {
                nextRetryMs: attempt < RETRY_CONFIG.maxRetries ? delayMs : null
            });
            if (attempt < RETRY_CONFIG.maxRetries) {
                dbLogger.warn(`Retrying in ${delayMs}ms...`);
                await new Promise(resolve => setTimeout(resolve, delayMs));
            }
        }
    }
    throw new Error(`Failed to connect after ${RETRY_CONFIG.maxRetries} attempts: ${lastError!.message}`);
}
/**
* Mendapatkan instance database (dengan koneksi otomatis)
*/
export async function getDB(): Promise<Db> {
    if (db && client) {
        // Verifikasi koneksi masih hidup dengan ping
        try {
            await db.command({ ping: 1 });
            return db;
        } catch (error) {
            dbLogger.warn("Database connection lost, reconnecting...", {
                error: (error as Error).message
            });
            await reconnect();
            return db!;
        }
    }
    await connectWithRetry();
    return db!;
}

/**
 * Periksa apakah MongoDB saat ini mendukung transaksi.
 * Transaksi MongoDB hanya tersedia pada replica set member atau mongos.
 */
export async function supportsTransactions(): Promise<boolean> {
    try {
        const dbInstance = await getDB();
        const helloResponse = await dbInstance.admin().command({ hello: 1 });
        const isReplicaOrMongos = Boolean(helloResponse.setName || helloResponse.msg === 'isdbgrid');
        if (!isReplicaOrMongos) {
            dbLogger.warn("MongoDB topology does not support transactions", {
                helloResponse
            });
        }
        return isReplicaOrMongos;
    } catch (error) {
        dbLogger.error("Failed to detect transaction support", error as Error);
        return false;
    }
}

/**
* Reconnect jika koneksi terputus
*/
async function reconnect(): Promise<void> {
    dbLogger.info("Attempting to reconnect...");
    if (client) {
        try {
            await client.close();
        } catch (e) {
            // Ignore close error
        }
        client = null;
        db = null;
    }
    await connectWithRetry();
}
/**
* Close database connection
*/
export async function closeDB(): Promise<void> {
    if (client) {
        await client.close();
        client = null;
        db = null;
        dbLogger.info("Database connection closed");
    }
}
// Account interface
export interface Account {
    _id?: any;
    accountId: string;
    owner: string;
    balance: number;
    currency: string;
}
export interface Transaction {
    _id?: any;
    fromAccount: string;
    toAccount: string;
    amount: number;
    currency: string;
    timestamp: Date;
    status: 'pending' | 'completed' | 'failed';
}