import assert from 'node:assert/strict';
import { getTemplateRequirements } from '../services/scribe/templateRequirements';

const PRACTICE_A = '77777777-7777-7777-7777-777777777777';
const PRACTICE_B = '88888888-8888-8888-8888-888888888888';
const TEMPLATE_A = '5939f5e5-38d8-4f38-8172-d82754c431fe';

function createMockPool(rows: unknown[]) {
  return {
    query: async () => ({ rows }),
  };
}

async function testRejectsTemplateFromOtherPractice() {
  const pool = createMockPool([]);

  await assert.rejects(
    () => getTemplateRequirements(pool as never, PRACTICE_B, TEMPLATE_A),
    (err: unknown) =>
      err instanceof Error && err.message.includes('No matching scribe template')
  );
}

async function testAcceptsTemplateForMatchingPractice() {
  const pool = createMockPool([
    {
      id: TEMPLATE_A,
      practice_id: PRACTICE_A,
      firebase_template_id: null,
      name: 'Clerking Sheet',
      output_format: 'markdown',
    },
  ]);

  const result = await getTemplateRequirements(pool as never, PRACTICE_A, TEMPLATE_A);
  assert.equal(result.resolvedTemplateId, TEMPLATE_A);
}

async function run() {
  await testRejectsTemplateFromOtherPractice();
  await testAcceptsTemplateForMatchingPractice();
  console.log('scribe-practice-scope.test.ts: all assertions passed');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
