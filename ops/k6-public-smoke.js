import http from 'k6/http';
import { check } from 'k6';

export const options = {
  vus: Number(__ENV.VUS || 10),
  duration: __ENV.DURATION || '15s',
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<1000'],
  },
};

export default function () {
  const response = http.get(__ENV.TARGET, {
    headers: { 'User-Agent': 'Tonatiuh-authorized-load-test/1.0' },
    tags: { target: __ENV.LABEL || 'public' },
  });
  check(response, { 'HTTP 200': (value) => value.status === 200 });
}
