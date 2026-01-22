/**
 * @evodb/react hooks - React hooks for data fetching and mutations
 */

import { useState, useEffect, useCallback, useRef } from 'react';

export interface UseQueryResult<T> {
  data: T | undefined;
  loading: boolean;
  error: Error | undefined;
  refetch: () => void;
}

export interface UseMutationResult<T, V> {
  mutate: (variables: V) => Promise<T>;
  loading: boolean;
  error: Error | undefined;
}

/**
 * Hook for fetching data with automatic loading state and refetch capabilities.
 *
 * @param queryFn - Async function that fetches the data
 * @param deps - Optional dependency array that triggers refetch when changed
 * @returns Object containing data, loading, error states and refetch function
 *
 * @example
 * ```tsx
 * const { data, loading, error, refetch } = useQuery(
 *   () => fetchUsers(),
 *   [userId]
 * );
 * ```
 */
export function useQuery<T>(
  queryFn: () => Promise<T>,
  deps?: unknown[]
): UseQueryResult<T> {
  const [data, setData] = useState<T | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | undefined>(undefined);
  const mountedRef = useRef(true);
  const fetchIdRef = useRef(0);

  const executeQuery = useCallback(async () => {
    const currentFetchId = ++fetchIdRef.current;
    setLoading(true);
    setError(undefined);

    try {
      const result = await queryFn();
      // Only update state if this is the latest fetch and component is still mounted
      if (mountedRef.current && currentFetchId === fetchIdRef.current) {
        setData(result);
        setLoading(false);
      }
    } catch (err) {
      // Only update state if this is the latest fetch and component is still mounted
      if (mountedRef.current && currentFetchId === fetchIdRef.current) {
        setError(err instanceof Error ? err : new Error(String(err)));
        setLoading(false);
      }
    }
  }, [queryFn]);

  const refetch = useCallback(() => {
    executeQuery();
  }, [executeQuery]);

  useEffect(() => {
    mountedRef.current = true;
    executeQuery();

    return () => {
      mountedRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps ?? []);

  return { data, loading, error, refetch };
}

/**
 * Hook for performing mutations with loading and error states.
 *
 * @param mutationFn - Async function that performs the mutation
 * @returns Object containing mutate function, loading and error states
 *
 * @example
 * ```tsx
 * const { mutate, loading, error } = useMutation(
 *   (user: CreateUserInput) => createUser(user)
 * );
 *
 * const handleSubmit = async () => {
 *   const result = await mutate({ name: 'John' });
 * };
 * ```
 */
export function useMutation<T, V>(
  mutationFn: (variables: V) => Promise<T>
): UseMutationResult<T, V> {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | undefined>(undefined);

  const mutate = useCallback(
    async (variables: V): Promise<T> => {
      setLoading(true);
      setError(undefined);

      try {
        const result = await mutationFn(variables);
        setLoading(false);
        return result;
      } catch (err) {
        const errorObj = err instanceof Error ? err : new Error(String(err));
        setError(errorObj);
        setLoading(false);
        throw errorObj;
      }
    },
    [mutationFn]
  );

  return { mutate, loading, error };
}
