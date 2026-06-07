// src/database.ts
import { MongoClient, Db, Collection } from 'mongodb';
// Konfigurasi MongoDB
const processEnv = (globalThis as any).process?.env as { [key: string]: string | undefined } | undefined;
const MONGODB_URI = processEnv?.MONGODB_URI || 'mongodb://localhost:27017';
const DB_NAME = 'mcp_training';
// Interface untuk User
export interface User {
    _id?: any;
    name: string;
    email: string;
    role: 'developer' | 'designer' | 'manager' | 'admin';
    active: boolean;
    createdAt?: Date;
}
let client: MongoClient | null = null;
let db: Db | null = null;
/**
* Koneksi ke MongoDB
*/
export async function connectDB(): Promise<Db> {
    if (db) return db;
    try {
        client = new MongoClient(MONGODB_URI);
        await client.connect();
        db = client.db(DB_NAME);
        console.error('✅ Connected to MongoDB');
        return db;
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        console.error('❌ MongoDB connection error:', error);
        throw new Error(`Failed to connect to database: ${message}`);
    }
}
/**
* Mendapatkan koleksi users
*/
export async function getUsersCollection(): Promise<Collection<User>> {
    const database = await connectDB();
    return database.collection<User>('users');
}
/**
* Mendapatkan semua users
*/
export async function getAllUsers(): Promise<User[]> {
    try {
        const collection = await getUsersCollection();
        const users = await collection.find({}).toArray();
        return users;
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        console.error('Error fetching users:', error);
        throw new Error(`Failed to fetch users: ${message}`);
    }
}
/**
* Mendapatkan user berdasarkan email
*/
export async function getUserByEmail(email: string): Promise<User | null> {
    try {
        const collection = await getUsersCollection();
        return await collection.findOne({ email });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        console.error('Error fetching user by email:', error);
        throw new Error(`Failed to fetch user: ${message}`);
    }
}
/**
* Insert sample data (untuk inisialisasi)
*/
export async function seedSampleData(): Promise<void> {
    try {
        const collection = await getUsersCollection();
        // Cek apakah sudah ada data
        const count = await collection.countDocuments();
        if (count > 0) {
            console.error('📁 Sample data already exists, skipping seed');
            return;
        }
        const sampleUsers: User[] = [
            {
                name: "Budi Santoso", email: "budi@example.com", role: "developer", active: true,
                createdAt: new Date()
            },
            {
                name: "Siti Nurhaliza", email: "siti@example.com", role: "designer", active: true,
                createdAt: new Date()
            },
            {
                name: "Agus Wijaya", email: "agus@example.com", role: "manager", active: false, createdAt:
                    new Date()
            },
            {
                name: "Dewi Purnama", email: "dewi@example.com", role: "developer", active: true,
                createdAt: new Date()
            },
            {
                name: "Eko Prasetyo", email: "eko@example.com", role: "admin", active: true, createdAt:
                    new Date()
            }
        ];
        await collection.insertMany(sampleUsers);
        console.error('🌱 Sample data seeded successfully');
    } catch (error) {
        console.error('Error seeding data:', error);
    }
}
/**
* Tutup koneksi database
*/
export async function closeDB(): Promise<void> {
    if (client) {
        await client.close();
        client = null;
        db = null;
        console.error('🔒 MongoDB connection closed');
    }
}