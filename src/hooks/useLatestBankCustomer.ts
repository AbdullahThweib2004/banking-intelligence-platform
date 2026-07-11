import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { getLatestBankCustomer, type BankCustomerRecord } from '@/lib/bankCustomers';

/**
 * Tracks the most recently created bank_customers row, live. Used to show a
 * "the last customer added to the database has account number ..." hint in
 * flows (like New Assessment) that need a real, currently-valid account
 * number to test/use against.
 */
export function useLatestBankCustomer() {
  const [latest, setLatest] = useState<BankCustomerRecord | null>(null);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    const record = await getLatestBankCustomer();
    setLatest(record);
    setLoading(false);
  }, []);

  useEffect(() => {
    refetch();

    const channel = supabase
      .channel('bank-customers-latest')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'bank_customers' },
        () => refetch()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [refetch]);

  return { latest, loading, refetch };
}
