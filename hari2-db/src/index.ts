#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
    connectDB,
    getAllUsers,
    getUserByEmail,
    seedSampleData,
    closeDB,
    User
} from "./database.js";
// Tambahkan import
import { transferMoney, getBalance, getTransactionHistory } from './transaction-operations.js';
import { getDB } from "./database-advanced.js";

declare const process: {
    on: (event: string, callback: (...args: unknown[]) => void | Promise<void>) => void;
    exit: (code?: number) => never;
};
// Inisialisasi MCP Server
const server = new McpServer({
    name: "mcp-database-server",
    version: "1.0.0"
});
// ============ RESOURCE: Semua Users ============
server.resource(
    "all-users",
    "db://users",
    async (uri) => {
        try {
            // Ambil data dari database
            const users = await getAllUsers();
            // Konversi ke JSON yang rapi
            const usersJson = JSON.stringify(users, (key, value) => {
                // Konversi ObjectId ke string
                if (key === '_id' && value && value.toString) {
                    return value.toString();
                }
                return value;
            }, 2);
            return {
                contents: [{
                    uri: uri.href,
                    mimeType: "application/json",
                    text: usersJson
                }]
            };
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);
            throw new Error(`Failed to read users resource: ${message}`);
        }
    }
);
// ============ RESOURCE: Active Users (Filtered) ============
server.resource(
    "active-users",
    "db://users?status=active",
    async (uri) => {
        try {
            const db = await connectDB();
            const collection = db.collection('users');
            const activeUsers = await collection.find({ active: true }).toArray();
            // Konversi ObjectId ke string
            const processedUsers = activeUsers.map((user: any) => ({
                ...user,
                _id: user._id?.toString()
            }));
            return {
                contents: [{
                    uri: uri.href,
                    mimeType: "application/json",
                    text: JSON.stringify(processedUsers, null, 2)
                }]
            };
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);
            throw new Error(`Failed to read active users: ${message}`);
        }
    }
);
// ============ RESOURCE: User by Email (Dynamic) ============
server.resource(
    "user-by-email",
    "db://users/email/{email}",
    async (uri, params) => {
        // Ekstrak email dari URI params
        const email = (params as any)?.email as string;
        if (!email) {
            throw new Error("Email parameter is required");
        }
        try {
            const user = await getUserByEmail(email);
            if (!user) {
                return {
                    contents: [{
                        uri: uri.href,
                        mimeType: "text/plain",
                        text: `User with email ${email} not found`
                    }]
                };
            }
            // Konversi ObjectId ke string
            const processedUser: any = { ...user };
            if (processedUser._id) {
                processedUser._id = processedUser._id.toString();
            }
            return {
                contents: [{
                    uri: uri.href,
                    mimeType: "application/json",
                    text: JSON.stringify(processedUser, null, 2)
                }]
            };
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);
            throw new Error(`Failed to fetch user: ${message}`);
        }
    }
);
// ============ RESOURCE: Large Data dengan Pagination ============
server.resource(
    "large-data",
    "db://large_data{?page,limit}",
    async (uri, params) => {
        const page = parseInt((params as any)?.page as string) || 1;
        const limit = parseInt((params as any)?.limit as string) || 200;
        // Validasi limit (maks 200)
        const safeLimit = Math.min(limit, 200);
        const skip = (page - 1) * safeLimit;
        const startTime = Date.now();
        try {
            const db = await getDB();
            const collection = db.collection('large_data');
            // Get total count untuk informasi pagination
            const totalCount = await collection.countDocuments();
            // Query dengan pagination dan projection
            const data = await collection.find({}, {
                projection: {
                    id: 1,
                    name: 1,
                    email: 1,
                    age: 1,
                    city: 1,
                    score: 1,
                    createdAt: 1
                    // Exclude metadata untuk mengurangi payload
                }
            })
                .sort({ id: 1 })
                .skip(skip)
                .limit(safeLimit)
                .toArray();
            const duration = Date.now() - startTime;
            // Log performance
            console.error(`⏱️ Query
large_data:
page=${page},
limit=${safeLimit},
returned=${data.length}, total=${totalCount}, took=${duration}ms`);
            const totalPages = Math.ceil(totalCount / safeLimit);
            return {
                contents: [{
                    uri: uri.href,
                    mimeType: "application/json",
                    text: JSON.stringify({
                        pagination: {
                            page,
                            limit: safeLimit,
                            total: totalCount,
                            totalPages,
                            hasNext: page < totalPages,
                            hasPrev: page > 1
                        },
                        performance: {
                            queryTimeMs: duration,
                            timestamp: new Date().toISOString()
                        },
                        data
                    }, null, 2)
                }]
            };
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);
            console.error(`❌ Error reading large_data:`, error);
            throw new Error(`Failed to read large data: ${message}`);
        }
    }
);
// Simple in-memory cache
const cache = new Map();
const CACHE_TTL = 60000; // 60 detik
server.resource(
    "large-data-cached",
    "db://large_data/cached",
    async (uri) => {
        // Extract query parameters from URI
        const searchParams = new URL(uri.href).searchParams;
        const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
        const limit = Math.max(1, Math.min(1000, parseInt(searchParams.get('limit') || '50')));
        
        const cacheKey = `large_data_cached_p${page}_l${limit}`;
        // Cek cache
        if (cache.has(cacheKey)) {
            const cached = cache.get(cacheKey);
            if (Date.now() - cached.timestamp < CACHE_TTL) {
                console.error(`✅ Cache hit for ${cacheKey}`);
                return cached.data;
            }
        }
        // Query database (sama seperti sebelumnya)
        const db = await getDB();
        const collection = db.collection('large_data');
        const skip = (page - 1) * limit;
        const totalCount = await collection.countDocuments();
        const data = await collection
            .find({})
            .sort({ id: 1 })
            .skip(skip)
            .limit(limit)
            .toArray();
        const dataToCache = {
            pagination: {
                page,
                limit,
                total: totalCount,
                totalPages: Math.ceil(totalCount / limit),
                hasNext: page < Math.ceil(totalCount / limit),
                hasPrev: page > 1
            },
            data
        };
        // Simpan ke cache
        cache.set(cacheKey, {
            data: dataToCache, timestamp: Date.now()
        });
        return {
            contents: [{
                uri: uri.href,
                mimeType: "application/json",
                text: JSON.stringify(dataToCache, null, 2)
            }]
        };
    }
);

// ============ RESOURCE: Statistik Data Besar ============
server.resource(
    "large-data-stats",
    "db://large_data/stats",
    async (uri) => {
        const startTime = Date.now();
        try {
            const db = await getDB();
            const collection = db.collection('large_data');
            // Multiple aggregations in parallel for performance
            const [totalCount, cityStats, ageStats] = await Promise.all([
                collection.countDocuments(),
                collection.aggregate([
                    { $group: { _id: "$city", count: { $sum: 1 } } },
                    { $sort: { count: -1 } }
                ]).toArray(),
                collection.aggregate([
                    {
                        $group: {
                            _id: null,
                            minAge: { $min: "$age" },
                            maxAge: { $max: "$age" },
                            avgAge: { $avg: "$age" }
                        }
                    }
                ]).toArray()
            ]);
            const duration = Date.now() - startTime;
            console.error(`⏱️ Stats query took ${duration}ms`);
            return {
                contents: [{
                    uri: uri.href,
                    mimeType: "application/json",
                    text: JSON.stringify({
                        totalRecords: totalCount,
                        statistics: {
                            byCity: cityStats,
                            ageRange: ageStats[0] || {},
                            queryTimeMs: duration
                        }
                    }, null, 2)
                }]
            };
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);
            throw new Error(`Failed to get stats: ${message}`);
        }
    }
);


// ============ TOOL: Ping (Opsional) ============
server.tool("ping", "Health check", async () => ({
    content: [{ type: "text", text: "pong" }]
}));

// Tambahkan tool "transfer" ke server
server.tool(
    "transfer",
    "Transfer money between accounts",
    {
        fromAccount: z.string().describe("Account ID of sender"),
        toAccount: z.string().describe("Account ID of recipient"),
        amount: z.number().positive().describe("Amount to transfer"),
        currency: z.string().optional().default("IDR").describe("Currency (default: IDR)")
    },
    async ({ fromAccount, toAccount, amount, currency }) => {
        try {
            const result = await transferMoney(fromAccount, toAccount, amount, currency);
            if (result.success) {
                // Ambil saldo baru untuk konfirmasi
                const newBalance = await getBalance(fromAccount);
                return {
                    content: [{
                        type: "text",
                        text: `${result.message}\nNew balance for ${fromAccount}: ${newBalance} ${currency}`
                    }]
                };
            } else {
                return {
                    content: [{
                        type: "text",
                        text: `❌ Transfer failed: ${result.message}`
                    }]
                };
            }
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);
            return {
                content: [{
                    type: "text",
                    text: `❌ Error: ${message}`
                }]
            };
        }
    }
);
// Tool untuk cek saldo
server.tool(
    "balance",
    "Check account balance",
    { accountId: z.string().describe("Account ID to check") },
    async ({ accountId }) => {
        try {
            const balance = await getBalance(accountId);
            if (balance === null) {
                return { content: [{ type: "text", text: `Account ${accountId} not found` }] };
            }
            return { content: [{ type: "text", text: `Balance for ${accountId}: ${balance} IDR` }] };
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);
            return { content: [{ type: "text", text: `Error: ${message}` }] };
        }
    }
);

// ============ MAIN ============
async function main() {
    try {
        // 1. Koneksi ke database
        console.error("📡 Connecting to MongoDB...");
        await connectDB();
        // 2. Seed sample data jika perlu
        console.error("🌱 Seeding sample data...");
        await seedSampleData();
        // 3. Start MCP Server
        const transport = new StdioServerTransport();
        await server.connect(transport);
        console.error("✅ MCP Database Server is running");
        console.error("📁 Available resources:");
        console.error(" - db://users (all users)");
        console.error(" - db://users?status=active (active only)");
        console.error(" - db://users/email/{email} (by email)");
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        console.error("❌ Failed to start server:", message);
        process.exit(1);
    }
}
// Handle graceful shutdown
process.on('SIGINT', async () => {
    console.error("\n🛑 Shutting down...");
    await closeDB();
    process.exit(0);
});
main().catch(console.error);