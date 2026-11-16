const request = require('supertest');
const { createApp } = require('../src/app');

let app;
beforeEach(() => { const c = createApp(); c.repo.seedDemoData(); app = c.app; });

test('API-1 request without user header is rejected (401)', async () => {
  const res = await request(app).post('/api/lockouts').send({ equipmentId: 'e1' });
  expect(res.status).toBe(401);
});
test('API-2 POST /api/lockouts returns 201 and status endpoint shows LOCKED', async () => {
  const res = await request(app).post('/api/lockouts').set('x-user-id', 'w1').send({ equipmentId: 'e1' });
  expect(res.status).toBe(201);
  const st = await request(app).get('/api/equipment/e1/status').set('x-user-id', 'w1');
  expect(st.body.status).toBe('LOCKED');
});
test('API-3 unauthorized worker gets 403', async () => {
  const res = await request(app).post('/api/lockouts').set('x-user-id', 'w2').send({ equipmentId: 'e2' });
  expect(res.status).toBe(403);
});
test('API-4 release by non-owner is 403, by owner is 200', async () => {
  const lock = (await request(app).post('/api/lockouts').set('x-user-id', 'w1').send({ equipmentId: 'e1' })).body;
  expect((await request(app).post(`/api/lockouts/${lock.id}/release`).set('x-user-id', 'w2')).status).toBe(403);
  expect((await request(app).post(`/api/lockouts/${lock.id}/release`).set('x-user-id', 'w1')).status).toBe(200);
});
test('API-5 missing equipmentId is 400', async () => {
  const res = await request(app).post('/api/lockouts').set('x-user-id', 'w1').send({});
  expect(res.status).toBe(400);
});
