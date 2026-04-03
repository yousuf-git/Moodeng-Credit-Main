import { type ChangeEvent, type FormEvent, type MouseEvent, type RefObject, useCallback, useEffect, useMemo, useState } from 'react';

import { useConnectModal } from '@rainbow-me/rainbowkit';
import { AlertTriangle, HelpCircle, Search, X } from 'lucide-react';
import { useDispatch, useSelector } from 'react-redux';
import { useLocation } from 'react-router-dom';
import { useAccount } from 'wagmi';

import FilterSidebar from '@/components/filters/FilterSidebar';
import { useToast } from '@/components/ToastSystem/hooks/useToast';
import WorldIDVerification from '@/components/worldId/WorldIDVerification';

import { useClickOutside } from '@/hooks/useClickOutside';
import { usePagination } from '@/hooks/usePagination';
import { getEffectiveCreditLimit } from '@/lib/creditLeveling';
import { filterLoans, type LoanFilters } from '@/utils/loanFilters';

import { ALLOWED_CHAIN_ID } from '@/config/wagmiConfig';
import { fetchUser, fetchUserProfiles } from '@/store/slices/authSlice';
import { createLoan, fetchLoans, getLenderRepaidCount } from '@/store/slices/loanSlice';
import type { AppDispatch, RootState } from '@/store/store';
import { ERROR_CODES } from '@/types/errorCodes';
import { getToastKeyFromErrorCode } from '@/types/errorToastMapping';
import type { Loan } from '@/types/loanTypes';
import LoanRequestModal from '@/views/dashboard/components/LoanRequestModal';
import { RequestBoardFilterContextProvider } from '@/views/dashboard/components/RequestBoardFilterContext';
import SuccessModal from '@/views/dashboard/components/SuccessModal';
import UserCard from '@/views/dashboard/components/UserCard';
import LoadMoreButton from '@/views/profile/components/shared/LoadMoreButton';

const PLACEHOLDER_AVATAR =
   'https://hebbkx1anhila5yf.public.blob.vercel-storage.com/Chiaroscuro_lighting_illuminates_a_Chibi-style_SVG_logo_a_gray_and_light_pink_hippo__joyfully_jumping__thumbs_up__holding_a_gold_Japanese_Mon_coin.__Hayao_Miyazaki_inspired__deep_teal_hues__warm_candl-uvt0ZI3fogcgqDR4Y2gCSRZfq8QmtX.png';

const LENDER_NOTE_STORAGE_KEY = 'moodeng_lender_note_dismissed';

export default function Dashboard() {
   return (
      <RequestBoardFilterContextProvider>
         <Dashboard$ />
      </RequestBoardFilterContextProvider>
   );
}

function Dashboard$() {
   const pathname = useLocation().pathname;
   const dispatch = useDispatch<AppDispatch>();
   const account = useAccount();
   const { isConnected } = account;
   const { showToastByConfig } = useToast();
   const { openConnectModal } = useConnectModal();

   const [showModal, setShowModal] = useState(false);
   const [showPurple, setShowPurple] = useState(false);
   const [isSubmitting, setIsSubmitting] = useState(false);
   const [showFilters, setShowFilters] = useState(false);
   const [showLenderNote, setShowLenderNote] = useState(false);

   const user = useSelector((state: RootState) => state.auth.user);
   const userProfiles = useSelector((state: RootState) => state.auth.userProfiles);
   const isLoading = useSelector((state: RootState) => state.loans.isLoading);
   const showVerify = user?.isWorldId !== 'ACTIVE';
   const isBorrower = (user?.userRole ?? 'borrower') !== 'lender';
   const rawFloanRequests = useSelector((state: RootState) => state.loans?.loans?.floans);
   const floanRequests = useMemo(() => rawFloanRequests || [], [rawFloanRequests]);
   const [sortedLoans, setSortedLoans] = useState(floanRequests);

   const today = new Date().toISOString().split('T')[0];
   const borrowerUserId = user?.id || '';
   const lenderUserId = '';
   const [loanAmount, setLoanAmount] = useState('');
   const [totalRepaymentAmount, setTotalRepaymentAmount] = useState('');
   const [reason, setReason] = useState('');
   const [days, setDays] = useState('');
   const [customAmount, setCustomAmount] = useState('');
   const [searchLoan, setSearchLoan] = useState('');
   const effectiveCreditLimit = getEffectiveCreditLimit(user.cs, user.isWorldId === 'ACTIVE');

   const loanRequestModalRef = useClickOutside<HTMLDivElement>(() => setShowModal(false), showModal) as RefObject<HTMLDivElement>;
   const successModalRef = useClickOutside<HTMLDivElement>(() => setShowPurple(false), showPurple) as RefObject<HTMLDivElement>;

   const [filters, setFilters] = useState<LoanFilters>({
      amount: '',
      rate: '',
      date: null,
      loanTime: '',
      borrowType: [],
      network: [],
      search: '',
      sortBy: undefined
   });

   const clear = () => {
      setTotalRepaymentAmount('');
      setLoanAmount('');
      setReason('');
      setDays('');
   };

   const handleFiltersChange = (newFilters: Partial<LoanFilters>) => {
      setFilters((prev) => {
         const updated = { ...prev, ...newFilters };
         if ('date' in newFilters && newFilters.date !== null) updated.loanTime = '';
         if ('loanTime' in newFilters && newFilters.loanTime !== '') updated.date = null;
         return updated;
      });
   };

   const handleApplyLoanClick = (e: MouseEvent<HTMLButtonElement>) => {
      e.preventDefault();
      if (!isConnected) {
         openConnectModal?.();
         return;
      }
      if ((user.nal || 0) >= (user.mal || 0)) {
         showToastByConfig(getToastKeyFromErrorCode(ERROR_CODES.LOAN_LIMIT_REACHED));
         return;
      }
      setShowModal(true);
   };

   const handleCloseModal = useCallback(() => setShowModal(false), []);

   const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      if (isSubmitting) return;

      if (!isConnected) {
         openConnectModal?.();
         e.stopPropagation();
         return;
      }

      if ((user.nal || 0) >= (user.mal || 0)) {
         showToastByConfig(getToastKeyFromErrorCode(ERROR_CODES.LOAN_LIMIT_REACHED));
         return;
      }
      if (user.isWorldId !== 'ACTIVE') {
         showToastByConfig(getToastKeyFromErrorCode(ERROR_CODES.WORLDID_REQUIRED));
         return;
      }
      if (!user.walletAddress || user.walletAddress.trim() === '') {
         showToastByConfig(getToastKeyFromErrorCode(ERROR_CODES.WALLET_MISSING));
         return;
      }
      if (account.chain?.id !== ALLOWED_CHAIN_ID) {
         showToastByConfig(getToastKeyFromErrorCode(ERROR_CODES.NETWORK_REQUIRED));
         return;
      }
      if (!loanAmount || parseFloat(loanAmount) <= 0) {
         showToastByConfig(getToastKeyFromErrorCode(ERROR_CODES.LOAN_INVALID_AMOUNT));
         return;
      }
      if (parseFloat(loanAmount) > effectiveCreditLimit) {
         showToastByConfig(getToastKeyFromErrorCode(ERROR_CODES.LOAN_AMOUNT_EXCEEDS_LIMIT));
         return;
      }

      const loanData = {
         borrowerUserId: borrowerUserId || '',
         borrowerWallet: user.walletAddress,
         lenderUserId,
         loanAmount: parseFloat(loanAmount),
         totalRepaymentAmount: parseFloat(totalRepaymentAmount),
         reason,
         dueDate: days
      };

      if (
         user.isWorldId === 'ACTIVE' &&
         (user.nal || 0) < (user.mal || 0) &&
         parseFloat(loanAmount) <= effectiveCreditLimit &&
         parseFloat(loanAmount) > 0
      ) {
         setIsSubmitting(true);
         try {
            await dispatch(createLoan(loanData)).unwrap();
            clear();
            setShowPurple(true);
            setShowModal(false);
            try {
               await dispatch(fetchUser()).unwrap();
            } catch (error) {
               console.error('Error fetching user:', (error as Error).message || error);
            }
         } catch (error) {
            console.error('Error creating loan:', (error as Error).message || error);
         } finally {
            setIsSubmitting(false);
         }
      }
   };

   const handleDays = (e: ChangeEvent<HTMLInputElement>) => {
      const date = new Date(e.target.value);
      const utcDate = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0));
      setDays(utcDate.toISOString());
   };

   const dismissLenderNote = () => {
      setShowLenderNote(false);
      localStorage.setItem(LENDER_NOTE_STORAGE_KEY, 'true');
   };

   useEffect(() => {
      if (isBorrower || !user?.id) return;
      if (localStorage.getItem(LENDER_NOTE_STORAGE_KEY) === 'true') return;

      dispatch(getLenderRepaidCount(user.id))
         .unwrap()
         .then((count) => {
            if (count >= 2) setShowLenderNote(true);
         })
         .catch(() => undefined);
   }, [isBorrower, user?.id, dispatch]);

   useEffect(() => {
      if (typeof window !== 'undefined' && window.location.hash) {
         const element = document.getElementById(window.location.hash.replace('#', ''));
         if (element) element.scrollIntoView({ behavior: 'smooth' });
      }
   }, [pathname]);

   useEffect(() => {
      const loadLoans = async () => {
         try {
            const loans = await dispatch(fetchLoans()).unwrap();
            const borrowerUserIds = [...new Set(loans.map((loan: Loan) => loan.borrowerUser).filter(Boolean))] as string[];
            if (borrowerUserIds.length > 0) {
               await dispatch(fetchUserProfiles(borrowerUserIds)).unwrap();
            }
         } catch (error) {
            console.error('Error fetching data:', (error as Error).message || error);
         }
      };
      loadLoans();
   }, [dispatch]);

   const filteredLoans = useMemo(() => {
      const allFilters: LoanFilters = { ...filters, search: searchLoan, sortBy: filters.sortBy };
      return filterLoans(floanRequests, allFilters, customAmount, userProfiles);
   }, [filters, searchLoan, floanRequests, customAmount, userProfiles]);

   useEffect(() => {
      setSortedLoans(filteredLoans);
   }, [filteredLoans]);

   const { displayedItems: displayedLoans, displayedCount, totalCount, handleLoadMore } = usePagination({
      items: sortedLoans,
      resetDependencies: [filters, searchLoan]
   });

   const handleSuccessModalClose = useCallback(() => setShowPurple(false), []);

   const firstName = user?.username?.split(' ')[0] || user?.username || 'there';

   return (
      <>
         <div id="top" className="min-h-screen bg-md-neutral-200">
            <div className="max-w-[440px] mx-auto pb-8">
               {/* Header */}
               <div className="flex items-center justify-between px-md-5 py-md-3">
                  <div className="flex items-center gap-3">
                     <img src={PLACEHOLDER_AVATAR} alt="Profile" className="w-12 h-12 rounded-full object-cover" />
                     <div className="flex flex-col gap-1">
                        <p className="text-md-h5 font-semibold text-md-primary-2000">Hello, {firstName}</p>
                        {isBorrower ? (
                           <div className="flex items-center gap-2">
                              {showVerify ? (
                                 <>
                                    <span className="inline-flex items-center gap-1 px-md-1 py-md-0 bg-md-red-100 rounded-md-sm">
                                       <span className="w-3 h-3 rounded-full bg-md-red-800 flex items-center justify-center">
                                          <span className="text-white text-[8px] font-bold">!</span>
                                       </span>
                                       <span className="text-md-b3 font-semibold text-md-red-800">Not Verified</span>
                                    </span>
                                    <WorldIDVerification>
                                       {({ open }) => (
                                          <button onClick={open} className="text-md-b3 font-semibold text-md-primary-900 underline">
                                             {'Verify World ID >'}
                                          </button>
                                       )}
                                    </WorldIDVerification>
                                 </>
                              ) : (
                                 <span className="inline-flex items-center gap-1 px-md-1 py-md-0 bg-md-green-100 rounded-md-sm">
                                    <span className="w-3 h-3 rounded-full bg-md-green-900 flex items-center justify-center">
                                       <span className="text-white text-[8px] font-bold">&#10003;</span>
                                    </span>
                                    <span className="text-md-b3 font-semibold text-md-green-900">Verified</span>
                                 </span>
                              )}
                           </div>
                        ) : (
                           <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-md-primary-900 rounded-md-sm w-fit">
                              <span className="text-md-b3 font-semibold text-md-neutral-100 capitalize whitespace-nowrap">
                                 IOU {user?.cs?.toLocaleString() ?? '0'}
                              </span>
                           </span>
                        )}
                     </div>
                  </div>
                  <button className="shrink-0 w-12 h-12 bg-white rounded-full shadow-md-card flex items-center justify-center">
                     <HelpCircle className="w-6 h-6 text-md-primary-900" strokeWidth={1.5} />
                  </button>
               </div>

               {/* Content */}
               <div className="flex flex-col gap-5 px-md-4 py-md-3">
                  {/* Title */}
                  <div className="flex flex-col gap-1">
                     <h1 className="text-md-h3 font-semibold text-md-heading">Microloan Request Board</h1>
                     <p className="text-md-b2 font-medium text-md-neutral-700">
                        Browse requests posted on Moodeng, or jump right in and get verified to start borrowing in USDC.
                     </p>
                  </div>

                  {/* Apply Loan Card — borrower only */}
                  {isBorrower && (
                     <div className="bg-md-primary-100 border border-[#f0f0f0] rounded-md-lg p-4 relative overflow-hidden">
                        <div className="flex flex-col gap-4 relative z-10">
                           <div className="flex flex-col gap-1 max-w-[232px]">
                              <p className="text-md-h5 font-semibold text-md-heading">Need short-term support?</p>
                              <p className="text-md-b2 font-medium text-md-neutral-700">
                                 Borrow USDC to build trust and<br />unlock higher loan levels.
                              </p>
                           </div>
                           <button
                              onClick={handleApplyLoanClick}
                              className="bg-md-primary-1200 text-md-neutral-100 text-md-b1 font-semibold px-md-4 py-md-3 rounded-md-lg w-fit"
                           >
                              Apply For A Loan
                           </button>
                        </div>
                        <img
                           src="/hippos/thumb-up-right.png"
                           alt=""
                           className="absolute right-0 top-0 h-full object-contain pointer-events-none"
                        />
                     </div>
                  )}

                  {/* Browse Section */}
                  <div className="flex flex-col gap-5">
                     <div className="flex flex-col gap-4">
                        <p className="text-md-h5 font-semibold text-md-heading">Browse Latest Requests</p>
                        <div className="flex items-center gap-4">
                           {/* Search Bar */}
                           <div className="flex-1 bg-md-neutral-100 border border-md-neutral-600 rounded-[12px] shadow-md-card flex items-center gap-2.5 p-3">
                              <Search className="w-6 h-6 text-md-neutral-800" strokeWidth={1.5} />
                              <input
                                 value={searchLoan}
                                 onChange={(e) => setSearchLoan(e.target.value)}
                                 className="flex-1 bg-transparent text-md-b2 font-normal text-md-neutral-2000 placeholder:text-md-neutral-800 outline-none"
                                 placeholder="Search requests"
                                 type="search"
                              />
                           </div>
                           {/* Filter Button */}
                           <button
                              onClick={() => setShowFilters(!showFilters)}
                              className="shrink-0 border border-md-primary-1200 rounded-[12px] p-3 flex items-center justify-center"
                           >
                              <img src="/icons/filter.png" alt="Filter" className="w-6 h-6" />
                           </button>
                        </div>
                     </div>

                     {/* Important Note — lender only */}
                     {!isBorrower && showLenderNote && (
                        <div className="bg-[rgba(255,237,161,0.2)] rounded-md-lg flex items-start gap-4 px-4 py-[15px]">
                           <AlertTriangle className="w-5 h-5 shrink-0 text-md-yellow-700 mt-0.5" strokeWidth={2} />
                           <div className="flex-1 flex flex-col gap-1">
                              <p className="text-md-b3 font-semibold text-[#ae8c00]">IMPORTANT NOTE</p>
                              <p className="text-md-b3 font-normal text-black leading-[1.3]">
                                 Once lenders have issued three loans, a fee will be charged to their accounts. This fee helps maintain the
                                 platform's operational costs and ensures continued support for all users.
                              </p>
                           </div>
                           <button onClick={dismissLenderNote} className="shrink-0 mt-0.5">
                              <X className="w-6 h-6 text-md-neutral-1400" strokeWidth={2} />
                           </button>
                        </div>
                     )}

                     {/* Filters Sidebar (toggled) */}
                     {showFilters && (
                        <FilterSidebar
                           filters={filters}
                           onFiltersChange={handleFiltersChange}
                           customAmount={customAmount}
                           onCustomAmountChange={setCustomAmount}
                        />
                     )}

                     {/* Request Cards */}
                     <div className="flex flex-col gap-5">
                        {isLoading ? (
                           <div className="flex justify-center py-20">
                              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-md-primary-900" />
                           </div>
                        ) : displayedLoans && displayedLoans.length > 0 ? (
                           displayedLoans.map((loan) => <UserCard key={loan.id} {...loan} isBorrower={isBorrower} />)
                        ) : (
                           <div className="text-center py-20 text-md-neutral-1200 text-md-b2">No loan requests found.</div>
                        )}
                     </div>

                     {!isLoading && <LoadMoreButton currentCount={displayedCount} totalCount={totalCount} onLoadMore={handleLoadMore} />}
                  </div>
               </div>
            </div>
         </div>

         {isBorrower && (
            <>
               <LoanRequestModal
                  isOpen={showModal}
                  onClose={handleCloseModal}
                  showVerify={showVerify}
                  user={user}
                  loanAmount={loanAmount}
                  setLoanAmount={setLoanAmount}
                  totalRepaymentAmount={totalRepaymentAmount}
                  setTotalRepaymentAmount={setTotalRepaymentAmount}
                  reason={reason}
                  setReason={setReason}
                  days={days}
                  today={today}
                  handleDays={handleDays}
                  handleSubmit={handleSubmit}
                  isSubmitting={isSubmitting}
                  clickOutsideRef={loanRequestModalRef}
               />
               <SuccessModal isOpen={showPurple} onClose={handleSuccessModalClose} clickOutsideRef={successModalRef} />
            </>
         )}
      </>
   );
}
