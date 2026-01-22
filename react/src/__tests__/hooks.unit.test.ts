import { describe, test, expect, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useQuery, useMutation } from '../hooks.js';

describe('React Hooks', () => {
  describe('useQuery', () => {
    test('useQuery returns data and loading state', async () => {
      const mockData = { id: 1, name: 'Test' };
      const queryFn = vi.fn().mockResolvedValue(mockData);

      const { result } = renderHook(() => useQuery(queryFn));

      // Initially loading
      expect(result.current.loading).toBe(true);
      expect(result.current.data).toBeUndefined();
      expect(result.current.error).toBeUndefined();

      // Wait for query to complete
      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.data).toEqual(mockData);
      expect(result.current.error).toBeUndefined();
      expect(queryFn).toHaveBeenCalledTimes(1);
    });

    test('useQuery refetches on deps change', async () => {
      const mockData1 = { id: 1, name: 'First' };
      const mockData2 = { id: 2, name: 'Second' };
      const queryFn = vi.fn()
        .mockResolvedValueOnce(mockData1)
        .mockResolvedValueOnce(mockData2);

      let dep = 'first';
      const { result, rerender } = renderHook(
        () => useQuery(queryFn, [dep])
      );

      // Wait for initial query
      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.data).toEqual(mockData1);
      expect(queryFn).toHaveBeenCalledTimes(1);

      // Change dependency
      dep = 'second';
      rerender();

      // Should refetch
      await waitFor(() => {
        expect(result.current.data).toEqual(mockData2);
      });

      expect(queryFn).toHaveBeenCalledTimes(2);
    });

    test('useQuery handles errors', async () => {
      const error = new Error('Query failed');
      const queryFn = vi.fn().mockRejectedValue(error);

      const { result } = renderHook(() => useQuery(queryFn));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.data).toBeUndefined();
      expect(result.current.error).toEqual(error);
    });

    test('useQuery refetch manually triggers new query', async () => {
      const mockData1 = { id: 1, name: 'First' };
      const mockData2 = { id: 2, name: 'Refetched' };
      const queryFn = vi.fn()
        .mockResolvedValueOnce(mockData1)
        .mockResolvedValueOnce(mockData2);

      const { result } = renderHook(() => useQuery(queryFn));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.data).toEqual(mockData1);

      // Manual refetch
      act(() => {
        result.current.refetch();
      });

      await waitFor(() => {
        expect(result.current.data).toEqual(mockData2);
      });

      expect(queryFn).toHaveBeenCalledTimes(2);
    });
  });

  describe('useMutation', () => {
    test('useMutation returns mutate function', async () => {
      const mockResult = { id: 1, created: true };
      const mutationFn = vi.fn().mockResolvedValue(mockResult);

      const { result } = renderHook(() => useMutation(mutationFn));

      expect(result.current.loading).toBe(false);
      expect(result.current.error).toBeUndefined();
      expect(typeof result.current.mutate).toBe('function');

      let mutationResult: typeof mockResult | undefined;
      await act(async () => {
        mutationResult = await result.current.mutate({ name: 'Test' });
      });

      expect(mutationResult).toEqual(mockResult);
      expect(mutationFn).toHaveBeenCalledWith({ name: 'Test' });
      expect(result.current.loading).toBe(false);
    });

    test('useMutation handles errors', async () => {
      const error = new Error('Mutation failed');
      const mutationFn = vi.fn().mockRejectedValue(error);

      const { result } = renderHook(() => useMutation(mutationFn));

      await act(async () => {
        try {
          await result.current.mutate({ name: 'Test' });
        } catch {
          // Expected error
        }
      });

      expect(result.current.error).toEqual(error);
      expect(result.current.loading).toBe(false);
    });

    test('useMutation sets loading during mutation', async () => {
      let resolvePromise: (value: { success: boolean }) => void;
      const mutationPromise = new Promise<{ success: boolean }>((resolve) => {
        resolvePromise = resolve;
      });
      const mutationFn = vi.fn().mockReturnValue(mutationPromise);

      const { result } = renderHook(() => useMutation(mutationFn));

      expect(result.current.loading).toBe(false);

      let mutationPromiseReturned: Promise<{ success: boolean }>;
      act(() => {
        mutationPromiseReturned = result.current.mutate({ name: 'Test' });
      });

      // Should be loading during mutation
      expect(result.current.loading).toBe(true);

      await act(async () => {
        resolvePromise!({ success: true });
        await mutationPromiseReturned;
      });

      expect(result.current.loading).toBe(false);
    });

    test('useMutation clears error on new mutation', async () => {
      const error = new Error('First mutation failed');
      const successResult = { id: 1, success: true };
      const mutationFn = vi.fn()
        .mockRejectedValueOnce(error)
        .mockResolvedValueOnce(successResult);

      const { result } = renderHook(() => useMutation(mutationFn));

      // First mutation fails
      await act(async () => {
        try {
          await result.current.mutate({ name: 'Test1' });
        } catch {
          // Expected error
        }
      });

      expect(result.current.error).toEqual(error);

      // Second mutation succeeds - error should be cleared
      await act(async () => {
        await result.current.mutate({ name: 'Test2' });
      });

      expect(result.current.error).toBeUndefined();
    });
  });
});
