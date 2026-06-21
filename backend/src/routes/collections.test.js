import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';

vi.mock('dotenv', () => ({ default: { config: () => {} }, config: () => {} }));

const { app } = await import('../server.js');
const { authHeader } = await import('./testHelpers.js');

const UID = 'col_user_1';

describe('/api/collections (auth required, owner-scoped)', () => {
  it('rejects unauthenticated listing', async () => {
    const res = await request(app).get('/api/collections');
    expect(res.status).toBe(401);
  });

  it('starts empty for a new user', async () => {
    const res = await request(app).get('/api/collections').set(authHeader(UID));
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('creates a collection with the given title', async () => {
    const res = await request(app)
      .post('/api/collections')
      .set(authHeader(UID))
      .send({ title: 'Chill mix' });
    expect(res.status).toBe(201);
    expect(res.body.title).toBe('Chill mix');
    expect(res.body.collection_id).toBeTruthy();
    expect(res.body.tracks).toEqual([]);
  });

  it('lists the created collection', async () => {
    const res = await request(app).get('/api/collections').set(authHeader(UID));
    expect(res.status).toBe(200);
    expect(res.body.some((c) => c.title === 'Chill mix')).toBe(true);
  });

  it('reads a single owned collection', async () => {
    const create = await request(app)
      .post('/api/collections')
      .set(authHeader(UID))
      .send({ title: 'Solo read' });
    const get = await request(app)
      .get(`/api/collections/${create.body.collection_id}`)
      .set(authHeader(UID));
    expect(get.status).toBe(200);
    expect(get.body.title).toBe('Solo read');
  });

  it('renames a collection via PUT', async () => {
    const create = await request(app)
      .post('/api/collections')
      .set(authHeader(UID))
      .send({ title: 'old name' });
    const put = await request(app)
      .put(`/api/collections/${create.body.collection_id}`)
      .set(authHeader(UID))
      .send({ title: 'new name' });
    expect(put.status).toBe(200);
    expect(put.body.title).toBe('new name');
  });

  it('rejects PUT with an empty title', async () => {
    const create = await request(app)
      .post('/api/collections')
      .set(authHeader(UID))
      .send({ title: 'x' });
    const put = await request(app)
      .put(`/api/collections/${create.body.collection_id}`)
      .set(authHeader(UID))
      .send({ title: '' });
    expect(put.status).toBe(400);
  });

  it('adds a track to a collection', async () => {
    const create = await request(app)
      .post('/api/collections')
      .set(authHeader(UID))
      .send({ title: 'with track' });
    const add = await request(app)
      .post(`/api/collections/${create.body.collection_id}/tracks`)
      .set(authHeader(UID))
      .send({ title: 'song', prompt: 'lofi', audio_url: 'https://cdn/x.mp3' });
    expect(add.status).toBe(201);
    expect(add.body.tracks).toHaveLength(1);
    expect(add.body.tracks[0].audio_url).toBe('https://cdn/x.mp3');
  });

  it('rejects adding a track without audio_url', async () => {
    const create = await request(app)
      .post('/api/collections')
      .set(authHeader(UID))
      .send({ title: 'no url' });
    const add = await request(app)
      .post(`/api/collections/${create.body.collection_id}/tracks`)
      .set(authHeader(UID))
      .send({ title: 'song' });
    expect(add.status).toBe(400);
  });

  it('removes a track, then deletes the collection', async () => {
    const create = await request(app)
      .post('/api/collections')
      .set(authHeader(UID))
      .send({ title: 'lifecycle' });
    const id = create.body.collection_id;
    const add = await request(app)
      .post(`/api/collections/${id}/tracks`)
      .set(authHeader(UID))
      .send({ audio_url: 'https://cdn/y.mp3' });
    const trackId = add.body.tracks[0].track_id;
    const rm = await request(app)
      .delete(`/api/collections/${id}/tracks/${trackId}`)
      .set(authHeader(UID));
    expect(rm.status).toBe(200);
    expect(rm.body.tracks).toHaveLength(0);

    const del = await request(app).delete(`/api/collections/${id}`).set(authHeader(UID));
    expect(del.status).toBe(204);
    const after = await request(app).get(`/api/collections/${id}`).set(authHeader(UID));
    expect(after.status).toBe(404);
  });

  it('forbids reading another owner collection (returns 404)', async () => {
    const create = await request(app)
      .post('/api/collections')
      .set(authHeader('col_owner_a'))
      .send({ title: 'private' });
    const get = await request(app)
      .get(`/api/collections/${create.body.collection_id}`)
      .set(authHeader('col_owner_b'));
    expect(get.status).toBe(404);
  });
});
