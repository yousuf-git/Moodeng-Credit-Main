import type { PayloadAction } from '@reduxjs/toolkit';
import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';

import { evaluateCreditProgression } from '@/lib/creditLeveling';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import type { Database } from '@/lib/supabase/types';
import { computePointsDelta } from '@/shared/points';
import { fetchUser } from '@/store/slices/authSlice';
import type { RootState } from '@/store/store';
import { type CreateLoanData, type Loan, type LoanState } from '@/types/loanTypes';
import { parseDateSafely } from '@/utils/dateFormatters';
import { toNumber } from '@/utils/decimalHelpers';

const supabaseClient = () => getSupabaseBrowserClient();

type LoanRow = Database['public']['Tables']['loans']['Row'];
type LoanInsert = Database['public']['Tables']['loans']['Insert'];
type LoanUpdate = Database['public']['Tables']['loans']['Update'];
export type LoanSideEffectError = {
   type: 'award_points' | 'loan_notification';
   message: string;
};

// Helper function to map Supabase loan row to frontend Loan type
const mapSupabaseLoanToLoan = (row: LoanRow): Loan => ({
   id: row.id,
   trackingId: row.tracking_id,
   borrowerWallet: row.borrower_wallet ?? undefined,
   lenderWallet: row.lender_wallet ?? undefined,
   borrowerUser: row.borrower_user_id ?? undefined,
   lenderUser: row.lender_user_id ?? undefined,
   loanAmount: row.loan_amount,
   repaidAmount: row.repaid_amount,
   totalRepaymentAmount: row.total_repayment_amount,
   reason: row.reason,
   loanStatus: row.loan_status,
   repaymentStatus: row.repayment_status,
   dueDate: row.due_date,
   coin: row.coin,
   hash: row.hash,
   createdAt: row.created_at,
   updatedAt: row.updated_at,
   fundedAt: row.funded_at ?? undefined
});

const initialState: LoanState = {
   loans: {
      gloans: [],
      floans: []
   },
   isLoading: false,
   error: null
};

export const createLoan = createAsyncThunk('loans/create', async (loanData: CreateLoanData) => {
   const supabase = supabaseClient();

   // Generate a unique tracking ID
   const trackingId = `LOAN-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

   const loanInsert: LoanInsert = {
      tracking_id: trackingId,
      borrower_wallet: loanData.borrowerWallet || null,
      borrower_user_id: loanData.borrowerUserId || null,
      lender_user_id: loanData.lenderUserId || null, // Use null instead of empty string to avoid FK violation
      loan_amount: loanData.loanAmount,
      total_repayment_amount: loanData.totalRepaymentAmount,
      reason: loanData.reason,
      due_date: loanData.dueDate,
      coin: 'USDC' // Only USDC transfers supported
   };

   const { data, error } = await supabase.from('loans').insert(loanInsert).select().single();

   if (error) {
      throw new Error(error.message);
   }

   if (!data) {
      throw new Error('Failed to create loan');
   }

   return mapSupabaseLoanToLoan(data);
});

export const fetchLoans = createAsyncThunk('loans/fetch', async () => {
   const supabase = supabaseClient();

   const { data, error } = await supabase.from('loans').select('*').order('created_at', { ascending: false });

   if (error) {
      throw new Error(error.message);
   }

   return (data || []).map(mapSupabaseLoanToLoan);
});

export const getLenderRepaidCount = createAsyncThunk('loans/getLenderRepaidCount', async (lenderUserId: string) => {
   const supabase = supabaseClient();

   const { count, error } = await supabase
      .from('loans')
      .select('*', { count: 'exact', head: true })
      .eq('lender_user_id', lenderUserId)
      .eq('repayment_status', 'REPAID');

   if (error) {
      throw new Error(error.message);
   }

   return count ?? 0;
});

export const getUserLoans = createAsyncThunk(
   'loans/getUserLoans',
   async ({ userId, username }: { userId?: string | null; username?: string | null }) => {
      const supabase = supabaseClient();

      let resolvedUserId = userId?.trim();
      //TODO: Check if we can remove the deprecated username lookup later
      if (!resolvedUserId && username) {
         const { data: profile, error: profileError } = await supabase
            .from('users')
            .select('id')
            .eq('username', username)
            .maybeSingle();

         if (profileError) {
            throw new Error(profileError.message);
         }

         resolvedUserId = profile?.id ?? undefined;
      }

      if (!resolvedUserId) {
         return [];
      }

      const { data, error } = await supabase
         .from('loans')
         .select('*')
         .or(`borrower_user_id.eq.${resolvedUserId},lender_user_id.eq.${resolvedUserId}`)
         .order('created_at', { ascending: false });

      if (error) {
         throw new Error(error.message);
      }

      return (data || []).map(mapSupabaseLoanToLoan);
   }
);

const loanSlice = createSlice({
   name: 'loans',
   initialState,
   reducers: {
      clearError: (state) => {
         state.error = null;
      },
      addLoan: (state, action: PayloadAction<Loan>) => {
         state.loans.floans.push(action.payload);
      },
      updateLoan: (state, action: PayloadAction<Loan>) => {
         const { id } = action.payload;
         const floanIndex = state.loans.floans.findIndex((loan) => loan.id === id);
         if (floanIndex !== -1) {
            state.loans.floans[floanIndex] = action.payload;
         }
         const gloanIndex = state.loans.gloans.findIndex((loan) => loan.id === id);
         if (gloanIndex !== -1) {
            state.loans.gloans[gloanIndex] = action.payload;
         }
      }
   },
   extraReducers: (builder) => {
      builder
         .addCase(createLoan.pending, (state) => {
            state.isLoading = true;
            state.error = null;
         })
         .addCase(createLoan.fulfilled, (state, action) => {
            state.isLoading = false;
            state.loans.floans.push(action.payload);
         })
         .addCase(createLoan.rejected, (state, action) => {
            state.isLoading = false;
            state.error = (action.error.message as string) || 'Failed to create loan';
         })
         .addCase(fetchLoans.pending, (state) => {
            state.isLoading = true;
            state.error = null;
         })
         .addCase(fetchLoans.fulfilled, (state, action) => {
            state.isLoading = false;
            state.loans.floans = action.payload;
         })
         .addCase(fetchLoans.rejected, (state, action) => {
            state.isLoading = false;
            state.error = (action.error.message as string) || 'Failed to fetch loans';
         })
         .addCase(getUserLoans.fulfilled, (state, action) => {
            state.loans.gloans = action.payload;
         })
         .addCase(getUserLoans.rejected, (state, action) => {
            state.error = (action.error.message as string) || 'Failed to fetch user loans';
         })
         .addCase(updateLoanStatus.fulfilled, (state, action) => {
            const updatedLoan = action.payload;
            const floanIndex = state.loans.floans.findIndex((loan) => loan.id === updatedLoan.id);
            if (floanIndex !== -1) {
               state.loans.floans[floanIndex] = updatedLoan;
            }
            const gloanIndex = state.loans.gloans.findIndex((loan) => loan.id === updatedLoan.id);
            if (gloanIndex !== -1) {
               state.loans.gloans[gloanIndex] = updatedLoan;
            }
         })
         .addCase(updateLoanStatus.rejected, (state, action) => {
            state.error = (action.error.message as string) || 'Failed to update loan';
         })
         .addCase(deleteLoan.fulfilled, (state, action) => {
            const deletedLoanId = action.payload;
            state.loans.floans = state.loans.floans.filter((loan) => loan.id !== deletedLoanId);
            state.loans.gloans = state.loans.gloans.filter((loan) => loan.id !== deletedLoanId);
         })
         .addCase(deleteLoan.rejected, (state, action) => {
            state.error = (action.error.message as string) || 'Failed to delete loan';
         });
   }
});

export const { clearError, addLoan, updateLoan } = loanSlice.actions;

export const updateLoanStatus = createAsyncThunk<
   Loan,
   {
      id: string;
      userId?: string | null;
      wallet?: string;
      repaymentStatus?: string;
      loanStatus?: string;
      repaidAmount?: number;
      hash?: string;
   },
   { fulfilledMeta: { sideEffectErrors: LoanSideEffectError[] } }
>(
   'loans/updateStatus',
   async (
      loanData,
      { dispatch, getState, fulfillWithValue }
   ) => {
      const supabase = supabaseClient();
      const { id, userId, wallet, repaymentStatus, loanStatus, repaidAmount, hash } = loanData;
      const sideEffectErrors: LoanSideEffectError[] = [];

      const updates: LoanUpdate = {};

      if (userId) {
         updates.lender_user_id = userId;
      }
      if (wallet) {
         updates.lender_wallet = wallet;
      }
      if (repaymentStatus) {
         updates.repayment_status = repaymentStatus as Database['public']['Enums']['repayment_status'];
      }
      if (loanStatus) {
         updates.loan_status = loanStatus as Database['public']['Enums']['loan_status'];
      }
      if (repaidAmount !== undefined) {
         updates.repaid_amount = repaidAmount;
      }
      if (loanStatus === 'Lent') {
         // Set funded_at timestamp when loan is funded
         updates.funded_at = new Date().toISOString();
      }
      if (hash) {
         // Fetch current loan to append the new hash
         const { data: currentLoan } = await supabase.from('loans').select('hash').eq('id', id).single();

         updates.hash = [...(currentLoan?.hash || []), hash];
      }

      const { data, error } = await supabase.from('loans').update(updates).eq('id', id).select().single();

      if (error) {
         throw new Error(error.message);
      }

      if (!data) {
         throw new Error('Failed to update loan');
      }

      if (loanStatus === 'Lent' && data.lender_user_id) {
         const pointsDelta = computePointsDelta(String(data.loan_amount));
         const pointsMetadata = {
            loan_id: data.id,
            loan_amount: String(data.loan_amount),
            loan_tracking_id: data.tracking_id,
            loan_funded_at: data.funded_at
         };

         const { error: pointsError } = await supabase.rpc('award_points', {
            user_id_input: data.lender_user_id,
            source_type_input: 'loan',
            source_id_input: data.id,
            event_type_input: 'funded',
            delta_input: pointsDelta.toString(),
            metadata_input: pointsMetadata
         });

         if (pointsError) {
            console.error('Failed to award points:', pointsError.message);
            sideEffectErrors.push({ type: 'award_points', message: pointsError.message });
         }
      }

      const isPaid = repaymentStatus === 'Paid' || data.repayment_status === 'Paid';
      if (isPaid && data.borrower_user_id && data.due_date) {
         const { data: borrower, error: borrowerError } = await supabase
            .from('users')
            .select('id, cs, is_world_id, credit_progression_paused')
            .eq('id', data.borrower_user_id)
            .single();

         if (borrowerError) {
            throw new Error(borrowerError.message);
         }

         if (borrower) {
            const { data: paidLoans, error: paidLoansError } = await supabase
               .from('loans')
               .select('loan_amount, repaid_amount, total_repayment_amount, due_date, updated_at')
               .eq('borrower_user_id', data.borrower_user_id)
               .eq('repayment_status', 'Paid');

            if (paidLoansError) {
               throw new Error(paidLoansError.message);
            }

            const cumulativeBorrowedAmount = (paidLoans ?? []).reduce((sum, loan) => {
               if (!loan.due_date || !loan.updated_at) {
                  return sum;
               }

               const repaid = toNumber(loan.repaid_amount ?? 0);
               const totalRepayment = toNumber(loan.total_repayment_amount ?? 0);
               const isFullyRepaid = totalRepayment > 0 ? repaid >= totalRepayment : repaid > 0;

               if (!isFullyRepaid) {
                  return sum;
               }

               const paidAt = parseDateSafely(loan.updated_at);
               const dueDate = parseDateSafely(loan.due_date);
               const isOnTime = paidAt.getTime() <= dueDate.getTime();

               return isOnTime ? sum + toNumber(loan.loan_amount ?? 0) : sum;
            }, 0);

            const creditEvaluation = evaluateCreditProgression({
               currentLimit: borrower.cs ?? 0,
               isVerified: borrower.is_world_id === 'ACTIVE',
               isPaused: borrower.credit_progression_paused ?? false,
               repaidAmount: data.repaid_amount,
               totalRepaymentAmount: data.total_repayment_amount,
               cumulativeBorrowedAmount,
               dueDate: data.due_date,
               paidAt: data.updated_at ?? new Date().toISOString()
            });

            const userUpdates: Database['public']['Tables']['users']['Update'] = {};

            if (creditEvaluation.shouldPause && !borrower.credit_progression_paused) {
               userUpdates.credit_progression_paused = true;
            }

            if (creditEvaluation.shouldLevelUp) {
               userUpdates.cs = creditEvaluation.nextLimit;
            }

            if (Object.keys(userUpdates).length > 0) {
               const { error: userUpdateError } = await supabase.from('users').update(userUpdates).eq('id', borrower.id);

               if (userUpdateError) {
                  throw new Error(userUpdateError.message);
               }

               const state = getState() as RootState;
               if (state.auth.user.id === borrower.id) {
                  await dispatch(fetchUser());
               }
            }
         }
      }

      if (loanStatus === 'Lent') {
         const { error: notificationError } = await supabase.functions.invoke('loan-funded-notification', {
            body: { loanId: id }
         });

         if (notificationError) {
            console.error('Failed to send funded notification:', notificationError.message);
            sideEffectErrors.push({ type: 'loan_notification', message: notificationError.message });
         }
      }

      return fulfillWithValue(mapSupabaseLoanToLoan(data), { sideEffectErrors });
   }
);

export const deleteLoan = createAsyncThunk('loans/delete', async (loanId: string) => {
   const supabase = supabaseClient();

   const { error } = await supabase.from('loans').delete().eq('id', loanId);

   if (error) {
      throw new Error(error.message);
   }

   return loanId;
});

export const getLoans = getUserLoans;

export default loanSlice.reducer;
