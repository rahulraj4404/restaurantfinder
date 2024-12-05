const express = require('express');
const { MongoClient, ObjectId } = require('mongodb');
const path = require('path');

const app = express();
const port = 5001;
const { performance } = require('perf_hooks');
const mongoUri = 'mongodb://localhost:27017';
const dbName = 'zoma';
const collectionName = 'resto';

const client = new MongoClient(mongoUri);
let db;

async function connectToMongo() {
    try {
        if (!db) {
            await client.connect();
            db = client.db(dbName);
            console.log("Connected to MongoDB");
        }
    } catch (err) {
        console.error(`Failed to connect to MongoDB: ${err}`);
        process.exit(1); 
    }
}

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));

async function fetchRestaurants(query = '', cuisine = '', averageSpend = '', city = '', page = 1, pageSize = 15) {
    try {
      
        const collection = db.collection(collectionName);

        let searchQuery = {};
        if (query) {
            const idQuery = ObjectId.isValid(query) ? new ObjectId(query) : null;
            if (idQuery) {
                searchQuery = { _id: idQuery };
            } else {
                searchQuery = {
                    $or: [
                        { 'restaurant.id': query },
                        { 'restaurant.name': new RegExp(query, 'i') }
                    ]
                };
            }
        }

        if (cuisine) {
            searchQuery['restaurant.cuisines'] = { $regex: new RegExp(cuisine, 'i') };
        }

        if (averageSpend) {
            searchQuery['restaurant.average_cost_for_two'] = { $lte: parseFloat(averageSpend) };
        }

        if (city) {
            searchQuery['restaurant.location.city'] = { $regex: new RegExp(city, 'i') };
        }

        // console.log('Search query:', searchQuery);
        const skip = (page - 1) * pageSize;
        const restaurants = await collection.find(searchQuery).skip(skip).limit(pageSize).toArray();

        const totalRestaurants = await collection.countDocuments(searchQuery);
        const totalPages = Math.ceil(totalRestaurants / pageSize);

        // console.log('Search results:', restaurants);
        return { restaurants, totalPages };
    } catch (err) {
        console.error(`Failed to fetch data: ${err}`);
        return { restaurants: [], totalPages: 0 };
    }
}
const restaurant_memcache = new Map();
const maxsize = 50;
async function fetchRestaurantById(id) {
  try {
        let startTime, endTime;
        startTime = performance.now();
        if (restaurant_memcache.has(id)) {
            const restaurant = restaurant_memcache.get(id);
            restaurant_memcache.delete(id); 
            restaurant_memcache.set(id, restaurant);
            endTime = performance.now();
            console.log(`Cache retrieval time: ${(endTime - startTime).toFixed(2)} ms`);
            return restaurant;
        }
      startTime = performance.now();
      const collection = db.collection(collectionName);
      const restaurant = await collection.findOne({ 'restaurant.id': id });
      endTime = performance.now();
      console.log(`Database retrieval time: ${(endTime - startTime).toFixed(2)} ms`);


      if (restaurant) {
            if (restaurant_memcache.size >= maxsize) {
                const firstKey = restaurant_memcache.keys().next().value;
                restaurant_memcache.delete(firstKey);
            }
            restaurant_memcache.set(id, restaurant);
        }
        // console.log('Fetched restaurant by ID:', restaurant);
        return restaurant;
    } catch (err) {
        console.error(`Failed to fetch data: ${err}`);
        return null;
    }
}

app.get('/', async (req, res) => {
    await connectToMongo();
    const query = req.query.query || '';
    const cuisine = req.query.cuisine || '';
    const averageSpend = req.query.average_spend || '';
    const city = req.query.city || '';
    const page = parseInt(req.query.page) || 1;
    const { restaurants, totalPages } = await fetchRestaurants(query, cuisine, averageSpend, city, page);
    res.render('index', { restaurants, query, cuisine, averageSpend, city, page, totalPages });
}); 

app.get('/webapi', async (req, res) => {
    await connectToMongo();
    const query = req.query.query || '';
    const cuisine = req.query.cuisine || '';
    const averageSpend = req.query.average_spend || '';
    const city = req.query.city || '';
    const page = parseInt(req.query.page) || 1;
    const { restaurants, totalPages } = await fetchRestaurants(query, cuisine, averageSpend, city, page);
    res.json(restaurants);  
}); 

app.get('/search', async (req, res) => {
    await connectToMongo();
    const query = req.query.query || '';
    const cuisine = req.query.cuisine || '';
    const averageSpend = req.query.average_spend || '';
    const city = req.query.city || '';
    const page = parseInt(req.query.page) || 1;
    const { restaurants, totalPages } = await fetchRestaurants(query, cuisine, averageSpend, city, page);
    res.render('index', { restaurants, query, cuisine, averageSpend, city, page, totalPages });
});


app.get('/restaurant/:id', async (req, res) => {
    await connectToMongo();
    const restaurant = await fetchRestaurantById(req.params.id);
    if (!restaurant) {
        return res.status(404).send('Restaurant not found');
    }
    res.render('restaurant', { restaurant });
});

app.get('/webapi/restaurant/:id', async (req, res) => {
    await connectToMongo();
    const restaurant = await fetchRestaurantById(req.params.id);
    if (!restaurant) {
        return res.status(404).send('Restaurant not found');
    }
    res.json(restaurant);  
}); 

app.post('/submitreview', async (req, res) => {
    await connectToMongo();
    const { restaurant_id, username, rating, review } = req.body;

    if (!restaurant_id || !username || !rating || !review) {
        return res.status(400).send('Missing required fields');
    }
    try {
        const collection = db.collection(collectionName);
        await collection.updateOne(
            { 'restaurant.id': restaurant_id },
            { $push: { reviews: { username, rating, review } } }
        );
        res.redirect(`/restaurant/${restaurant_id}`);
    } catch (error) {
        console.error(error);
        res.status(500).send('Internal Server Error');
    }
});

app.listen(port, () => {
    console.log(`Server is running at http://localhost:${port}`);
});
