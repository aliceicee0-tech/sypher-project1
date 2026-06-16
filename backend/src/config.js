import dotenv from 'dotenv';

dotenv.config();

export const config = {
  port: process.env.PORT || 4000,
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',
  mongoUri: process.env.MONGODB_URI || 'mongodb://localhost:27017/musiblock',
  treblo: {
    apiKey: process.env.TREBLO_API_KEY || '',
    baseUrl: process.env.TREBLO_API_BASE_URL || 'https://api.treblo.com/v1',
  },
  jwtSecret: process.env.JWT_SECRET || 'dev_insecure_secret_change_me',
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID || '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    redirectUri:
      process.env.GOOGLE_REDIRECT_URI || 'http://localhost:4000/api/auth/google/callback',
  },
};

export const isGoogleConfigured = Boolean(config.google.clientId && config.google.clientSecret);

// When no key is set, the Treblo client runs in mock mode so the whole app
// works end-to-end before the real API is wired up.
export const isMockMode = !config.treblo.apiKey;
