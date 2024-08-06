const { MongoClient } = require('mongodb');

const uri = 'mongodb://localhost:27017';
const client = new MongoClient(uri);

async function run() {
    try {
        await client.connect();
        console.log('Connected to MongoDB');

        const db = client.db('zoma'); 
        const collection = db.collection('resto');
        
        const allDocs = await collection.find().toArray();
        console.log('All documents:', JSON.stringify(allDocs, null, 2)); 

       
        const searchQuery = { 'restaurant.name': /Chili's/i }; 
        const searchResults = await collection.find(searchQuery).toArray();
        console.log('Search results:', searchResults);

    } catch (err) {
        console.error('Error:', err);
    } finally {
        await client.close();
    }
}

run();
