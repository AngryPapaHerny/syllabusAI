/* Verify /api/tutor SSE streaming via real session cookie. */
const fs = require('fs');
const path = require('path');
const { createServerClient } = require('@supabase/ssr');

const envPath = path.join(__dirname, '..', '.env.local');
for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2];
}
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const BASE = 'http://localhost:5000';
const CURRICULUM_ID = 'fea18341-9902-4b33-a61f-dc9c561a515c';

let jar = {};
const supabase = createServerClient(URL, ANON, {
  cookies: {
    getAll: () => Object.entries(jar).map(([name, value]) => ({ name, value })),
    setAll: (list) => list.forEach(({ name, value }) => { value === '' ? delete jar[name] : (jar[name] = value); }),
  },
});
const cookieHeader = () => Object.entries(jar).map(([n, v]) => `${n}=${encodeURIComponent(v)}`).join('; ');

(async () => {
  const { error } = await supabase.auth.signInWithPassword({ email: 'codingnplay@gmail.com', password: 'test1234' });
  if (error) { console.error('SIGNIN FAILED:', error.message); process.exit(1); }
  console.log('=== SIGNIN OK ===');

  const t0 = Date.now();
  const res = await fetch(BASE + '/api/tutor', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookieHeader() },
    body: JSON.stringify({
      curriculum_id: CURRICULUM_ID,
      concept_key: 'python_variable_types',
      messages: [{ role: 'user', content: '변수가 뭔지 한 문장으로 알려줘' }],
    }),
  });
  console.log('HTTP', res.status, 'content-type:', res.headers.get('content-type'));
  if (res.status !== 200) { console.log('BODY:', await res.text()); process.exit(1); }

  // read the stream
  let chunks = 0, bytes = 0, sample = '';
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks++;
    bytes += value.length;
    if (sample.length < 400) sample += dec.decode(value, { stream: true });
  }
  console.log(`STREAM ok: ${chunks} chunks, ${bytes} bytes, ${Date.now() - t0}ms`);
  console.log('SAMPLE (first ~400 chars):\n' + sample.slice(0, 400));
})().catch((e) => { console.error('SCRIPT ERROR:', e); process.exit(1); });
