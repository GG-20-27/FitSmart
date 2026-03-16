import { db } from '../db';
import { improvementPlans } from '../../shared/schema';
import { eq } from 'drizzle-orm';

const ADMIN_USER_ID = `whoop_${process.env.ADMIN_WHOOP_ID || '25283528'}`;

async function run() {
  console.log(`Deleting all improvement plans for ${ADMIN_USER_ID}...`);
  const result = await db.delete(improvementPlans).where(eq(improvementPlans.userId, ADMIN_USER_ID));
  console.log('Done.', result);
  process.exit(0);
}

run().catch(e => { console.error(e); process.exit(1); });
