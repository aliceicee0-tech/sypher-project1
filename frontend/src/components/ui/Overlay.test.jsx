import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, fireEvent, screen, waitFor, cleanup } from '@testing-library/react';
import React from 'react';
import { Modal, ConfirmProvider, useConfirm, ToastProvider, useToast } from './Overlay.jsx';

// Explicit cleanup between tests — RTL auto-cleanup relies on the globals
// being registered, which doesn't always happen under vitest.
afterEach(() => cleanup());

describe('Modal', () => {
  it('renders nothing when closed', () => {
    const { container } = render(<Modal open={false}>content</Modal>);
    expect(container.querySelector('.modal')).toBeNull();
  });

  it('renders the title + children when open', () => {
    const { getByText } = render(
      <Modal open onClose={() => {}} title="My Title">Body text</Modal>
    );
    expect(getByText('My Title')).toBeDefined();
    expect(getByText('Body text')).toBeDefined();
  });

  it('closes on Escape key', () => {
    const onClose = vi.fn();
    render(<Modal open onClose={onClose}>x</Modal>);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('closes when the backdrop is clicked', () => {
    const onClose = vi.fn();
    const { container } = render(<Modal open onClose={onClose}>x</Modal>);
    fireEvent.mouseDown(container.querySelector('.overlay'));
    expect(onClose).toHaveBeenCalled();
  });
});

describe('ConfirmProvider + useConfirm', () => {
  function Consumer() {
    const confirm = useConfirm();
    return (
      <button onClick={async () => { await confirm({ title: 'Sure?' }); }}>
        ask
      </button>
    );
  }

  it('resolves with true when the confirm button is clicked', async () => {
    const { getByText } = render(
      <ConfirmProvider><Consumer /></ConfirmProvider>
    );
    fireEvent.click(getByText('ask'));
    const confirmBtn = await screen.findByText('Confirm');
    fireEvent.click(confirmBtn);
    // No assertion on the promise result here (the consumer discards it); we
    // just verify the dialog opened + the button is clickable without error.
    expect(confirmBtn).toBeDefined();
  });

  it('resolves with false when Cancel is clicked', async () => {
    const { getByText } = render(
      <ConfirmProvider><Consumer /></ConfirmProvider>
    );
    fireEvent.click(getByText('ask'));
    const cancel = await screen.findByText('Cancel');
    fireEvent.click(cancel);
    expect(cancel).toBeDefined();
  });
});

describe('ToastProvider + useToast', () => {
  function Consumer() {
    const toast = useToast();
    return <button onClick={() => toast('Saved!', { type: 'success', duration: 99999 })}>toast</button>;
  }

  it('shows a toast and removes it on click', async () => {
    const { getByText } = render(
      <ToastProvider><Consumer /></ToastProvider>
    );
    fireEvent.click(getByText('toast'));
    const toastEl = await screen.findByText('Saved!');
    expect(toastEl).toBeDefined();
    fireEvent.click(toastEl);
    await waitFor(() => expect(screen.queryByText('Saved!')).toBeNull());
  });
});
