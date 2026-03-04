// API Error Handler
export class APIError extends Error {
  constructor(
    public statusCode: number,
    public message: string,
    public details?: any
  ) {
    super(message);
    this.name = 'APIError';
  }
}

// Handle API errors consistently
export const handleAPIError = (error: any): APIError => {
  if (error.response) {
    // Server responded with error
    return new APIError(
      error.response.status,
      error.response.data?.message || 'An error occurred',
      error.response.data
    );
  } else if (error.request) {
    // Request made but no response
    return new APIError(0, 'No response from server', error);
  } else {
    // Error in request setup
    return new APIError(0, error.message || 'Unknown error', error);
  }
};

// Common HTTP error codes
export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  INTERNAL_SERVER_ERROR: 500,
  SERVICE_UNAVAILABLE: 503,
};

// Retry logic for failed requests
export const retryRequest = async (
  fn: () => Promise<any>,
  maxRetries: number = 3,
  delay: number = 1000
) => {
  let lastError = null;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt < maxRetries) {
        await new Promise((resolve) => setTimeout(resolve, delay * attempt));
      }
    }
  }
  
  throw lastError;
};

// Format error message for display
export const formatErrorMessage = (error: any): string => {
  if (error instanceof APIError) {
    return error.message;
  } else if (error.message) {
    return error.message;
  } else {
    return 'An unexpected error occurred';
  }
};
