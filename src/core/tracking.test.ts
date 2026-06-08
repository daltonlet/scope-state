import { proxyConfig } from '../config';
import { createAdvancedProxy, clearProxyCache } from './proxy';
import { trackDependencies, resetTracking } from './tracking';

function createStore<T extends object>(state: T) {
  resetTracking();
  clearProxyCache();
  return createAdvancedProxy(state);
}

describe('trackDependencies', () => {
  beforeEach(() => {
    resetTracking();
    clearProxyCache();
    proxyConfig.smartArrayTracking = true;
  });

  it('tracks full paths for nested property access', () => {
    const $ = createStore({ user: { name: 'Alice' } });

    const { paths } = trackDependencies(() => $.user.name);

    expect(paths).toContain('user');
    expect(paths).toContain('user.name');
    expect(paths).not.toContain('name');
  });

  it('tracks full paths for array index access without corruption', () => {
    const $ = createStore({
      guides: [
        { id: 'a', name: 'Alpha' },
        { id: 'b', name: 'Beta' },
        { id: 'c', name: 'Gamma' },
      ],
    });

    const { paths } = trackDependencies(() => $.guides[2].name);

    expect(paths).toContain('guides');
    expect(paths).toContain('guides.2');
    expect(paths).toContain('guides.2.name');
    expect(paths.some(p => p.includes('guides.0.id.1'))).toBe(false);
  });

  it('smart find retains only matched element paths', () => {
    const guides = Array.from({ length: 14 }, (_, i) => ({
      id: `guide-${i}`,
      is_favorite: i === 5,
    }));
    const $ = createStore({ guides });
    const targetId = 'guide-5';

    const { paths, value } = trackDependencies(
      () => $.guides.find(guide => guide.id === targetId)?.is_favorite ?? false
    );

    expect(value).toBe(true);
    expect(paths).toContain('guides');
    expect(paths).toContain('guides.5');
    expect(paths).toContain('guides.5.id');
    expect(paths).toContain('guides.5.is_favorite');

    for (let i = 0; i < 14; i++) {
      if (i === 5) continue;
      expect(paths.some(p => p.startsWith(`guides.${i}.`))).toBe(false);
    }

    expect(paths.some(p => p.includes('guides.length'))).toBe(false);
    expect(paths.some(p => p.match(/guides\.\d+\.id\.\d+/))).toBe(false);
  });

  it('find without smart tracking retains all visited id paths', () => {
    proxyConfig.smartArrayTracking = false;

    const guides = Array.from({ length: 6 }, (_, i) => ({
      id: `guide-${i}`,
      is_favorite: i === 5,
    }));
    const $ = createStore({ guides });
    const targetId = 'guide-5';

    const { paths } = trackDependencies(
      () => $.guides.find(guide => guide.id === targetId)?.is_favorite ?? false
    );

    for (let i = 0; i <= 5; i++) {
      expect(paths).toContain(`guides.${i}.id`);
    }
    expect(paths).toContain('guides.5.is_favorite');
    expect(paths.some(p => p.match(/guides\.\d+\.id\.\d+/))).toBe(false);
  });
});
