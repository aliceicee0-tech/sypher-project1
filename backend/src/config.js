import dotenv from 'dotenv';

dotenv.config();

export const config = {
  port: process.env.PORT || 4000,
  mongoUri: process.env.MONGODB_URI || 'mongodb://localhost:27017/musiblock',
  treblo: {
    apiKey: process.env.TREBLO_API_KEY || '',
    baseUrl: process.env.TREBLO_API_BASE_URL || 'https://api.treblo.com/v1',
  },
};

// When no key is set, the Treblo client runs in mock mode so the whole app
// works end-to-end before the real API is wired up.
export const isMockMode = !config.treblo.apiKey;
