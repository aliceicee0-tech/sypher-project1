import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';

vi.mock('dotenv', () => ({ default: { config: () => {} }, config: () => {} }));

const { app } = await import('../server.js');
const { authHeader, adminAuthHeader } = await import('./testHelpers.js');

const UID = 'order_user_1';

describe('/api/orders', () => {
  it('rejects unauthenticated listing', async () => {
    const res = await request(app).get('/api/orders');
    expect(res.status).toBe(401);
  });

  it('rejects an invalid order item', async () => {
    const res = await request(app)
      .post('/api/orders')
      .set(authHeader(UID))
      .send({ kind: 'nonsense' });
    expect(res.status).toBe(400);
  });

  it('rejects a plan upgrade to free (free is not buyable)', async () => {
    const res = await request(app)
      .post('/api/orders')
      .set(authHeader(UID))
      .send({ kind: 'plan', plan: 'free', method: 'mvola' });
    expect(res.status).toBe(400);
  });

  it('creates a pending plan order with server-side pricing', async () => {
    const res = await request(app)
      .post('/api/orders')
      .set(authHeader(UID))
      .send({ kind: 'plan', plan: 'pro', method: 'mvola', payment_ref: 'TXN-1', payer_phone: '0341' });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('pending');
    expect(res.body.item.type).toBe('plan');
    expect(res.body.item.plan).toBe('pro');
    expect(res.body.price_eur).toBe(10); // pro price from config
    expect(res.body.order_id).toMatch(/^ord_/);
  });

  it('creates a pending credit-pack order', async () => {
    const res = await request(app)
      .post('/api/orders')
      .set(authHeader(UID))
      .send({ kind: 'credits', packId: 'pack_5', method: 'bank_transfer' });
    expect(res.status).toBe(201);
    expect(res.body.item.type).toBe('credits');
    expect(res.body.item.generations).toBe(5);
    expect(res.body.price_eur).toBe(2.99);
  });

  it('lists only the caller own orders', async () => {
    await request(app)
      .post('/api/orders')
      .set(authHeader(UID))
      .send({ kind: 'credits', packId: 'pack_15', method: 'mvola' });
    const res = await request(app).get('/api/orders').set(authHeader(UID));
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThanOrEqual(1);
    expect(res.body.every((o) => o.owner_uid === UID)).toBe(true);
  });

  it('the owner can cancel their own pending order', async () => {
    const create = await request(app)
      .post('/api/orders')
      .set(authHeader('order_cancel_user'))
      .send({ kind: 'credits', packId: 'pack_5', method: 'mvola' });
    const cancel = await request(app)
      .post(`/api/orders/${create.body.order_id}/cancel`)
      .set(authHeader('order_cancel_user'));
    expect(cancel.status).toBe(200);
    expect(cancel.body.status).toBe('cancelled');
  });

  it('a non-owner cannot cancel someone elses order', async () => {
    const create = await request(app)
      .post('/api/orders')
      .set(authHeader('order_owner_real'))
      .send({ kind: 'credits', packId: 'pack_5', method: 'mvola' });
    const cancel = await request(app)
      .post(`/api/orders/${create.body.order_id}/cancel`)
      .set(authHeader('order_owner_other'));
    expect(cancel.status).toBe(403);
  });

  it('admin can confirm (grant) a pending order', async () => {
    const create = await request(app)
      .post('/api/orders')
      .set(authHeader('order_grant_user'))
      .send({ kind: 'credits', packId: 'pack_5', method: 'mvola' });
    const confirm = await request(app)
      .post(`/api/orders/${create.body.order_id}/confirm`)
      .set(adminAuthHeader());
    expect(confirm.status).toBe(200);
    expect(confirm.body.status).toBe('paid');
  });

  it('admin confirm is idempotent on an already-paid order', async () => {
    const create = await request(app)
      .post('/api/orders')
      .set(authHeader('order_idemp_user'))
      .send({ kind: 'credits', packId: 'pack_5', method: 'mvola' });
    await request(app)
      .post(`/api/orders/${create.body.order_id}/confirm`)
      .set(adminAuthHeader());
    const again = await request(app)
      .post(`/api/orders/${create.body.order_id}/confirm`)
      .set(adminAuthHeader());
    expect(again.status).toBe(200);
  });

  it('admin-only listing requires an admin (non-admin gets 403)', async () => {
    const res = await request(app).get('/api/orders/admin/all').set(authHeader('order_non_admin'));
    expect(res.status).toBe(403);
  });

  it('admin can list all orders', async () => {
    const res = await request(app).get('/api/orders/admin/all').set(adminAuthHeader());
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});
