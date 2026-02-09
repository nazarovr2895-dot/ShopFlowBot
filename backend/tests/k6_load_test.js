// k6 load test script
// Run: k6 run k6_load_test.js

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate } from 'k6/metrics';

// Custom metrics
const errorRate = new Rate('errors');

// Test configuration
export const options = {
  stages: [
    { duration: '2m', target: 100 },  // Ramp up to 100 users
    { duration: '5m', target: 100 },  // Stay at 100 users
    { duration: '2m', target: 200 },   // Ramp up to 200 users
    { duration: '5m', target: 200 },   // Stay at 200 users
    { duration: '2m', target: 0 },     // Ramp down to 0 users
  ],
  thresholds: {
    http_req_duration: ['p(95)<500', 'p(99)<1000'], // 95% of requests < 500ms, 99% < 1s
    http_req_failed: ['rate<0.01'],                  // Error rate < 1%
    errors: ['rate<0.01'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:8000';

export default function () {
  // Get list of sellers
  let res = http.get(`${BASE_URL}/public/sellers?page=1&per_page=20`);
  let success = check(res, {
    'status is 200': (r) => r.status === 200,
    'response time < 500ms': (r) => r.timings.duration < 500,
  });
  errorRate.add(!success);
  sleep(1);

  // Get seller details (if we have sellers)
  if (res.status === 200) {
    let data = JSON.parse(res.body);
    if (data.sellers && data.sellers.length > 0) {
      let sellerId = data.sellers[0].id;
      res = http.get(`${BASE_URL}/public/sellers/${sellerId}`);
      success = check(res, {
        'status is 200': (r) => r.status === 200,
        'response time < 500ms': (r) => r.timings.duration < 500,
      });
      errorRate.add(!success);
      sleep(1);
    }
  }

  // Health check
  res = http.get(`${BASE_URL}/health`);
  success = check(res, {
    'status is 200': (r) => r.status === 200,
    'health check is healthy': (r) => {
      let data = JSON.parse(r.body);
      return data.status === 'healthy';
    },
  });
  errorRate.add(!success);
  sleep(1);
}

export function handleSummary(data) {
  return {
    'stdout': textSummary(data, { indent: ' ', enableColors: true }),
    'summary.json': JSON.stringify(data),
  };
}
