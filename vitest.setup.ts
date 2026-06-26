import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Supabase 클라이언트 모킹
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() => ({
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
    },
    from: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: null, error: null }),
  })),
}));

// Next.js headers/cookies 모킹
vi.mock('next/headers', () => ({
  cookies: vi.fn().mockReturnValue({
    get: vi.fn(),
    set: vi.fn(),
    delete: vi.fn(),
  }),
  headers: vi.fn().mockReturnValue(new Headers()),
}));

// 환경 변수 기본값
process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost:54321';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
process.env.ANTHROPIC_API_KEY = 'test-anthropic-key';
process.env.SANDBOX_API_URL = 'http://localhost:2000';
process.env.WORKER_SECRET = 'test-worker-secret';
process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000';
