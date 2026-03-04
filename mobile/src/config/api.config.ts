// API Configuration
// Update this file with your production URLs after deployment

const ENV = {
  dev: {
    apiUrl: 'http://192.168.0.28:8080/api/v1',
  },
  prod: {
    apiUrl: 'https://your-backend.onrender.com/api/v1', // Update this after deploying to Render
  },
};

// Automatically use production in production builds
const getEnvVars = () => {
  if (__DEV__) {
    return ENV.dev;
  }
  return ENV.prod;
};

export default getEnvVars();
