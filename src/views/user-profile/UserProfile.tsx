import { useEffect, useState } from 'react';

import { Check, ChevronLeft, HelpCircle } from 'lucide-react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate, useParams } from 'react-router-dom';

import Loading from '@/components/Loading';
import { CREDIT_TIER_INCREMENT } from '@/config/creditTiers';
import { fetchUserProfiles, getUserProfile } from '@/store/slices/authSlice';
import { getUserLoans } from '@/store/slices/loanSlice';
import type { AppDispatch, RootState } from '@/store/store';
import type { User } from '@/types/authTypes';
import type { Loan } from '@/types/loanTypes';
import { formatDate, getMemberSinceText, parseDateSafely } from '@/utils/dateFormatters';
import { formatNumber, toNumber } from '@/utils/decimalHelpers';
import { calculateLenderDiversity, getDiversityStatus } from '@/utils/diversityScore';

const PLACEHOLDER_AVATAR =
   'https://hebbkx1anhila5yf.public.blob.vercel-storage.com/Chiaroscuro_lighting_illuminates_a_Chibi-style_SVG_logo_a_gray_and_light_pink_hippo__joyfully_jumping__thumbs_up__holding_a_gold_Japanese_Mon_coin.__Hayao_Miyazaki_inspired__deep_teal_hues__warm_candl-uvt0ZI3fogcgqDR4Y2gCSRZfq8QmtX.png';

const DIVERSITY_STYLES: Record<string, { border: string; text: string; bg: string }> = {
   Excellent: { border: 'border-md-green-600', text: 'text-md-green-600', bg: 'bg-[rgba(0,134,36,0.05)]' },
   Good: { border: 'border-md-blue-500', text: 'text-md-blue-500', bg: 'bg-[rgba(0,118,235,0.1)]' },
   Fair: { border: 'border-md-yellow-700', text: 'text-md-yellow-700', bg: 'bg-[rgba(211,170,0,0.05)]' },
   Low: { border: 'border-orange-400', text: 'text-orange-500', bg: 'bg-orange-50' },
   Poor: { border: 'border-md-red-500', text: 'text-md-red-500', bg: 'bg-red-50' }
};

const getDiversityBadgeStyle = (status: string) =>
   DIVERSITY_STYLES[status] ?? DIVERSITY_STYLES.Poor;

const UserProfile = () => {
   const dispatch = useDispatch<AppDispatch>();
   const navigate = useNavigate();
   const { username } = useParams();
   const [profileUser, setProfileUser] = useState<User | null>(null);

   const user = useSelector((state: RootState) => state.auth.user);
   const loans = useSelector((state: RootState) => state.loans.loans.gloans);
   const userProfiles = useSelector((state: RootState) => state.auth.userProfiles);
   const resolvedUser = profileUser ?? user;

   useEffect(() => {
      window.scrollTo(0, 0);
   }, []);

   useEffect(() => {
      if (!username) return;
      const loadProfile = async () => {
         try {
            const { user: fetchedUser } = await dispatch(getUserProfile(username)).unwrap();
            setProfileUser(fetchedUser);
            await dispatch(getUserLoans({ userId: fetchedUser.id })).unwrap();
         } catch (error) {
            console.error('Error fetching profile:', (error as Error).message || error);
         }
      };
      loadProfile();
   }, [dispatch, username]);

   useEffect(() => {
      const lenderUserIds = [...new Set(loans.map((loan) => loan.lenderUser).filter(Boolean))] as string[];
      if (lenderUserIds.length > 0) {
         dispatch(fetchUserProfiles(lenderUserIds)).catch(() => undefined);
      }
   }, [dispatch, loans]);

   if (!resolvedUser || !loans) return <Loading />;

   const memberSince = getMemberSinceText(resolvedUser.createdAt);
   const resolveUsername = (userId?: string | null) => (userId ? userProfiles[userId]?.username ?? userId : '');

   // --- Computed loan data ---

   const uniqueLoans: Loan[] = [];
   const seenAmounts = new Set<number>();
   for (const loan of loans) {
      const amt = toNumber(loan.loanAmount);
      if (amt % CREDIT_TIER_INCREMENT === 0 && !seenAmounts.has(amt)) {
         uniqueLoans.push(loan);
         seenAmounts.add(amt);
      }
   }

   const ignoredTier = new Set<number>();
   const trustBuildingLoans = loans.reduce((acc: Loan[], loan: Loan) => {
      const amt = toNumber(loan.loanAmount);
      const key = Math.floor(amt / CREDIT_TIER_INCREMENT) * CREDIT_TIER_INCREMENT;
      if (amt % CREDIT_TIER_INCREMENT === 0) {
         if (ignoredTier.has(key)) acc.push(loan);
         else ignoredTier.add(key);
      } else {
         acc.push(loan);
      }
      return acc;
   }, []);

   const countMap = loans.reduce<Record<string, number>>((acc, loan) => {
      const name = resolveUsername(loan.lenderUser) || 'Unknown';
      acc[name] = (acc[name] || 0) + 1;
      return acc;
   }, {});

   const sortedLoans = [...loans].sort(
      (a, b) => parseDateSafely(a.createdAt).getTime() - parseDateSafely(b.createdAt).getTime()
   );
   let totalDaysBetween = 0;
   for (let i = 1; i < sortedLoans.length; i++) {
      totalDaysBetween +=
         (parseDateSafely(sortedLoans[i].createdAt).getTime() - parseDateSafely(sortedLoans[i - 1].createdAt).getTime()) /
         (1000 * 3600 * 24);
   }
   const avgDays = sortedLoans.length > 1 ? Math.round(totalDaysBetween / (sortedLoans.length - 1)) : 0;

   const paidLoans = loans.filter((l) => l.repaymentStatus === 'Paid');
   const avgPaymentTime =
      paidLoans.length > 0
         ? Math.round(
              paidLoans.reduce((sum, l) => {
                 return sum + (parseDateSafely(l.updatedAt).getTime() - parseDateSafely(l.createdAt).getTime()) / (1000 * 3600 * 24);
              }, 0) / paidLoans.length
           )
         : 0;

   const usualLoanSize =
      loans.length > 0 ? Math.round(loans.reduce((sum, l) => sum + toNumber(l.loanAmount), 0) / loans.length) : 0;

   const avgLoanTerm =
      loans.length > 0
         ? Math.round(
              loans.reduce((sum, l) => {
                 return sum + (new Date(l.dueDate).getTime() - new Date(l.createdAt).getTime()) / (1000 * 3600 * 24);
              }, 0) / loans.length
           )
         : 0;

   const totalUniqueLenders = Object.keys(countMap).length;
   const repeatLenderCount = totalUniqueLenders - Object.values(countMap).filter((c) => c === 1).length;

   const lenderDiversity = calculateLenderDiversity(loans, userProfiles);
   const totalBorrowed = loans.reduce((sum, l) => (l.loanStatus === 'Lent' ? sum + toNumber(l.loanAmount) : sum), 0);
   const totalRepaid = loans.reduce((sum, l) => (l.repaymentStatus === 'Paid' ? sum + toNumber(l.loanAmount) : sum), 0);

   const creditLevel = Math.floor(resolvedUser.cs / CREDIT_TIER_INCREMENT);
   const creditMax = resolvedUser.cs;
   const creditProgress = creditMax > 0 ? Math.min((totalBorrowed / creditMax) * 100, 100) : 0;

   const diversityScore = lenderDiversity.score;
   const diversityStatus = getDiversityStatus(diversityScore);
   const badge = getDiversityBadgeStyle(diversityStatus);

   return (
      <div className="min-h-screen bg-md-neutral-200">
         <div className="max-w-[440px] mx-auto pb-8">
            {/* Header */}
            <div className="flex items-center justify-between px-md-5 py-md-3">
               <div className="flex-1 flex items-center gap-4">
                  <button onClick={() => navigate(-1)} className="shrink-0 w-6 h-6 flex items-center justify-center">
                     <ChevronLeft className="w-6 h-6 text-md-primary-2000" />
                  </button>
                  <h1 className="text-md-h3 font-semibold text-md-primary-2000">Borrower Insights</h1>
               </div>
               <button className="shrink-0 w-12 h-12 bg-white rounded-full shadow-md-card flex items-center justify-center">
                  <HelpCircle className="w-6 h-6 text-md-primary-900" strokeWidth={1.5} />
               </button>
            </div>

            {/* Body */}
            <div className="flex flex-col gap-5 px-md-4 py-md-3">
               {/* User Profile */}
               <div className="flex items-start gap-3">
                  <img src={PLACEHOLDER_AVATAR} alt="Profile" className="shrink-0 w-[70px] h-[70px] rounded-full object-cover" />
                  <div className="flex-1 flex flex-col gap-1 justify-center">
                     <p className="text-[18px] tracking-[-0.04em] leading-[1.2] font-semibold text-md-primary-2000">
                        {resolvedUser.username || username}
                     </p>
                     <div className="flex items-center">
                        <span className="inline-flex items-center gap-1 px-md-1 py-md-0 bg-md-green-100 rounded-md-sm">
                           <span className="w-3 h-3 rounded-full bg-md-green-900 flex items-center justify-center">
                              <Check className="w-2 h-2 text-white" strokeWidth={4} />
                           </span>
                           <span className="text-md-b3 font-semibold text-md-green-900 capitalize">Verified Borrower</span>
                        </span>
                     </div>
                     <p className="text-md-b3 font-normal text-md-neutral-1400">Member since {memberSince}</p>
                  </div>
               </div>

               {/* Credit Level */}
               <div className="flex flex-col gap-5">
                  <div className="flex items-center justify-between">
                     <div className="flex items-center gap-2">
                        <span className="text-md-h5 font-semibold text-md-heading">Credit Level</span>
                        <HelpCircle className="w-5 h-5 text-md-primary-900" strokeWidth={1.5} />
                     </div>
                     <button className="text-md-b2 font-semibold text-md-blue-600 underline">View Progress History</button>
                  </div>
                  <div className="flex flex-col gap-3">
                     <div className="flex items-center gap-2">
                        {/* LVL Badge */}
                        <div className="flex items-center">
                           <div className="w-[28px] h-[28px] rounded-full bg-md-neutral-500 flex items-center justify-center z-10">
                              <div className="w-4 h-4 rounded-full bg-md-neutral-1400" />
                           </div>
                           <div className="bg-md-neutral-500 rounded-md-sm flex items-center justify-end px-md-1 h-[22px] w-[58px] -ml-2">
                              <span className="font-knewave text-md-b2 text-md-neutral-1400 text-center">LVL {creditLevel}</span>
                           </div>
                        </div>
                        <div className="flex-1 flex items-center justify-end gap-1 text-md-b2">
                           <span className="font-semibold text-md-primary-800">${formatNumber(creditMax)}</span>
                           <span className="font-normal text-md-neutral-700">/ ${formatNumber(creditMax)}</span>
                        </div>
                     </div>
                     {/* Progress Bar */}
                     <div className="h-3 bg-md-neutral-100 rounded-md-pill overflow-hidden">
                        <div
                           className="h-full bg-md-primary-900 rounded-md-pill transition-all duration-500"
                           style={{ width: `${Math.max(creditProgress, 8)}%` }}
                        />
                     </div>
                  </div>
               </div>

               {/* Loan Summary */}
               <div className="flex flex-col gap-4">
                  <div className="flex items-center gap-4">
                     <span className="text-md-h5 font-semibold text-md-heading">Loan Summary</span>
                     <span className="inline-flex items-center justify-center px-md-1 py-md-0 rounded-[30px] border border-md-green-600 bg-[rgba(0,134,36,0.05)]">
                        <span className="text-md-b4 font-semibold text-md-green-600">Good Standing</span>
                     </span>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                     {/* Total Borrowed */}
                     <div className="bg-md-neutral-100 rounded-md-lg p-4 shadow-md-card flex flex-col gap-1">
                        <p className="text-md-b2 font-medium text-md-neutral-1500">Total Borrowed</p>
                        <p className="text-md-h3 font-semibold text-md-neutral-2000">${formatNumber(totalBorrowed)}</p>
                        <p className="text-md-b3 font-semibold text-md-green-700">${formatNumber(totalRepaid)} Repaid</p>
                        <p className="text-md-b3 text-md-neutral-1200">
                           <span className="font-semibold">0 </span>
                           <span className="font-normal">Defaults</span>
                        </p>
                     </div>

                     {/* Total Loans */}
                     <div className="bg-md-neutral-100 rounded-md-lg p-4 shadow-md-card flex flex-col gap-1 justify-center">
                        <div className="flex items-center gap-1">
                           <p className="text-md-b2 font-medium text-md-neutral-1500">Total Loans</p>
                           <HelpCircle className="w-4 h-4 text-md-primary-900" strokeWidth={1.5} />
                        </div>
                        <p className="text-md-h3 font-semibold text-md-neutral-2000">{loans.length}</p>
                        <div className="flex flex-col gap-1 text-md-b3 text-md-neutral-1200">
                           <p>
                              <span className="font-semibold">{uniqueLoans.length} </span>
                              <span className="font-normal">Credit Unlocking</span>
                           </p>
                           <p>
                              <span className="font-semibold">{trustBuildingLoans.length} </span>
                              <span className="font-normal">Trust Building</span>
                           </p>
                        </div>
                     </div>

                     {/* Lender Diversity Score */}
                     <div className="col-span-2 bg-md-neutral-100 rounded-md-lg p-md-4 border border-md-primary-100 flex flex-col gap-2.5">
                        <div className="flex items-center justify-between">
                           <p className="text-md-b1 font-semibold text-md-heading">Lender Diversity Score</p>
                           <button className="text-md-b2 font-semibold text-md-blue-600 underline">
                              {lenderDiversity.uniqueLenders} Unique {lenderDiversity.uniqueLenders === 1 ? 'Lender' : 'Lenders'}
                           </button>
                        </div>
                        <div className="flex items-center gap-4">
                           <p className="text-md-h4 font-semibold text-md-heading">{diversityScore} points</p>
                           <span className={`inline-flex items-center justify-center px-md-1 py-md-0 rounded-[30px] border ${badge.border} ${badge.bg}`}>
                              <span className={`text-md-b4 font-semibold ${badge.text}`}>{diversityStatus} Diversity</span>
                           </span>
                        </div>
                     </div>
                  </div>
               </div>

               {/* Borrower Insights */}
               <div className="flex flex-col gap-4">
                  <p className="text-md-h5 font-semibold text-md-heading">Borrower Insights</p>
                  <div className="bg-md-neutral-100 rounded-md-lg border border-md-primary-100 p-md-4 flex flex-col gap-2.5">
                     <InsightRow label="Avg days between loans" value={`${avgDays} days`} showHelp valueColor="text-md-primary-900" />
                     <InsightRow label="Typical payment time" value={`${avgPaymentTime} ${avgPaymentTime === 1 ? 'day' : 'days'}`} showHelp valueColor="text-md-primary-900" />
                     <InsightRow label="Usual loan size" value={`$${usualLoanSize}`} showHelp valueColor="text-md-primary-900" />
                     <InsightRow label="Typical loan term" value={`${avgLoanTerm} days`} valueColor="text-md-primary-2000" />
                     <InsightRow
                        label="Repeat lenders"
                        value={`${repeatLenderCount} of ${totalUniqueLenders}`}
                        showHelp
                        valueColor="text-md-red-500"
                     />
                  </div>
               </div>

               {/* Recent Loans */}
               <div className="flex flex-col gap-2">
                  <div className="flex flex-col gap-2">
                     <div className="flex items-center justify-between">
                        <span className="text-md-h5 font-semibold text-md-heading">Recent Loans</span>
                        <button className="text-md-b2 font-semibold text-md-blue-600 underline">View History</button>
                     </div>
                     <p className="text-md-b3 font-normal text-md-neutral-1500">
                        View who you've lent to and the status of each loan.
                     </p>
                  </div>
                  <div className="bg-white rounded-md-lg shadow-md-card py-4 px-3 flex flex-col gap-5">
                     {loans.slice(0, 5).map((loan: Loan) => (
                        <RecentLoanItem key={loan.id} loan={loan} resolveUsername={resolveUsername} />
                     ))}
                     {loans.length === 0 && <p className="text-md-b2 text-md-neutral-1200 text-center py-4">No loans yet</p>}
                  </div>
               </div>
            </div>
         </div>
      </div>
   );
};

const InsightRow = ({
   label,
   value,
   showHelp,
   valueColor
}: {
   label: string;
   value: string;
   showHelp?: boolean;
   valueColor: string;
}) => (
   <div className="flex items-center justify-between gap-5">
      <div className="flex items-center gap-1">
         <span className="text-md-b1 font-normal text-md-neutral-1400">{label}</span>
         {showHelp && <HelpCircle className="w-4 h-4 text-md-primary-900" strokeWidth={1.5} />}
      </div>
      <span className={`text-md-b2 font-semibold ${valueColor}`}>{value}</span>
   </div>
);

const RecentLoanItem = ({ loan, resolveUsername }: { loan: Loan; resolveUsername: (id?: string | null) => string }) => {
   const isPaid = loan.repaymentStatus === 'Paid';
   const lenderName = resolveUsername(loan.lenderUser) || 'Unknown';
   const lentDate = formatDate(loan.createdAt);

   return (
      <div className="flex items-start gap-2 py-md-0">
         <img src={PLACEHOLDER_AVATAR} alt="Avatar" className="shrink-0 w-12 rounded-full object-cover" />
         <div className="flex-1 min-w-0 flex flex-col gap-1">
            <p className="text-md-b1 font-semibold text-md-primary-2000 line-clamp-2">{loan.reason || 'Loan request'}</p>
            <div className="flex items-center gap-1 text-md-b3 text-md-neutral-1200">
               <span>Lent to {lenderName}</span>
               <span className="w-1 h-1 rounded-full bg-md-neutral-1200" />
               <span>{lentDate}</span>
            </div>
         </div>
         <div className="shrink-0 flex flex-col items-end gap-1">
            <p className="text-md-b1 font-semibold text-md-primary-2000 overflow-hidden text-ellipsis whitespace-nowrap">
               ${formatNumber(loan.loanAmount)}
            </p>
            {isPaid ? (
               <span className="inline-flex items-center gap-1 px-md-1 py-md-0 rounded-[24px] border border-md-primary-900 bg-[rgba(131,54,240,0.1)]">
                  <Check className="w-3 h-3 text-md-primary-900" strokeWidth={3} />
                  <span className="text-md-b4 font-semibold text-md-primary-900">REPAID</span>
               </span>
            ) : (
               <span className="inline-flex items-center gap-1 px-md-1 py-md-0 rounded-[24px] border border-md-green-700 bg-[rgba(31,193,107,0.1)]">
                  <span className="w-1.5 h-1.5 rounded-full bg-md-green-700" />
                  <span className="text-md-b4 font-semibold text-md-green-700">ACTIVE</span>
               </span>
            )}
         </div>
      </div>
   );
};

export default UserProfile;
