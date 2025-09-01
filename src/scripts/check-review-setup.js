require('dotenv').config();
const { Restaurant, ReviewNotification } = require('../models');

async function checkSetup() {
  console.log('\n=== REVIEW MONITORING DIAGNOSE ===\n');
  
  // 1. Check Google API Key
  console.log('1️⃣ Google API Key:');
  console.log(`   ${process.env.GOOGLE_PLACES_API_KEY ? '✅ GESETZT' : '❌ FEHLT'}`);
  
  // 2. Check Restaurants
  console.log('\n2️⃣ Restaurants mit google_place_id:');
  const restaurants = await Restaurant.findAll({
    where: { is_active: true }
  });
  
  let hasPlaceId = 0;
  for (const r of restaurants) {
    console.log(`\n   ${r.name}:`);
    console.log(`   - ID: ${r.id}`);
    console.log(`   - google_place_id: ${r.google_place_id || '❌ NICHT GESETZT'}`);
    console.log(`   - google_review_url: ${r.google_review_url || 'nicht gesetzt'}`);
    console.log(`   - last_review_count: ${r.last_review_count || 0}`);
    console.log(`   - last_review_check: ${r.last_review_check || 'nie'}`);
    
    if (r.google_place_id) hasPlaceId++;
  }
  
  console.log(`\n   📊 ${hasPlaceId} von ${restaurants.length} haben eine google_place_id`);
  
  // 3. Check Review Notifications
  console.log('\n3️⃣ Letzte Review-Benachrichtigungen:');
  const notifications = await ReviewNotification.findAll({
    limit: 5,
    order: [['created_at', 'DESC']]
  });
  
  if (notifications.length === 0) {
    console.log('   ❌ Keine Review-Benachrichtigungen gefunden');
  } else {
    notifications.forEach(n => {
      console.log(`   - ${n.review_author}: ${n.review_rating}⭐ am ${n.review_time}`);
    });
  }
  
  // 4. Test Google Places API
  if (process.env.GOOGLE_PLACES_API_KEY && hasPlaceId > 0) {
    console.log('\n4️⃣ Teste Google Places API:');
    const testRestaurant = restaurants.find(r => r.google_place_id);
    
    if (testRestaurant) {
      try {
        const axios = require('axios');
        const response = await axios.get(
          'https://maps.googleapis.com/maps/api/place/details/json',
          {
            params: {
              place_id: testRestaurant.google_place_id,
              fields: 'rating,user_ratings_total',
              key: process.env.GOOGLE_PLACES_API_KEY
            }
          }
        );
        
        console.log(`   API Response Status: ${response.data.status}`);
        if (response.data.result) {
          console.log(`   Rating: ${response.data.result.rating}`);
          console.log(`   Total Reviews: ${response.data.result.user_ratings_total}`);
        }
      } catch (error) {
        console.log(`   ❌ API Error: ${error.message}`);
      }
    }
  }
  
  process.exit(0);
}

checkSetup().catch(console.error);