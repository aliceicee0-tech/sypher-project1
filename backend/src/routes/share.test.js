import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';

vi.mock('dotenv', () => ({ default: { config: () => {} }, config: () => {} }));

const { app } = await import('../server.js');
const { authHeader } = await import('./testHelpers.js');

describe('/api/share', () => {
  it('POST rejects unauthenticated requests', async () => {
    const res = await request(app).post('/api/share').send({ audio_url: 'x' });
    expect(res.status).toBe(401);
  });

  it('POST rejects a body without audio_url', async () => {
    const res = await request(app)
      .post('/api/share')
      .set(authHeader('share_user_1'))
      .send({ title: 'no url' });
    expect(res.status).toBe(400);
  });

  it('POST creates a public share link and returns its id', async () => {
    const res = await request(app)
      .post('/api/share')
      .set(authHeader('share_user_1'))
      .send({
        title: 'My track',
        prompt: 'cinematic',
        style_tags: ['orchestral'],
        duration: 60,
        audio_url: 'https://cdn/track.mp3',
      });
    expect(res.status).toBe(201);
    expect(res.body.id).toBeTruthy();
  });

  it('GET returns the public track payload by id (no auth needed)', async () => {
    const create = await request(app)
      .post('/api/share')
      .set(authHeader('share_user_1'))
      .send({ title: 'public', audio_url: 'https://cdn/pub.mp3' });
    const id = create.body.id;
    const get = await request(app).get(`/api/share/${id}`); // no auth header
    expect(get.status).toBe(200);
    expect(get.body.kind).toBe('track');
    expect(get.body.audio_url).toBe('https://cdn/pub.mp3');
    expect(get.body.id).toBe(id);
  });

  it('GET returns 404 for an unknown share id', async () => {
    const res = await request(app).get('/api/share/does-not-exist');
    expect(res.status).toBe(404);
  });
});
