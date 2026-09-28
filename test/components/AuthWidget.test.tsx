import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import AuthWidget from '../../src/components/AuthWidget';
import * as firebaseAuth from 'firebase/auth';
import type { User } from 'firebase/auth';

// Mock Firebase dependencies (path relative to this test file)
vi.mock('../../src/utils/firebase', () => ({
  auth: {},
  googleProvider: {}
}));

vi.mock('firebase/auth', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual as object,
    signInWithPopup: vi.fn(),
    signOut: vi.fn(),
    getAuth: vi.fn(() => ({})),  // Add this line
  };
});

describe('AuthWidget', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders Sign In button when no user is logged in', () => {
    render(<AuthWidget user={null} />);
    expect(screen.getByText('Sign In')).toBeInTheDocument();
    expect(screen.queryByText('Logged In')).not.toBeInTheDocument();
  });

  it('renders User info and Logout when user is logged in', () => {
    const mockUser = {
      uid: '123',
      displayName: 'Test User',
      photoURL: 'http://example.com/photo.jpg',
      email: 'test@example.com'
    } as unknown as User;

    render(<AuthWidget user={mockUser} />);
    
    expect(screen.getByText('Test User')).toBeInTheDocument();
    expect(screen.getByTitle('Sign Out')).toBeInTheDocument();
    expect(screen.queryByText('Sign In')).not.toBeInTheDocument();
  });

  it('calls signInWithPopup when Continue with Google is clicked', async () => {
    render(<AuthWidget user={null} />);

    // First click opens the dropdown, revealing the Google button
    fireEvent.click(screen.getByText('Sign In'));
    const googleBtn = screen.getByText('Continue with Google');
    fireEvent.click(googleBtn);

    expect(firebaseAuth.signInWithPopup).toHaveBeenCalled();
  });

  it('calls signOut when Sign Out is clicked', async () => {
    const mockUser = { displayName: 'User' } as unknown as User;
    render(<AuthWidget user={mockUser} />);
    
    const logoutBtn = screen.getByTitle('Sign Out');
    fireEvent.click(logoutBtn);
    
    expect(firebaseAuth.signOut).toHaveBeenCalled();
  });
});