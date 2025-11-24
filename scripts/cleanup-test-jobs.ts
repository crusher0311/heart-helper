#!/usr/bin/env tsx

/**
 * Cleanup script to delete test jobs created during extension testing
 * Usage: npx tsx scripts/cleanup-test-jobs.ts <repair_order_id>
 */

const TEKMETRIC_API_KEY = process.env.TEKMETRIC_API_KEY;
const TEKMETRIC_SHOP_ID = process.env.TEKMETRIC_SHOP_ID || '469'; // Default shop ID from logs

const API_BASE = 'https://shop.tekmetric.com/api/v1';

async function deleteJob(jobId: string, shopId: string): Promise<boolean> {
  try {
    const response = await fetch(
      `${API_BASE}/shops/${shopId}/jobs/${jobId}`,
      {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${TEKMETRIC_API_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (response.ok) {
      return true;
    } else {
      const text = await response.text();
      console.error(`Failed to delete job ${jobId}: ${response.status} - ${text}`);
      return false;
    }
  } catch (error) {
    console.error(`Error deleting job ${jobId}:`, error);
    return false;
  }
}

async function getRepairOrderJobs(repairOrderId: string, shopId: string) {
  try {
    const response = await fetch(
      `${API_BASE}/shops/${shopId}/repair-orders/${repairOrderId}`,
      {
        headers: {
          'Authorization': `Bearer ${TEKMETRIC_API_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Failed to fetch repair order: ${response.status} - ${text}`);
    }

    const data = await response.json();
    return data.jobs || [];
  } catch (error) {
    console.error('Error fetching repair order:', error);
    return [];
  }
}

async function main() {
  const repairOrderId = process.argv[2];
  const shopId = process.argv[3] || TEKMETRIC_SHOP_ID;

  if (!repairOrderId) {
    console.error('Usage: npx tsx scripts/cleanup-test-jobs.ts <repair_order_id> [shop_id]');
    console.error('Example: npx tsx scripts/cleanup-test-jobs.ts 274639316 469');
    process.exit(1);
  }

  if (!TEKMETRIC_API_KEY) {
    console.error('Error: TEKMETRIC_API_KEY environment variable not set');
    process.exit(1);
  }

  console.log(`Fetching jobs for repair order ${repairOrderId}...`);
  
  const jobs = await getRepairOrderJobs(repairOrderId, shopId);
  console.log(`Found ${jobs.length} total jobs`);

  // Find jobs with name "New Job" (case-insensitive)
  const testJobs = jobs.filter((job: any) => 
    job.name?.toLowerCase().trim() === 'new job'
  );

  console.log(`\nFound ${testJobs.length} test jobs to delete:`);
  testJobs.forEach((job: any, index: number) => {
    console.log(`  ${index + 1}. Job ID ${job.id}: "${job.name}"`);
  });

  if (testJobs.length === 0) {
    console.log('\nNo test jobs found. Nothing to delete.');
    return;
  }

  console.log(`\nDeleting ${testJobs.length} test jobs...`);
  
  let successCount = 0;
  let failCount = 0;

  for (const job of testJobs) {
    const success = await deleteJob(job.id, shopId);
    if (success) {
      successCount++;
      console.log(`✓ Deleted job ${job.id}`);
    } else {
      failCount++;
      console.log(`✗ Failed to delete job ${job.id}`);
    }
    
    // Small delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  console.log(`\n=== Cleanup Complete ===`);
  console.log(`Successfully deleted: ${successCount}`);
  console.log(`Failed to delete: ${failCount}`);
  console.log(`Total processed: ${testJobs.length}`);
}

main().catch(console.error);
