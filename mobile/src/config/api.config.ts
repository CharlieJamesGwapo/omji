// API Configuration
// Update this file with your production URLs after deployment

const ENV = {
  dev: {
    apiUrl: 'https://omji-backend.onrender.com/api/v1',
  },
  prod: {
    apiUrl: 'https://omji-backend.onrender.com/api/v1',
  },
};

const getEnvVars = () => {
  return ENV.prod;
};

export default getEnvVars();
