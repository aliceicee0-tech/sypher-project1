import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';

// Mock getPeaks so the waveform doesn't try to decode audio in jsdom.
vi.mock('../audio/peaks.js', () => ({
  getPeaks: vi.fn(async () => null), // null -> decorative fallback bars
}));

const Waveform = (await import('./Waveform.jsx')).default;

// jsdom returns zeros for getBoundingClientRect; give it a real width so the
// seek fraction math is testable.
function stubRect(width = 200) {
  Element.prototype.getBoundingClientRect = vi.fn(() => ({
    left: 0, top: 0, width, height: 40, right: width, bottom: 40, x: 0, y: 0, toJSON() {},
  }));
}

describe('Waveform', () => {
  it('renders a slider with the requested number of bars', () => {
    stubRect();
    const { getByRole, container } = render(
      <Waveform src="https://cdn/x.mp3" bars={8} progress={0} />
    );
    expect(getByRole('slider')).toBeDefined();
    expect(container.querySelectorAll('.waveform__bar')).toHaveLength(8);
  });

  it('fills bars left of the progress fraction', () => {
    stubRect();
    const { container } = render(
      <Waveform src="https://cdn/x.mp3" bars={10} progress={0.5} />
    );
    const bars = container.querySelectorAll('.waveform__bar');
    const filled = [...bars].filter((b) => b.className.includes('--filled'));
    expect(filled.length).toBeGreaterThanOrEqual(4); // ~half filled at 0.5
  });

  it('calls onSeek with the click fraction', () => {
    stubRect(200);
    const onSeek = vi.fn();
    const { getByRole } = render(
      <Waveform src="https://cdn/x.mp3" onSeek={onSeek} bars={4} />
    );
    const slider = getByRole('slider');
    // Click at clientX=100 on a 200px-wide bar -> fraction 0.5.
    fireEvent.pointerDown(slider, { clientX: 100 });
    expect(onSeek).toHaveBeenCalledWith(0.5);
  });

  it('arrow keys nudge the seek position', () => {
    stubRect();
    const onSeek = vi.fn();
    const { getByRole } = render(
      <Waveform src="https://cdn/x.mp3" onSeek={onSeek} bars={4} progress={0.5} />
    );
    const slider = getByRole('slider');
    fireEvent.keyDown(slider, { key: 'ArrowRight' });
    const rightCall = onSeek.mock.calls[onSeek.mock.calls.length - 1][0];
    expect(rightCall).toBeGreaterThan(0.5);
    fireEvent.keyDown(slider, { key: 'ArrowLeft' });
    const leftCall = onSeek.mock.calls[onSeek.mock.calls.length - 1][0];
    expect(leftCall).toBeLessThan(0.5);
  });
});
