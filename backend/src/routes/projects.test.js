import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';

vi.mock('dotenv', () => ({ default: { config: () => {} }, config: () => {} }));

const { app } = await import('../server.js');
const { authHeader } = await import('./testHelpers.js');

const UID = 'proj_user_1';

describe('/api/projects (auth required, owner-scoped)', () => {
  it('rejects unauthenticated listing', async () => {
    const res = await request(app).get('/api/projects');
    expect(res.status).toBe(401);
  });

  it('starts empty for a new user', async () => {
    const res = await request(app).get('/api/projects').set(authHeader(UID));
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('creates a project with default settings', async () => {
    const res = await request(app)
      .post('/api/projects')
      .set(authHeader(UID))
      .send({ title: 'My beat' });
    expect(res.status).toBe(201);
    expect(res.body.title).toBe('My beat');
    expect(res.body.project_id).toBeTruthy();
    expect(res.body.nodes).toEqual([]);
    expect(res.body.settings.bpm).toBe(120);
  });

  it('reads, updates and deletes a project', async () => {
    const create = await request(app)
      .post('/api/projects')
      .set(authHeader(UID))
      .send({ title: 'edit me' });
    const id = create.body.project_id;

    const get = await request(app).get(`/api/projects/${id}`).set(authHeader(UID));
    expect(get.status).toBe(200);

    const put = await request(app)
      .put(`/api/projects/${id}`)
      .set(authHeader(UID))
      .send({ title: 'edited', nodes: [{ id: 'n1', type: 'treblo_generator', data: {} }] });
    expect(put.status).toBe(200);
    expect(put.body.title).toBe('edited');
    expect(put.body.nodes).toHaveLength(1);

    const del = await request(app).delete(`/api/projects/${id}`).set(authHeader(UID));
    expect(del.status).toBe(204);

    const after = await request(app).get(`/api/projects/${id}`).set(authHeader(UID));
    expect(after.status).toBe(404);
  });

  it('forbids another owner from reading (404)', async () => {
    const create = await request(app)
      .post('/api/projects')
      .set(authHeader('proj_owner_a'))
      .send({ title: 'secret' });
    const get = await request(app)
      .get(`/api/projects/${create.body.project_id}`)
      .set(authHeader('proj_owner_b'));
    expect(get.status).toBe(404);
  });
});
