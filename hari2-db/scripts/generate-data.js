// scripts/generate-data.js
const { MongoClient } = require('mongodb');
const uri = 'mongodb://localhost:27017';
const client = new MongoClient(uri);
async function generateLargeData() {
    try {
        await client.connect();
        const db = client.db('mcp_training');
        const collection = db.collection('large_data');
        // Hapus data lama
        await collection.deleteMany({});
        console.log('Cleared existing data');
        // Generate 1500 record
        const records = [];
        for (let i = 1; i <= 1500; i++) {
            records.push({
                id: i,
                name: `User ${i}`,
                email: `user${i}@example.com`,
                age: 20 + (i % 50),
                city: ['Jakarta', 'Surabaya', 'Bandung', 'Medan', 'Semarang'][i % 5],
                score: Math.floor(Math.random() * 1000),
                createdAt: new Date(Date.now() - i * 86400000),
                metadata: {
                    lastLogin: new Date(),
                    preferences: {
                        theme: i % 2 === 0 ? 'dark' : 'light',
                        notifications: i % 3 === 0
                    }
                }
            });
            // Insert in batches of 100 to avoid memory issues
            if (records.length === 100) {
                await collection.insertMany(records);
                console.log(`Inserted ${i} records...`);
                records.length = 0;
            }
        }
        // Insert remaining records
        if (records.length > 0) {
            await collection.insertMany(records);
        }
        // Create index untuk optimasi
        await collection.createIndex({ id: 1 });
        await collection.createIndex({ city: 1 });
        await collection.createIndex({ age: 1 });
        const count = await collection.countDocuments();
        console.log(`✅ Successfully generated ${count} records`);
    } catch (error) {
        console.error('Error:', error);
    } finally {
        await client.close();
    }
}
generateLargeData();