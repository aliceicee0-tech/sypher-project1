import { describe, it, expect } from 'vitest';
import { User } from './User.js';
import { Collection } from './Collection.js';
import { Order } from './Order.js';
import { Project } from './Project.js';
import { Share } from './Share.js';
import { DeviceSignup } from './DeviceSignup.js';

// Helpers: read a field's definition off a Mongoose schema.
function field(schema, name) {
  return schema.path(name);
}
function enumValues(schema, name) {
  return field(schema, name)?.enumValues;
}
function defaultValue(schema, name) {
  return field(schema, name)?.defaultValue;
}

describe('models/User', () => {
  const { schema } = User;
  it('requires google_id + email', () => {
    expect(field(schema, 'google_id').isRequired).toBe(true);
    expect(field(schema, 'email').isRequired).toBe(true);
  });
  it('plan defaults to free with the expected enum', () => {
    expect(defaultValue(schema, 'plan')).toBe('free');
    expect(enumValues(schema, 'plan')).toEqual(['free', 'starter', 'pro', 'premium']);
  });
  it('status defaults to active and can be banned', () => {
    expect(defaultValue(schema, 'status')).toBe('active');
    expect(enumValues(schema, 'status')).toEqual(['active', 'banned']);
  });
  it('credits + usage.count default to 0', () => {
    expect(defaultValue(schema, 'credits')).toBe(0);
    expect(defaultValue(schema, 'usage.count')).toBe(0);
  });
});

describe('models/Collection', () => {
  const { schema } = Collection;
  it('requires a unique collection_id', () => {
    expect(field(schema, 'collection_id').isRequired).toBe(true);
  });
  it('title defaults to "Untitled collection"', () => {
    expect(defaultValue(schema, 'title')).toBe('Untitled collection');
  });
  it('tracks default to an empty array', () => {
    const d = defaultValue(schema, 'tracks');
    const resolved = typeof d === 'function' ? d() : d;
    expect(Array.isArray(resolved)).toBe(true);
    expect(resolved).toHaveLength(0);
  });
});

describe('models/Order', () => {
  const { schema } = Order;
  it('requires order_id, owner_uid, price_eur, method', () => {
    expect(field(schema, 'order_id').isRequired).toBe(true);
    expect(field(schema, 'owner_uid').isRequired).toBe(true);
    expect(field(schema, 'price_eur').isRequired).toBe(true);
    expect(field(schema, 'method').isRequired).toBe(true);
  });
  it('status defaults to pending with the lifecycle enum', () => {
    expect(defaultValue(schema, 'status')).toBe('pending');
    expect(enumValues(schema, 'status')).toEqual(['pending', 'paid', 'cancelled']);
  });
  it('item.type is plan | credits', () => {
    expect(enumValues(schema, 'item.type')).toEqual(['plan', 'credits']);
  });
  it('method is mvola | bank_transfer', () => {
    expect(enumValues(schema, 'method')).toEqual(['mvola', 'bank_transfer']);
  });
});

describe('models/Project', () => {
  const { schema } = Project;
  it('requires a unique project_id', () => {
    expect(field(schema, 'project_id').isRequired).toBe(true);
  });
  it('node types are the three generator/combiner/master kinds', () => {
    expect(enumValues(schema, 'nodes.type')).toEqual(['treblo_generator', 'combiner', 'master']);
  });
  it('settings bpm defaults to 120', () => {
    expect(defaultValue(schema, 'settings.bpm')).toBe(120);
  });
});

describe('models/Share', () => {
  const { schema } = Share;
  it('requires share_id, owner_id, audio_url', () => {
    expect(field(schema, 'share_id').isRequired).toBe(true);
    expect(field(schema, 'owner_id').isRequired).toBe(true);
    expect(field(schema, 'audio_url').isRequired).toBe(true);
  });
  it('duration defaults to 30', () => {
    expect(defaultValue(schema, 'duration')).toBe(30);
  });
});

describe('models/DeviceSignup', () => {
  const { schema } = DeviceSignup;
  it('requires device_id, ip, google_id', () => {
    expect(field(schema, 'device_id').isRequired).toBe(true);
    expect(field(schema, 'ip').isRequired).toBe(true);
    expect(field(schema, 'google_id').isRequired).toBe(true);
  });
  it('email defaults to empty string', () => {
    expect(defaultValue(schema, 'email')).toBe('');
  });
  it('defines the compound indexes (device+ip+createdAt, ip+createdAt)', () => {
    const idx = schema.indexes().map((i) => i[0]);
    expect(idx.some((k) => k.device_id && k.ip && k.createdAt)).toBe(true);
    expect(idx.some((k) => k.ip && k.createdAt && !k.device_id)).toBe(true);
  });
});
