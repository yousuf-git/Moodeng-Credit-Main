import { type MouseEvent, useCallback, useState } from 'react';

import { useConnectModal } from '@rainbow-me/rainbowkit';
import { format, parseISO } from 'date-fns';
import { ChevronRight, ExternalLink, Send } from 'lucide-react';
import { useDispatch, useSelector } from 'react-redux';
import { Link } from 'react-router-dom';
import { useAccount } from 'wagmi';

import { TOAST_TYPES } from '@/components/ToastSystem/config/toastConfig';
import { useToast } from '@/components/ToastSystem/hooks/useToast';

import useWallet from '@/hooks/useWallet';

import { formatCurrency, formatNumber } from '@/utils/decimalHelpers';

import { ALLOWED_CHAIN_ID } from '@/config/wagmiConfig';
import { type LoanSideEffectError, fetchLoans, updateLoanStatus } from '@/store/slices/loanSlice';
import type { AppDispatch, RootState } from '@/store/store';
import { ERROR_CODES } from '@/types/errorCodes';
import { getToastKeyFromErrorCode } from '@/types/errorToastMapping';
import type { Loan } from '@/types/loanTypes';

export default function UserCard(loan: Loan & { isBorrower?: boolean }) {
   const { isBorrower = true, ...loanData } = loan;
   const borrowerUserId = loanData.borrowerUser || '';

   const dispatch = useDispatch<AppDispatch>();
   const { Transfer } = useWallet();
   const account = useAccount();
   const { isConnected } = account;
   const { openConnectModal } = useConnectModal();
   const [showModal, setShowModal] = useState(false);
   const [isProcessing, setIsProcessing] = useState(false);
   const { showToast, showToastByConfig } = useToast();
   const wallet = useSelector((state: RootState) => state.auth.user?.walletAddress);
   const username = useSelector((state: RootState) => state.auth.username);
   const userId = useSelector((state: RootState) => state.auth.user.id);
   const userProfiles = useSelector((state: RootState) => state.auth.userProfiles);
   const borrowerProfile = borrowerUserId ? userProfiles[borrowerUserId] : undefined;
   const borrowerUsername = borrowerProfile?.username ?? '';
   const borrowerDisplayName = borrowerUsername || 'Unknown user';
   const due = parseISO(loanData.dueDate);

   const handleFetch = async () => {
      setShowModal(false);
      await dispatch(fetchLoans())
         .unwrap()
         .then(() => console.log('Loan fetched successfully'))
         .catch((error: Error) => console.error('Error fetching loan:', error.message || error));
   };

   const executeLend = useCallback(async () => {
      if (isProcessing || loanData.loanStatus === 'Lent') return;

      if (loanData.borrowerUser === userId) {
         showToastByConfig(getToastKeyFromErrorCode(ERROR_CODES.LOAN_SELF_LENDING_NOT_ALLOWED));
         return;
      }

      const lenderWallet = account.address?.trim() || wallet?.trim();
      if (!lenderWallet) {
         showToastByConfig(getToastKeyFromErrorCode(ERROR_CODES.WALLET_MISSING));
         return;
      }

      const borrowerWallet = loanData.borrowerWallet?.trim();
      if (!borrowerWallet) {
         showToastByConfig(getToastKeyFromErrorCode(ERROR_CODES.WALLET_MISSING));
         return;
      }

      if (account.chain?.id !== ALLOWED_CHAIN_ID) {
         showToastByConfig(getToastKeyFromErrorCode(ERROR_CODES.NETWORK_REQUIRED));
         return;
      }

      const transferCoin = loanData.coin?.trim() || 'USDC';
      setIsProcessing(true);

      try {
         const transactionHash = await Transfer(borrowerWallet, formatNumber(loanData.loanAmount), loanData.id, transferCoin);

         if (transactionHash) {
            const loanPayload = {
               id: loanData.id,
               wallet: lenderWallet,
               userId,
               loanStatus: 'Lent',
               hash: transactionHash
            };

            const updateResult = await dispatch(updateLoanStatus(loanPayload));

            if (updateLoanStatus.fulfilled.match(updateResult)) {
               const sideEffectErrors = updateResult.meta.sideEffectErrors ?? [];
               setShowModal(true);

               if (sideEffectErrors.length === 0) {
                  showToast(
                     TOAST_TYPES.SUCCESS,
                     'Thank You!',
                     `You successfully funded $${formatCurrency(loanData.loanAmount)} to ${borrowerDisplayName}.`
                  );
               } else {
                  const errorDetails = sideEffectErrors
                     .map((error: LoanSideEffectError) =>
                        error.type === 'award_points'
                           ? `awarding points failed (${error.message})`
                           : `sending funded notification failed (${error.message})`
                     )
                     .join('; ');

                  showToast(
                     TOAST_TYPES.WARNING,
                     'Funded with Warnings',
                     `Loan funded successfully, but some follow-ups failed: ${errorDetails}.`
                  );
               }
            } else {
               const errorMessage = updateResult.error?.message ?? 'Unknown error';
               console.error('[CRITICAL] Lending transaction succeeded but database update failed:', errorMessage);
               showToast(TOAST_TYPES.ERROR, 'Funding Failed', `We could not update the loan in the database. Error: ${errorMessage}.`);
            }
         }
      } catch (transferError: unknown) {
         const errorMessage = transferError instanceof Error ? transferError.message : 'Unknown error';
         console.error('Transfer failed:', errorMessage);
         showToastByConfig(getToastKeyFromErrorCode(ERROR_CODES.TRANSACTION_FAILED));
      } finally {
         setIsProcessing(false);
      }
   }, [
      isProcessing,
      loanData.loanStatus,
      loanData.borrowerUser,
      loanData.borrowerWallet,
      loanData.coin,
      loanData.loanAmount,
      loanData.id,
      username,
      borrowerDisplayName,
      userId,
      account.address,
      account.chain?.id,
      wallet,
      Transfer,
      dispatch,
      showToast,
      showToastByConfig
   ]);

   const handleLend = async (e: MouseEvent<HTMLButtonElement>) => {
      e.preventDefault();
      if (!isConnected) {
         openConnectModal?.();
         return;
      }
      await executeLend();
   };

   const loanReason = loanData.reason?.trim() ? loanData.reason.trim() : 'Unknown Reason';
   const dueFormatted = format(due, 'MMM dd yyyy');
   const isOwnLoan = loanData.borrowerUser === userId;
   const isLent = loanData.loanStatus === 'Lent';

   return (
      <>
         <div className="bg-white border border-[#f0f0f0] rounded-[24px] shadow-[0px_11px_24px_0px_rgba(0,0,0,0.02)] flex flex-col gap-4 p-md-4">
            {/* Top: Loan Info + Amount Card */}
            <div className="flex gap-4 items-center">
               {/* Left: Loan Details */}
               <div className="flex-1 flex flex-col gap-2 min-w-0">
                  <p className="text-md-h5 font-semibold text-md-heading">{loanReason}</p>
                  <div className="flex items-center gap-2 flex-wrap">
                     <p className="text-md-b3 text-md-neutral-700">
                        <span>by </span>
                        {borrowerUsername ? (
                           <Link to={`/user/${borrowerUsername}`} className="text-[#d0588b] underline">
                              {borrowerDisplayName}
                           </Link>
                        ) : (
                           <span className="text-md-neutral-700">{borrowerDisplayName}</span>
                        )}
                     </p>
                     <span className="inline-flex items-center justify-center px-md-1 py-md-0 rounded-[30px] border border-md-green-600 bg-[rgba(0,134,36,0.05)]">
                        <span className="text-md-b4 font-semibold text-md-green-600">Good Standing</span>
                     </span>
                  </div>
                  {/* Network Badge */}
                  <img src="/icons/base-wallet.png" alt="Base" className="w-6 h-6 rounded-[3.4px]" />
                  {/* Due Date */}
                  <div className="flex items-center gap-1 text-md-b2 font-semibold">
                     <span className="text-[#585858]">Due On</span>
                     <span className="text-md-red-600">{dueFormatted}</span>
                  </div>
               </div>

               {/* Right: Amount Card */}
               <div className="shrink-0 w-[134px] bg-white border border-[#f0f0f0] rounded-[12px] p-3 flex flex-col gap-5 self-stretch justify-center">
                  <div className="flex flex-col gap-1">
                     <p className="text-md-b3 font-medium text-[#585858]">Borrowing USDC</p>
                     <p className="text-[20px] leading-[1.2] tracking-[-0.04em] font-semibold text-md-heading">
                        ${formatCurrency(loanData.loanAmount)}
                     </p>
                  </div>
                  <div className="flex flex-col gap-1">
                     <p className="text-md-b3 font-medium text-[#585858]">Get back USDC</p>
                     <p className="text-[20px] leading-[1.2] tracking-[-0.04em] font-semibold text-md-green-600">
                        ${formatCurrency(loanData.totalRepaymentAmount)}
                     </p>
                  </div>
               </div>
            </div>

            {/* CTA + Borrower Link */}
            <div className="flex flex-col gap-4">
               {isOwnLoan ? (
                  <div className="bg-md-neutral-500 text-md-neutral-1200 text-md-b1 font-semibold py-md-3 rounded-md-lg text-center cursor-not-allowed">
                     Your Loan Request
                  </div>
               ) : isLent ? (
                  <div className="bg-md-neutral-500 text-md-neutral-1200 text-md-b1 font-semibold py-md-3 rounded-md-lg text-center cursor-not-allowed">
                     Help Received
                  </div>
               ) : isBorrower ? (
                  <Link
                     to={`/loan/${loanData.id}`}
                     className="w-full bg-md-primary-1200 text-md-neutral-100 text-md-b1 font-semibold py-md-3 rounded-md-lg flex items-center justify-center gap-2"
                  >
                     View Request
                     <ChevronRight className="w-5 h-5" />
                  </Link>
               ) : (
                  <button
                     onClick={handleLend}
                     disabled={isProcessing}
                     type="button"
                     className="w-full bg-md-primary-1200 text-md-neutral-100 text-md-b1 font-semibold py-md-3 rounded-md-lg flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                     {isProcessing ? 'Processing...' : 'Send Your Help'}
                     {!isProcessing && <Send className="w-5 h-5" />}
                  </button>
               )}

               {borrowerUsername ? (
                  <Link
                     to={`/user/${borrowerUsername}`}
                     className="flex items-center justify-center gap-2 text-md-b2 font-semibold text-[#2154e8]"
                  >
                     View Borrower Details
                     <ExternalLink className="w-5 h-5" />
                  </Link>
               ) : (
                  <span className="flex items-center justify-center gap-2 text-md-b2 font-semibold text-md-neutral-800 cursor-not-allowed">
                     View Borrower Details
                     <ExternalLink className="w-5 h-5" />
                  </span>
               )}
            </div>
         </div>

         {/* Fund Success Modal */}
         {showModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
               <div className="bg-white rounded-2xl shadow-lg max-w-sm mx-auto flex flex-col overflow-hidden" style={{ minWidth: '320px' }}>
                  <div className="bg-gradient-to-r from-[#C55FFF] to-[#7B5FFF] px-6 py-4 flex items-center justify-between">
                     <h3 className="text-white font-bold text-lg">Funded</h3>
                     <button
                        onClick={handleFetch}
                        className="bg-white rounded-md px-2 py-1 text-[#7B5FFF] font-bold text-lg leading-none"
                        type="button"
                     >
                        X
                     </button>
                  </div>
                  <div className="p-6 flex flex-col items-center gap-4">
                     <div className="w-16 h-16 rounded-full bg-md-primary-900 flex items-center justify-center">
                        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                           <polyline points="20 6 9 17 4 12" />
                        </svg>
                     </div>
                     <p className="text-md-b1 font-semibold text-md-heading text-center">
                        You funded ${formatCurrency(loanData.loanAmount)} to {borrowerDisplayName}
                     </p>
                     <button
                        onClick={handleFetch}
                        className="w-full bg-md-primary-1200 text-white text-md-b1 font-semibold py-3 rounded-md-lg"
                        type="button"
                     >
                        Done
                     </button>
                  </div>
               </div>
            </div>
         )}
      </>
   );
}
