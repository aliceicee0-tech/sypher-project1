import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import Logo from './Logo.jsx';
import Equalizer from './Equalizer.jsx';

describe('Logo', () => {
  it('renders an accessible svg with the given title', () => {
    const { container } = render(<Logo size={48} title="My App" />);
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg.getAttribute('aria-label')).toBe('My App');
    expect(svg.getAttribute('width')).toBe('48');
    expect(container.querySelector('title').textContent).toBe('My App');
  });

  it('defaults to size 32 and the Melodia label', () => {
    const { container } = render(<Logo />);
    const svg = container.querySelector('svg');
    expect(svg.getAttribute('width')).toBe('32');
    expect(svg.getAttribute('aria-label')).toBe('Melodia');
  });
});

describe('Equalizer', () => {
  it('renders the requested number of bars with status role', () => {
    const { getByRole, container } = render(<Equalizer bars={4} />);
    const status = getByRole('status');
    expect(status.getAttribute('aria-label')).toBe('generating');
    expect(container.querySelectorAll('.eq__bar')).toHaveLength(4);
  });

  it('applies the size + className modifiers', () => {
    const { container } = render(<Equalizer size="lg" className="extra" />);
    const root = container.querySelector('.eq');
    expect(root.className).toContain('eq--lg');
    expect(root.className).toContain('extra');
  });
});
