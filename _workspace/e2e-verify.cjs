/* E2E backend flow verification via real Supabase session cookies.
 * Signs in the test account, captures the auth cookies exactly as @supabase/ssr
 * would write them, then replays them against the running dev server (:5000).
 */
const fs = require('fs');
const path = require('path');
const { createServerClient } = require('@supabase/ssr');

// load .env.local
const envPath = path.join(__dirname, '..', '.env.local');
for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2];
}

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const BASE = 'http://localhost:5000';
const CURRICULUM_ID = 'fea18341-9902-4b33-a61f-dc9c561a515c';

// in-memory cookie jar
let jar = {}; // name -> value (raw storage value)

function makeClient() {
  return createServerClient(URL, ANON, {
    cookies: {
      getAll() {
        return Object.entries(jar).map(([name, value]) => ({ name, value }));
      },
      setAll(list) {
        for (const { name, value } of list) {
          if (value === '' ) delete jar[name];
          else jar[name] = value;
        }
      },
    },
  });
}

function cookieHeader() {
  return Object.entries(jar)
    .map(([n, v]) => `${n}=${encodeURIComponent(v)}`)
    .join('; ');
}

async function call(method, p, body) {
  const res = await fetch(BASE + p, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Cookie: cookieHeader(),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json;
  const text = await res.text();
  try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, json };
}

(async () => {
  const supabase = makeClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: 'codingnplay@gmail.com',
    password: 'test1234',
  });
  if (error) { console.error('SIGNIN FAILED:', error.message); process.exit(1); }
  console.log('=== SIGNIN OK ===  user:', data.user.id);
  console.log('cookies captured:', Object.keys(jar).join(', '));

  // STEP 2: has-diagnostic
  console.log('\n=== GET /api/curricula/:id/has-diagnostic ===');
  console.log(JSON.stringify(await call('GET', `/api/curricula/${CURRICULUM_ID}/has-diagnostic`)));

  // STEP 3: diagnostic submit (one correct, one wrong)
  console.log('\n=== POST /api/diagnostic/submit ===');
  const diag = await call('POST', '/api/diagnostic/submit', {
    curriculum_id: CURRICULUM_ID,
    responses: [
      { concept_key: 'python_variable_types', item_id: '9064c3d9-c92f-4767-a1e0-fefa725db1e3', answer: { index: 0 } }, // correct
      { concept_key: 'python_for_loop', item_id: '3be57e89-4470-42c2-9548-bd47c6aeb155', answer: { index: 2 } }, // wrong (correct=0)
    ],
  });
  console.log(JSON.stringify(diag, null, 2));

  // STEP 4: assess submit — CORRECT answer (expect next_unit branch)
  console.log('\n=== POST /api/assess/submit (correct -> next_unit) ===');
  const correct = await call('POST', '/api/assess/submit', {
    item_id: '9064c3d9-c92f-4767-a1e0-fefa725db1e3',
    curriculum_id: CURRICULUM_ID,
    concept_key: 'python_variable_types',
    answer: { type: 'mcq', index: 0 },
  });
  console.log(JSON.stringify(correct, null, 2));

  // STEP 6: assess submit — WRONG answer (expect failure_type + retry/remediation branch)
  console.log('\n=== POST /api/assess/submit (wrong -> failure_type + branch) ===');
  const wrong = await call('POST', '/api/assess/submit', {
    item_id: '3be57e89-4470-42c2-9548-bd47c6aeb155',
    curriculum_id: CURRICULUM_ID,
    concept_key: 'python_for_loop',
    answer: { type: 'mcq', index: 2 },
  });
  console.log(JSON.stringify(wrong, null, 2));

  console.log('\n=== DONE ===');
})().catch((e) => { console.error('SCRIPT ERROR:', e); process.exit(1); });
