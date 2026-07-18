import pool from './src/db/config';
import { searchEvents, getEventById } from './src/services/eventService';

async function main() {
  try {
    console.log('Testing database connection...');
    
    // Test basic query
    const [rows] = await (pool as any).query('SELECT 1 AS test');
    console.log('✓ Connection successful:', rows);

    // Test searchEvents
    console.log('\nSearching all events:');
    const allEvents = await searchEvents('');
    console.log(`Found ${allEvents.length} events:`);
    for (const event of allEvents) {
      console.log(`  - ${event.eventName} @ ${event.courseName}`);
    }

    // Test search with query
    if (allEvents.length > 0) {
      const firstEvent = allEvents[0];
      console.log(`\nSearching for "${firstEvent.eventName.substring(0, 3)}":`);
      const results = await searchEvents(firstEvent.eventName.substring(0, 3));
      console.log(`Found ${results.length} matching events`);

      // Test getEventById
      if (results.length > 0) {
        const event = await getEventById(results[0].id);
        console.log('\nGet by ID:', event?.eventName || 'Not found');
      }
    }

    console.log('\n✓ All tests passed!');
  } catch (error: any) {
    console.error('✗ Error:', error.message);
    process.exit(1);
  } finally {
    await (pool as any).end();
  }
}

main();
