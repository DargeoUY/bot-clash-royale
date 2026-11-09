process.env.DATABASE_URL ||= 'mysql://test:test@127.0.0.1:3306/test';
process.env.CR_API_KEY ||= 'test-api-key';
process.env.SESSION_SECRET ||= 'test-session-secret-'.repeat(3);
process.env.SIGNUP_TOKEN ||= 'test-signup-token-'.repeat(3);
process.env.BASE_URL = 'http://localhost:3000';
process.env.NODE_ENV = 'development';
